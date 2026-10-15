import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClientServer } from "../../../../lib/supabase/server";

// livekit-server-sdk requires the Node.js runtime (it is not Edge-compatible),
// and this handler reads auth cookies, so it must always run dynamically.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A participant may request a token slightly before the slot begins and for a
// short grace period after it ends, to cover joining early / running over.
const JOIN_GRACE_BEFORE_MS = 15 * 60 * 1000; // 15 minutes before starts_at
const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000; // 30 minutes after ends_at

// Token lifetime bounds (the token only needs to cover the remaining window).
const MIN_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_TOKEN_TTL_SECONDS = 2 * 60 * 60; // 2 hours

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
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
  if (now < startsAt - JOIN_GRACE_BEFORE_MS) {
    return fail(409, "consultation_not_started", "This consultation has not started yet.");
  }
  if (now > endsAt + JOIN_GRACE_AFTER_MS) {
    return fail(409, "consultation_ended", "This consultation window has ended.");
  }

  // --- 7. Derive an opaque, stable room name (no PII) ----------------------
  const roomName = `consultation_${appointment.id}`;

  // Identity is the opaque user id only; no names or emails.
  const identity = user.id;

  // Keep the token short-lived: cover the remaining window plus reconnect room.
  const msRemaining = Math.max(
    endsAt + JOIN_GRACE_AFTER_MS - now,
    MIN_TOKEN_TTL_SECONDS * 1000
  );
  const ttlSeconds = Math.min(Math.ceil(msRemaining / 1000), MAX_TOKEN_TTL_SECONDS);

  // --- 8. Issue a room-scoped token ----------------------------------------
  try {
    const token = new AccessToken(apiKey, apiSecret, { identity, ttl: ttlSeconds });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    // Minimum connection data for the authorized caller only.
    return NextResponse.json({ token: jwt, url: livekitUrl, room: roomName });
  } catch {
    return fail(500, "token_generation_failed", "Could not create a consultation token.");
  }
}
