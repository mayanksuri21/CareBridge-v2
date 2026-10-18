import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { createClientServer } from "../../../../lib/supabase/server";
import {
  JOIN_GRACE_AFTER_MS,
  getConsultationRoomName,
} from "../../../../lib/consultation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_TOKEN_TTL_SECONDS = 10 * 60;
const MAX_TOKEN_TTL_SECONDS = 2 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}



function withDoctorPrefix(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

async function resolveDisplayName(supabase, user, isDoctor) {
  if (isDoctor) {
    const { data } = await supabase.rpc("get_approved_doctor_by_id", {
      target_doctor_id: user.id,
    });
    const fullName = Array.isArray(data) ? data[0]?.full_name : null;
    return withDoctorPrefix(fullName) || "Doctor";
  }

  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = (data?.full_name || "").trim();
  if (fullName) return fullName;

  const meta = user.user_metadata || {};
  const metaName = meta.full_name || meta.name;
  if (metaName) return String(metaName);

  return user.email ? user.email.split("@")[0] : "Patient";
}

export async function POST(request) {
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

  const supabase = createClientServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail(401, "unauthenticated", "You must be signed in to join a consultation.");
  }

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

  const isPatient = appointment.patient_id === user.id;
  const isAssignedDoctor = appointment.doctor_id === user.id;

  if (!isPatient && !isAssignedDoctor) {
    return fail(403, "not_a_participant", "You are not a participant of this consultation.");
  }

  if (isAssignedDoctor) {
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

  if (appointment.status !== "confirmed") {
    return fail(409, "appointment_not_confirmed", "This consultation is not confirmed yet.");
  }

  const endsAt = new Date(appointment.ends_at).getTime();
  const now = Date.now();

  const roomName = getConsultationRoomName(appointment.id);

  const identity = user.id;
  const displayName = await resolveDisplayName(supabase, user, isAssignedDoctor);
  const doctorName = isAssignedDoctor
    ? displayName
    : await resolveDisplayName(supabase, { ...user, id: appointment.doctor_id }, true);

  const msRemaining = Math.max(
    endsAt + JOIN_GRACE_AFTER_MS - now,
    MIN_TOKEN_TTL_SECONDS * 1000
  );
  const ttlSeconds = Math.max(
    3600,
    Math.min(Math.ceil(msRemaining / 1000), MAX_TOKEN_TTL_SECONDS)
  );

  try {
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