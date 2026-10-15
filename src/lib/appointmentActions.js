"use server";

import { createClientServer } from "./supabase/server";
import {
  computeDoctorDirectoryAvailability,
  computeAvailableSlots,
} from "./slotEngine";

/**
 * Fetches all approved doctors using public.get_approved_doctors()
 * along with active weekly schedules and active leaves to determine:
 * - whether availability is set
 * - whether doctor is on leave today (IST)
 * - earliest upcoming slot
 */
export async function getDirectoryDoctors() {
  try {
    const supabase = createClientServer();

    // 1. Fetch approved doctors via safe RPC
    const { data: doctors, error: docError } = await supabase.rpc("get_approved_doctors");

    if (docError) {
      console.error("Error fetching approved doctors:", docError.message);
      return { success: false, error: docError.message, doctors: [] };
    }

    if (!doctors || doctors.length === 0) {
      return { success: true, doctors: [] };
    }

    // 2. Fetch active schedules and leaves across the 14-day window for approved doctors
    const doctorIds = doctors.map((d) => d.doctor_id);

    const [{ data: schedules }, { data: leaves }] = await Promise.all([
      supabase
        .from("doctor_schedules")
        .select("doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active")
        .in("doctor_id", doctorIds)
        .eq("is_active", true),
      supabase
        .from("doctor_leaves")
        .select("doctor_id, leave_start, leave_end, reason")
        .in("doctor_id", doctorIds),
    ]);

    const enrichedDoctors = computeDoctorDirectoryAvailability(
      doctors,
      schedules || [],
      leaves || []
    );

    return { success: true, doctors: enrichedDoctors };
  } catch (err) {
    return { success: false, error: err.message, doctors: [] };
  }
}

/**
 * Fetches available booking slots for a specific doctor over the next 14 days
 * Computed dynamically from active doctor_schedules and doctor_leaves.
 */
export async function getDoctorAvailableSlots(doctorId, fromDate, toDate) {
  try {
    const supabase = createClientServer();

    // 1. Fetch active schedules and leaves for this doctor
    const [{ data: schedules, error: schedErr }, { data: leaves, error: leaveErr }] = await Promise.all([
      supabase
        .from("doctor_schedules")
        .select("day_of_week, start_time, end_time, slot_duration_mins, is_active")
        .eq("doctor_id", doctorId)
        .eq("is_active", true),
      supabase
        .from("doctor_leaves")
        .select("leave_start, leave_end")
        .eq("doctor_id", doctorId),
    ]);

    if (schedErr) {
      return { success: false, error: schedErr.message, slots: [] };
    }
    if (leaveErr) {
      return { success: false, error: leaveErr.message, slots: [] };
    }

    if (!schedules || schedules.length === 0) {
      return { success: true, slots: [] };
    }

    const slots = computeAvailableSlots(schedules, leaves || [], fromDate, toDate);
    return { success: true, slots };
  } catch (err) {
    return { success: false, error: err.message, slots: [] };
  }
}

/**
 * Books an appointment for the authenticated patient
 */
export async function bookAppointmentAction({ doctorId, startsAt, reason }) {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please sign in to book an appointment." };
    }

    const { data, error } = await supabase.rpc("book_appointment", {
      p_doctor_id: doctorId,
      p_starts_at: startsAt,
      p_reason: reason || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, appointmentId: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetches appointments for the authenticated patient with doctor application details
 */
export async function getPatientAppointments() {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required.", appointments: [] };
    }

    // Select appointments for patient
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("patient_id", user.id)
      .order("starts_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message, appointments: [] };
    }

    if (!appointments || appointments.length === 0) {
      return { success: true, appointments: [] };
    }

    // Doctor details via approved doctors RPC
    const { data: doctors } = await supabase.rpc("get_approved_doctors");
    const docMap = {};
    (doctors || []).forEach((d) => {
      docMap[d.doctor_id] = d;
    });

    const enriched = appointments.map((appt) => ({
      ...appt,
      doctor: docMap[appt.doctor_id] || {
        full_name: "Verified Doctor",
        specialization: "Specialist",
      },
    }));

    return { success: true, appointments: enriched };
  } catch (err) {
    return { success: false, error: err.message, appointments: [] };
  }
}

/**
 * Fetches appointments for the authenticated doctor with patient details
 * (full name, date of birth, gender) joined from public.profiles.
 *
 * Patient profiles are protected by RLS (owners + admins only), so a doctor
 * cannot read them directly. The SECURITY DEFINER RPC `get_doctor_appointments`
 * returns only the calling doctor's own appointments joined with the patient
 * profile, exposing just the safe fields the dashboard needs.
 */
export async function getDoctorAppointments() {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required.", appointments: [] };
    }

    // Primary path: RPC joins appointments.patient_id = profiles.id and enforces
    // that only the authenticated doctor's appointments are returned.
    const { data, error } = await supabase.rpc("get_doctor_appointments");

    if (!error && data) {
      return { success: true, appointments: data };
    }

    // Fallback: if the RPC is not deployed yet, still load the doctor's own
    // appointments (without patient demographics) so the dashboard keeps working.
    const { data: rawAppts, error: rawErr } = await supabase
      .from("appointments")
      .select("*")
      .eq("doctor_id", user.id)
      .order("starts_at", { ascending: false });

    if (rawErr) {
      return { success: false, error: rawErr.message, appointments: [] };
    }

    return {
      success: true,
      appointments: (rawAppts || []).map((a) => ({
        ...a,
        patient_name: null,
        patient_date_of_birth: null,
        patient_gender: null,
      })),
    };
  } catch (err) {
    return { success: false, error: err.message, appointments: [] };
  }
}

/**
 * Doctor responds to appointment: confirm or decline
 */
export async function respondToAppointmentAction({ appointmentId, action, note }) {
  try {
    const supabase = createClientServer();
    const { data, error } = await supabase.rpc("respond_to_appointment", {
      p_id: appointmentId,
      p_action: action,
      p_note: note || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Cancels an appointment (by patient or doctor)
 */
export async function cancelAppointmentAction(appointmentId) {
  try {
    const supabase = createClientServer();
    const { data, error } = await supabase.rpc("cancel_appointment", {
      p_id: appointmentId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Checks for upcoming booked appointments that would conflict with a proposed leave range
 */
export async function checkLeaveConflicts(leaveStart, leaveEnd) {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication required.", conflicts: [] };
    }

    // Convert leave dates to IST timestamp bounds
    const startTs = `${leaveStart}T00:00:00+05:30`;
    const endTs = `${leaveEnd}T23:59:59+05:30`;

    const { data: conflicts, error } = await supabase
      .from("appointments")
      .select("id, starts_at, ends_at, status, reason")
      .eq("doctor_id", user.id)
      .in("status", ["requested", "confirmed"])
      .gte("starts_at", startTs)
      .lte("starts_at", endTs)
      .order("starts_at", { ascending: true });

    if (error) {
      return { success: false, error: error.message, conflicts: [] };
    }

    return { success: true, conflicts: conflicts || [] };
  } catch (err) {
    return { success: false, error: err.message, conflicts: [] };
  }
}
