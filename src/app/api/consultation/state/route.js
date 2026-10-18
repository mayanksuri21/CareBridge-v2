import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { createClientServer } from "../../../../lib/supabase/server";
import {
  JOIN_GRACE_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
  getConsultationRoomName,
  getWaitingRoomName,
} from "../../../../lib/consultation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    return fail(500, "livekit_not_configured", "Video consultation service is not configured.");
  }

  const appointmentId = request.nextUrl.searchParams.get("appointmentId");

  if (typeof appointmentId !== "string" || !UUID_RE.test(appointmentId)) {
    return fail(400, "invalid_appointment_id", "A valid appointmentId is required.");
  }

  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "unauthenticated", "You must be signed in.");
  }

  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, status, starts_at, ends_at")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError || !appointment) {
    return fail(404, "appointment_not_found", "Appointment not found or you do not have access to it.");
  }

  const isPatient = appointment.patient_id === user.id;
  const isAssignedDoctor = appointment.doctor_id === user.id;

  if (!isPatient && !isAssignedDoctor) {
    return fail(403, "not_a_participant", "You are not a participant of this consultation.");
  }

  // Real admission check from DB
  const { data: admission } = await supabase
    .from("consultation_admissions")
    .select("appointment_id, admitted_at")
    .eq("appointment_id", appointment.id)
    .maybeSingle();

  const isAdmitted = Boolean(admission);

  // Fetch Patient Profile details for doctor display
  let patientName = "Patient";
  const { data: patientProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", appointment.patient_id)
    .maybeSingle();

  if (patientProfile?.full_name) {
    patientName = patientProfile.full_name;
  }

  const roomClient = new RoomServiceClient(toHttpHost(livekitUrl), apiKey, apiSecret);

  const payload = {
    role: isAssignedDoctor ? "doctor" : "patient",
    status: appointment.status,
    windowOpen: appointment.status === "confirmed",
    admitted: isAdmitted,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
  };

  if (isPatient) {
    const activeParticipants = await listParticipants(roomClient, getConsultationRoomName(appointment.id));
    const doctor = activeParticipants.find((p) => p.identity === appointment.doctor_id);
    payload.doctorPresent = Boolean(doctor);
    if (doctor?.name) payload.doctorName = doctor.name;
    // Patient is only admitted when Doctor actually admitted via DB record
    payload.admitted = isAdmitted;
  } else {
    const waitingRoomName = getWaitingRoomName(appointment.id);
    const waitingParticipants = await listParticipants(roomClient, waitingRoomName);
    const patientInWaiting = waitingParticipants.find((p) => p.identity === appointment.patient_id);

    // Patient waiting hai agar wo waiting room me connected hai aur admit nahi hua hai
    payload.patientWaiting = Boolean(patientInWaiting) && !isAdmitted;
    payload.patientName = patientName;
    payload.patientAdmitted = isAdmitted;
  }

  return NextResponse.json(payload);
}