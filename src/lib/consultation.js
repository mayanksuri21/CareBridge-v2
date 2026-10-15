/**
 * Shared consultation-window helpers for the CareBridge LiveKit video flow.
 *
 * These values mirror the server-side window enforced by
 * `src/app/api/consultation/token/route.js`. The API remains the single source
 * of truth for authorization; the client uses this only to decide whether to
 * show the "Join Consultation" affordance.
 */

export const JOIN_GRACE_BEFORE_MS = 15 * 60 * 1000; // 15 minutes before starts_at
export const JOIN_GRACE_AFTER_MS = 30 * 60 * 1000; // 30 minutes after ends_at

/**
 * Determines whether a consultation is currently joinable.
 *
 * @param {{ status?: string, starts_at?: string, ends_at?: string }} appointment
 * @param {number} [now] - current epoch ms (defaults to Date.now())
 * @returns {{ canJoin: boolean, reason: string | null }}
 */
export function getConsultationState(appointment, now = Date.now()) {
  if (!appointment) {
    return { canJoin: false, reason: "unavailable" };
  }

  if (appointment.status !== "confirmed") {
    return { canJoin: false, reason: "not_confirmed" };
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
