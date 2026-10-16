/**
 * Shared consultation helpers for the CareBridge LiveKit video flow.
 *
 * These values mirror the server-side window enforced by
 * `src/app/api/consultation/token/route.js` and by the
 * `public.admit_consultation_patient()` SQL function. The server remains the
 * single source of truth for authorization; the client uses this only to decide
 * whether to show the "Join Consultation" affordance.
 */

export const JOIN_GRACE_BEFORE_MS = 15 * 60 * 1000; // 15 minutes before starts_at
export const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000; // 30 minutes after ends_at

/** Active consultation room. Opaque, derived from the appointment id only. */
export function getConsultationRoomName(appointmentId) {
  return `consultation_${appointmentId}`;
}

/**
 * Waiting room. A patient who has not been admitted by the doctor only ever
 * receives a token scoped to this room, so they cannot see or hear the active
 * consultation.
 */
export function getWaitingRoomName(appointmentId) {
  return `consultation_waiting_${appointmentId}`;
}

/**
 * Determines whether a consultation is currently joinable.
 *
 * @param {{ status?: string, starts_at?: string, ends_at?: string }} appointment
 * @param {number} [now] - current epoch ms (defaults to Date.now())
 * @param {boolean | { isDoctor?: boolean, doctorPresent?: boolean }} [options] - role or presence options
 * @returns {{ canJoin: boolean, reason: string | null }}
 */
export function getConsultationState(appointment, now = Date.now(), options = {}) {
  if (!appointment) {
    return { canJoin: false, reason: "unavailable" };
  }

  if (appointment.status !== "confirmed") {
    return { canJoin: false, reason: "not_confirmed" };
  }

  const isDoctor = typeof options === "boolean" ? options : Boolean(options?.isDoctor);
  const doctorPresent = typeof options === "object" ? Boolean(options?.doctorPresent) : false;

  // Temporary testing bypass:
  // 1. As soon as doctor accepts & confirms, doctor can Start Consultation immediately.
  if (isDoctor) {
    return { canJoin: true, reason: null };
  }

  // 2. Once the doctor joins the room, patient gets the Join Consultation affordance immediately.
  if (doctorPresent) {
    return { canJoin: true, reason: null };
  }

  const startsAt = new Date(appointment.starts_at).getTime();
  const endsAt = new Date(appointment.ends_at).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    return { canJoin: false, reason: "no_time" };
  }

  if (now < startsAt - JOIN_GRACE_BEFORE_MS) {
    return { canJoin: false, reason: "too_early" };
  }

  if (now > endsAt + JOIN_GRACE_AFTER_MS) {
    return { canJoin: false, reason: "ended" };
  }

  return { canJoin: true, reason: null };
}

/** True when the appointment is inside the consultation time window. */
export function isWithinConsultationWindow(appointment, now = Date.now(), options = {}) {
  return getConsultationState(appointment, now, options).canJoin;
}

function formatTimeIST(iso) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateIST(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Mon, 3 Nov 2026 at 09:30 am IST" */
export function formatConsultationSlotIST(iso) {
  return `${formatDateIST(iso)} at ${formatTimeIST(iso)} IST`;
}
