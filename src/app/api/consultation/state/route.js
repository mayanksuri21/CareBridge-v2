import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { createClientServer } from "../../../../lib/supabase/server";
import {
  JOIN_GRACE_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
  getConsultationRoomName,
  getWaitingRoomName,
} from "../../../../lib/consultation";

// livekit-server-sdk needs the Node.js runtime; this handler reads auth cookies.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/** RoomServiceClient needs an http(s) host, not the wss:// signalling URL. */
function toHttpHost(url) {
  return url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
}

/**
 * Lists participants of a room from LiveKit (the trusted source of room
 * presence). A missing room simply means nobody is there yet.
 */
async function listParticipants(roomClient, roomName) {
  try {
    const participants = await roomClient.listParticipants(roomName);
    return participants.map((p) => ({ identity: p.identity, name: p.name || "" }));
  } catch {
    return [];
  }
}

/**
 * GET /api/consultation/state?appointmentId=<uuid>
 *
 * Returns server-verified room presence and admission state for a consultation
 * the caller actually participates in:
 *   - patient: whether the assigned doctor is currently in the active room
 *              (used for the real-time "doctor has arrived" alert) and whether
 *              the patient has already been admitted.
 *   - doctor:  whether the assigned patient is waiting in the waiting room
 *              (used for the "Admit patient" control) and admission state.
 *
 * Presence is derived from LiveKit server state, never from client claims.
 */
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

  if (apptError) {
    return fail(500, "appointment_lookup_failed", "Could not load the appointment.");
  }
  if (!appointment) {
    return fail(404, "appointment_not_found", "Appointment not found or you do not have access to it.");
  }

  const isPatient = appointment.patient_id === user.id;
  const isAssignedDoctor = appointment.doctor_id === user.id;

  if (!isPatient && !isAssignedDoctor) {
    return fail(403, "not_a_participant", "You are not a participant of this consultation.");
  }

  const { data: admission, error: admissionError } = await supabase
    .from("consultation_admissions")
    .select("appointment_id, admitted_at")
    .eq("appointment_id", appointment.id)
    .maybeSingle();

  if (admissionError) {
    return fail(500, "admission_lookup_failed", "Could not verify consultation access.");
  }

  const startsAt = new Date(appointment.starts_at).getTime();
  const endsAt = new Date(appointment.ends_at).getTime();
  const now = Date.now();
  // Temporary for LiveKit testing: window is open for confirmed appointments without waiting for scheduled time
  const windowOpen = appointment.status === "confirmed";

  const roomClient = new RoomServiceClient(toHttpHost(livekitUrl), apiKey, apiSecret);

  const payload = {
    role: isAssignedDoctor ? "doctor" : "patient",
    status: appointment.status,
    windowOpen,
    admitted: Boolean(admission),
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
  };

  if (isPatient) {
    const activeParticipants = await listParticipants(roomClient, getConsultationRoomName(appointment.id));
    const doctor = activeParticipants.find((p) => p.identity === appointment.doctor_id);
    payload.doctorPresent = Boolean(doctor);
    if (doctor?.name) payload.doctorName = doctor.name;
    // For testing: once the doctor joins the room, patient is automatically admitted to the room
    if (doctor) {
      payload.admitted = true;
    }
  } else {
    const waitingParticipants = await listParticipants(roomClient, getWaitingRoomName(appointment.id));
    const patient = waitingParticipants.find((p) => p.identity === appointment.patient_id);
    payload.patientWaiting = Boolean(patient);
    if (patient?.name) payload.patientName = patient.name;
    payload.patientAdmitted = Boolean(admission);
  }

  return NextResponse.json(payload);
}
