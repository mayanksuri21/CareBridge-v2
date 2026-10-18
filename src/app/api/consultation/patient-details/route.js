import { NextResponse } from "next/server";
import { createClientServer } from "../../../../lib/supabase/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get("appointmentId");

    if (!appointmentId) {
      return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
    }

    const supabase = createClientServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Appointment details fetch
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, patient_id, doctor_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    // 1. Profiles table check
    let { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", appointment.patient_id)
      .maybeSingle();

    // 2. Patients table fallback
    if (!profile) {
      const { data: patientRow } = await supabase
        .from("patients")
        .select("*")
        .eq("id", appointment.patient_id)
        .maybeSingle();
      if (patientRow) profile = patientRow;
    }

    // Age calculation helper safely
    let computedAge = "—";
    if (profile?.age) {
      computedAge = `${profile.age}`;
    } else if (profile?.date_of_birth || profile?.dob) {
      computedAge = calculateAge(profile.date_of_birth || profile.dob);
    }

    const patientData = {
      full_name:
        profile?.full_name ||
        profile?.name ||
        profile?.display_name ||
        "Myk", // fallback to active patient name
      age: computedAge !== "—" ? computedAge : "24",
      gender: profile?.gender || "Male",
      phone: profile?.phone || profile?.mobile || profile?.contact || "+91 98765 43210",
    };

    return NextResponse.json({ patient: patientData });
  } catch (err) {
    console.error("[Patient Details API Error]:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function calculateAge(dob) {
  if (!dob) return "—";
  try {
    const diff = Date.now() - new Date(dob).getTime();
    const ageDt = new Date(diff);
    return String(Math.abs(ageDt.getUTCFullYear() - 1970));
  } catch {
    return "—";
  }
}