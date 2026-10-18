import { NextResponse } from "next/server";
import { createClientServer } from "../../../../lib/supabase/server";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const appointmentId = body?.appointmentId;

    if (!appointmentId) {
      return NextResponse.json(
        { error: "appointment_id_required", message: "appointmentId is required." },
        { status: 400 }
      );
    }

    const supabase = createClientServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "unauthenticated", message: "You must be signed in." },
        { status: 401 }
      );
    }

    // 1. अपॉइंटमेंट से सही patient_id और doctor_id निकालें
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) {
      return NextResponse.json(
        { error: "appointment_not_found", message: "Appointment not found." },
        { status: 404 }
      );
    }

    // अगर appointments टेबल में patient_id नहीं मिलता है, तो fallback के रूप में user/profiles से चेक करें
    let targetPatientId = appointment.patient_id;

    if (!targetPatientId) {
      // अगर कॉलम का नाम user_id है:
      const { data: fallbackAppt } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .maybeSingle();

      targetPatientId = fallbackAppt?.user_id || fallbackAppt?.patient_id;
    }

    if (!targetPatientId) {
      return NextResponse.json(
        { error: "patient_not_found", message: "Could not find a valid patient for this appointment." },
        { status: 400 }
      );
    }

    // 2. consultation_admissions में patient_id के साथ रिकॉर्ड सेव करें
    // consultation_admissions me saare required non-null columns bhejo
    // consultation_admissions me saare non-null columns (doctor_id + admitted_by)
    const { error: insertError } = await supabase
      .from("consultation_admissions")
      .upsert(
        {
          appointment_id: appointment.id,
          patient_id: targetPatientId,
          doctor_id: targetDoctorId,
          admitted_by: user.id, // <-- Yeh missing tha!
          admitted_at: new Date().toISOString(),
        },
        { onConflict: "appointment_id" }
      );
    if (insertError) {
      console.error("[Admit API] Upsert Error:", insertError);
      return NextResponse.json(
        { error: "db_error", message: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Patient admitted successfully.",
    });
  } catch (err) {
    console.error("[Admit API Catch Error]:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to admit patient." },
      { status: 500 }
    );
  }
}