import { NextResponse } from "next/server";
import { createClientServer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * POST /api/consultation/admit
 *
 * Body: { appointmentId: string }
 *
 * Doctor-only. Admits the assigned patient into the active consultation room.
 *
 * All authorization lives in the SECURITY DEFINER function
 * public.admit_consultation_patient(), which re-checks the caller is the
 * appointment's assigned doctor, that the doctor is verified/approved, and that
 * the appointment is confirmed and inside its consultation window. A patient
 * cannot call this successfully for themselves or anyone else.
 */
export async function POST(request) {
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
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "unauthenticated", "You must be signed in.");
  }

  const { data, error } = await supabase.rpc("admit_consultation_patient", {
    p_appointment_id: appointmentId,
  });

  if (error) {
    switch (error.code) {
      case "28000":
        return fail(401, "unauthenticated", error.message);
      case "P0002":
        return fail(404, "appointment_not_found", error.message);
      case "42501":
        return fail(403, "not_allowed", error.message);
      case "P0001":
        return fail(409, "not_eligible", error.message);
      default:
        return fail(500, "admit_failed", error.message || "Could not admit the patient.");
    }
  }

  return NextResponse.json({ success: true, admitted: true, result: data });
}
