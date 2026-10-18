import { NextResponse } from "next/server";
import { createClientServer } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "You must be signed in." },
      { status: 401 }
    );
  }

  try {
    // 1. Prescriptions aur items fetch karo
    const { data: prescriptions, error: prescError } = await supabase
      .from("prescriptions")
      .select(`
        *,
        prescription_items (*)
      `)
      .eq("patient_id", user.id)
      .order("created_at", { ascending: false });

    if (prescError) {
      console.error("[Patient Prescriptions API] Error fetching prescriptions:", prescError);
      return NextResponse.json(
        { error: "fetch_failed", message: "Could not load prescriptions." },
        { status: 500 }
      );
    }

    if (!prescriptions || prescriptions.length === 0) {
      return NextResponse.json({ prescriptions: [] });
    }

    // 2. Doctor details safely map karne ke liye appointment IDs fetch karo
    const appointmentIds = prescriptions
      .map((p) => p.appointment_id)
      .filter(Boolean);

    let appointmentsMap = {};
    if (appointmentIds.length > 0) {
      const { data: appointments } = await supabase
        .from("appointments")
        .select(`
          id,
          starts_at,
          doctor_id
        `)
        .in("id", appointmentIds);

      if (appointments) {
        // Collect all doctor ids
        const doctorIds = appointments.map((a) => a.doctor_id).filter(Boolean);
        let doctorProfiles = {};

        if (doctorIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", doctorIds);

          const { data: docApps } = await supabase
            .from("doctor_applications")
            .select("user_id, full_name, specialization")
            .in("user_id", doctorIds);

          (profiles || []).forEach((pr) => {
            doctorProfiles[pr.id] = { name: pr.full_name };
          });
          (docApps || []).forEach((da) => {
            doctorProfiles[da.user_id] = {
              name: da.full_name || doctorProfiles[da.user_id]?.name || "Doctor",
              specialization: da.specialization || "Specialist",
            };
          });
        }

        appointments.forEach((a) => {
          appointmentsMap[a.id] = {
            starts_at: a.starts_at,
            doctor: doctorProfiles[a.doctor_id] || { name: "Doctor", specialization: "General Medicine" },
          };
        });
      }
    }

    // 3. Response construct karo
    const formatted = prescriptions.map((p) => {
      const appt = appointmentsMap[p.appointment_id] || {};
      return {
        id: p.id,
        status: p.status || "draft",
        clinicalNotes: p.clinical_notes || "",
        createdAt: p.created_at,
        finalizedAt: p.finalized_at,
        appointmentDate: appt.starts_at || p.created_at,
        doctor: {
          name: appt.doctor?.name || "Dr. CareBridge Partner",
          specialization: appt.doctor?.specialization || "General Medicine",
        },
        medicines: (p.prescription_items || []).map((item) => ({
          name: item.medicine_name,
          strength: item.strength || "",
          dose: item.dose || "",
          frequency: item.frequency || "",
          duration: item.duration || "",
          instructions: item.instructions || "",
        })),
      };
    });

    return NextResponse.json({ prescriptions: formatted });
  } catch (err) {
    console.error("[Patient Prescriptions API] Unexpected error:", err);
    return NextResponse.json(
      { error: "unexpected_error", message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}