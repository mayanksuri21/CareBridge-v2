import { NextResponse } from "next/server";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { createClientServer } from "../../../../lib/supabase/server";
import {
  JOIN_GRACE_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
  getConsultationRoomName,
  getWaitingRoomName,
} from "../../../../lib/consultation";

// livekit-server-sdk requires the Node.js runtime (it is not Edge-compatible),
// and this handler reads auth cookies, so it must always run dynamically.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token lifetime bounds (the token only needs to cover the remaining window).
const MIN_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

function toHttpHost(url) {
  return url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
}

async function listParticipants(roomClient, roomName) {
  try {
    const participants = await roomClient.listParticipants(roomName);
    return participants.map((p) => ({ identity: p.identity, name: p.name || "" }));
  } catch {
    return [];
  }
}

/**
 * Adds a "Dr." prefix only when the stored name does not already carry one.
 *
 * doctor_applications.full_name is free text and is commonly saved as
 * "Dr. Rahul Sharma". Prefixing unconditionally produced a doubled
 * "Dr. Dr. Rahul Sharma" on the video tile, in the waiting room, and in the
 * doctor-arrival alert.
 */
function withDoctorPrefix(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

/**
 * Resolves the participant's display name from trusted server-side records.
 * The browser never supplies it. Identity always stays the opaque user UUID.
 */
async function resolveDisplayName(supabase, user, isDoctor) {
  if (isDoctor) {
    // Reuses the existing SECURITY DEFINER helper; it returns a row only for
    // approved doctors, which the caller must already be at this point.
    const { data } = await supabase.rpc("get_approved_doctor_by_id", {
      target_doctor_id: user.id,
    });
    const fullName = Array.isArray(data) ? data[0]?.full_name : null;
    return withDoctorPrefix(fullName) || "Doctor";
  }

  // RLS on public.profiles lets a user read their own row.
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = (data?.full_name || "").trim();
  if (fullName) return fullName;

  // Fallback only when a name is genuinely unavailable (e.g. OAuth metadata
  // never landed in profiles and none of it is usable).
  const meta = user.user_metadata || {};
  const metaName = meta.full_name || meta.name;
  if (metaName) return String(metaName);

  return user.email ? user.email.split("@")[0] : "Patient";
}

/**
 * POST /api/consultation/token
 *
 * Body: { appointmentId: string }
 *
 * Issues a short-lived, room-scoped LiveKit token to the authenticated patient
 * or verified doctor assigned to a confirmed appointment that is currently within
 * its consultation window. No client-supplied identity, role, room, or status is
 * trusted; everything is re-derived server-side from the authenticated session
 * and the database.
 */
export async function POST(request) {
  // --- 1. Configuration (secrets stay server-side) --------------------------
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return fail(
      500,
      "livekit_not_configured",
      "Video consultation service is not configured."
    );
  }

  // --- 2. Validate the request body ----------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json", "Request body must be valid JSON.");
  }

  const appointmentId = body?.appointmentId;
  if (typeof appointmentId !== "string" || !UUID_RE.test(appointmentId)) {
    return fail(400, "invalid_appointment_id", "A valid appointmentId is required.");
  }

  // --- 3. Authenticate the caller (never trust a client-supplied user id) ---
  const supabase = createClientServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail(401, "unauthenticated", "You must be signed in to join a consultation.");
  }

  // --- 4. Load the appointment ---------------------------------------------
  // RLS on public.appointments already limits SELECT to the patient, the
  // assigned doctor, or an admin; we still re-check participation below.
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, status, starts_at, ends_at")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError) {
    return fail(500, "appointment_lookup_failed", "Could not load the appointment.");
  }
  if (!appointment) {
    return fail(
      404,
      "appointment_not_found",
      "Appointment not found or you do not have access to it."
    );
  }

  // --- 5. Authorize: patient of this appointment, or its verified doctor ----
  const isPatient = appointment.patient_id === user.id;
  const isAssignedDoctor = appointment.doctor_id === user.id;

  if (!isPatient && !isAssignedDoctor) {
    return fail(403, "not_a_participant", "You are not a participant of this consultation.");
  }

  if (isAssignedDoctor) {
    // Confirm the doctor is verified/approved using the existing SECURITY
    // DEFINER helper (returns a row only for 'approved' doctors).
    const { data: approved, error: approvedError } = await supabase.rpc(
      "get_approved_doctor_by_id",
      { target_doctor_id: user.id }
    );

    if (approvedError) {
      return fail(500, "doctor_verification_failed", "Could not verify the doctor account.");
    }
    if (!Array.isArray(approved) || approved.length === 0) {
      return fail(403, "doctor_not_verified", "Only verified doctors can join consultations.");
    }
  }

  // --- 6. Enforce status + consultation window -----------------------------
  if (appointment.status !== "confirmed") {
    return fail(409, "appointment_not_confirmed", "This consultation is not confirmed yet.");
  }

  const startsAt = new Date(appointment.starts_at).getTime();
  const endsAt = new Date(appointment.ends_at).getTime();
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    return fail(409, "appointment_time_missing", "This appointment has no valid scheduled time.");
  }

  const now = Date.now();
  // TEMPORARY FOR LIVEKIT TESTING:
  // Do not wait for the scheduled time window. As soon as the doctor Accepts & Confirms,
  // the doctor can start immediately, and the patient can join once the doctor is in the room.
  /*
  if (now < startsAt - JOIN_GRACE_BEFORE_MS) {
    return fail(409, "consultation_not_started", "This consultation has not started yet.");
  }
  if (now > endsAt + JOIN_GRACE_AFTER_MS) {
    return fail(409, "consultation_ended", "This consultation window has ended.");
  }
  */

  // --- 7. Derive opaque, stable room names (no PII) ------------------------
  const roomName = getConsultationRoomName(appointment.id);
  const waitingRoomName = getWaitingRoomName(appointment.id);

  // Identity is the opaque user id only; no names or emails.
  const identity = user.id;

  // Display name comes from trusted server-side records (never the browser).
  const displayName = await resolveDisplayName(supabase, user, isAssignedDoctor);
  const doctorName = isAssignedDoctor
    ? displayName
    : await resolveDisplayName(supabase, { ...user, id: appointment.doctor_id }, true);

  // Keep the token short-lived: cover the remaining window plus reconnect room.
  const msRemaining = Math.max(
    endsAt + JOIN_GRACE_AFTER_MS - now,
    MIN_TOKEN_TTL_SECONDS * 1000
  );
  // Guarantee at least 1 hour for testing
  const ttlSeconds = Math.max(
    3600,
    Math.min(Math.ceil(msRemaining / 1000), MAX_TOKEN_TTL_SECONDS)
  );

  try {
    // --- 8a. Waiting room (patients only, until the doctor admits them) ----
    // A patient who has not been admitted never receives a token for the active
    // room, so hiding the video UI is not what keeps them out — the server does.
    if (isPatient) {
      const { data: admission, error: admissionError } = await supabase
        .from("consultation_admissions")
        .select("appointment_id")
        .eq("appointment_id", appointment.id)
        .eq("patient_id", user.id)
        .maybeSingle();

      if (admissionError) {
        return fail(500, "admission_lookup_failed", "Could not verify your consultation access.");
      }

      // Check if doctor is present in the active consultation room
      const roomClient = new RoomServiceClient(toHttpHost(livekitUrl), apiKey, apiSecret);
      const activeParticipants = await listParticipants(roomClient, roomName);
      const isDoctorInRoom = activeParticipants.some((p) => p.identity === appointment.doctor_id);

      // FOR TESTING: If doctor has joined the room or patient is admitted, allow patient into active room!
      if (!admission && !isDoctorInRoom) {
        const waitingToken = new AccessToken(apiKey, apiSecret, {
          identity,
          name: displayName,
          ttl: ttlSeconds,
        });
        waitingToken.addGrant({
          roomJoin: true,
          room: waitingRoomName,
          canPublish: false,
          canSubscribe: false,
          canPublishData: false,
        });

        return NextResponse.json({
          status: "waiting",
          role: "patient",
          token: await waitingToken.toJwt(),
          url: livekitUrl,
          room: waitingRoomName,
          doctorName,
        });
      }
    }

    // --- 8b. Active consultation room -------------------------------------
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: displayName,
      ttl: ttlSeconds,
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    // Minimum connection data for the authorized caller only.
    return NextResponse.json({
      status: "admitted",
      role: isAssignedDoctor ? "doctor" : "patient",
      token: jwt,
      url: livekitUrl,
      room: roomName,
      doctorName,
    });
  } catch {
    return fail(500, "token_generation_failed", "Could not create a consultation token.");
  }
}
