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
 * POST /api/consultation/prescription
 *
 * Saves or updates a prescription for a consultation.
 * Body: {
 *   appointmentId: string,
 *   status: 'draft' | 'finalized',
 *   clinicalNotes: string,
 *   medicines: Array<{
 *     name: string,
 *     strength: string,
 *     dose: string,
 *   } frequency: string,
 *     duration: string,
 *     instructions: string
 *   }>
 * }
 *
 * Only accessible to the assigned doctor.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const appointmentId = body?.appointmentId;
  const status = body?.status;
  const clinicalNotes = body?.clinicalNotes;
  const medicines = body?.medicines || [];

  console.log('[Prescription API] Saving prescription:', { appointmentId, status, medicinesCount: medicines.length });

  if (typeof appointmentId !== "string" || !UUID_RE.test(appointmentId)) {
    return fail(400, "invalid_appointment_id", "A valid appointmentId is required.");
  }

  if (!status || !["draft", "finalized"].includes(status)) {
    return fail(400, "invalid_status", "Status must be 'draft' or 'finalized'.");
  }

  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "unauthenticated", "You must be signed in.");
  }

  // Fetch appointment to verify doctor authorization
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError) {
    return fail(500, "appointment_lookup_failed", "Could not load the appointment.");
  }
  if (!appointment) {
    return fail(404, "appointment_not_found", "Appointment not found or you do not have access to it.");
  }

  if (appointment.doctor_id !== user.id) {
    return fail(403, "not_authorized", "Only the assigned doctor can save prescriptions.");
  }

  try {
    // Check if a prescription already exists for this appointment
    const { data: existingPrescription } = await supabase
      .from("prescriptions")
      .select("id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    let prescriptionId;

    if (existingPrescription) {
      // Update existing prescription
      console.log('[Prescription API] Updating existing prescription:', existingPrescription.id);
      const { data: updated, error: updateError } = await supabase
        .from("prescriptions")
        .update({
          status,
          clinical_notes: clinicalNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPrescription.id)
        .select()
        .single();

      if (updateError) {
        console.log('[Prescription API] Update error:', updateError);
        return fail(500, "prescription_update_failed", "Could not update the prescription.");
      }

      prescriptionId = updated.id;

      // Delete existing prescription items
      const { error: deleteError } = await supabase
        .from("prescription_items")
        .delete()
        .eq("prescription_id", prescriptionId);

      if (deleteError) {
        console.log('[Prescription API] Delete items error:', deleteError);
        return fail(500, "items_delete_failed", "Could not update prescription items.");
      }
    } else {
      // Create new prescription
      console.log('[Prescription API] Creating new prescription');
      const { data: created, error: insertError } = await supabase
        .from("prescriptions")
        .insert({
          appointment_id: appointmentId,
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          status,
          clinical_notes: clinicalNotes || null,
        })
        .select()
        .single();

      if (insertError) {
        console.log('[Prescription API] Insert error:', insertError);
        return fail(500, "prescription_insert_failed", "Could not create the prescription.");
      }

      prescriptionId = created.id;
    }

    // Insert prescription items
    if (medicines.length > 0) {
      const itemsToInsert = medicines.map((med) => ({
        prescription_id: prescriptionId,
        medicine_name: med.name,
        strength: med.strength || null,
        dose: med.dose || null,
        frequency: med.frequency || null,
        duration: med.duration || null,
        instructions: med.instructions || null,
      }));

      const { error: itemsError } = await supabase
        .from("prescription_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.log('[Prescription API] Insert items error:', itemsError);
        return fail(500, "items_insert_failed", "Could not save prescription items.");
      }
    }

    console.log('[Prescription API] Prescription saved successfully:', prescriptionId);
    return NextResponse.json({
      success: true,
      prescriptionId,
      message: status === "finalized" ? "Prescription finalized successfully." : "Draft saved successfully.",
    });
  } catch (err) {
    console.log('[Prescription API] Unexpected error:', err);
    return fail(500, "unexpected_error", "An unexpected error occurred.");
  }
}

/**
 * GET /api/consultation/prescription?appointmentId=<uuid>
 *
 * Fetches the prescription for a consultation.
 * Only accessible to the assigned doctor or the patient.
 */
export async function GET(request) {
  const appointmentId = request.nextUrl.searchParams.get("appointmentId");

  console.log('[Prescription API] Fetching prescription for appointmentId:', appointmentId);

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

  // Fetch appointment to verify authorization
  const { data: appointment, error: apptError } = await supabase
    .from("appointments")
    .select("id, patient_id, doctor_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptError) {
    return fail(500, "appointment_lookup_failed", "Could not load the appointment.");
  }
  if (!appointment) {
    return fail(404, "appointment_not_found", "Appointment not found or you do not have access to it.");
  }

  const isPatient = appointment.patient_id === user.id;
  const isDoctor = appointment.doctor_id === user.id;

  if (!isPatient && !isDoctor) {
    return fail(403, "not_authorized", "You are not authorized to view this prescription.");
  }

  // Fetch prescription with items
  const { data: prescription, error: prescriptionError } = await supabase
    .from("prescriptions")
    .select(`
      *,
      prescription_items (*)
    `)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (prescriptionError) {
    console.log('[Prescription API] Fetch error:', prescriptionError);
    return fail(500, "prescription_fetch_failed", "Could not load the prescription.");
  }

  if (!prescription) {
    console.log('[Prescription API] No prescription found');
    return NextResponse.json({ prescription: null });
  }

  console.log('[Prescription API] Prescription fetched:', prescription.id);
  return NextResponse.json({
    prescription: {
      id: prescription.id,
      status: prescription.status,
      clinicalNotes: prescription.clinical_notes,
      medicines: prescription.prescription_items.map((item) => ({
        id: item.id,
        name: item.medicine_name,
        strength: item.strength,
        dose: item.dose,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
      })),
    },
  });
}
