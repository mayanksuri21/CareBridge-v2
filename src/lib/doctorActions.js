"use server";

import { createClientServer } from "./supabase/server";

/**
 * Validates that the active session belongs to an approved doctor.
 * Returns the doctor user object and application record, or throws an error.
 */
async function getVerifiedDoctorSession() {
  const supabase = createClientServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("Authentication required. Please sign in.");
  }

  const { data: docApp, error } = await supabase
    .from("doctor_applications")
    .select("*")
    .eq("user_id", session.user.id)
    .single();

  if (error || !docApp || docApp.status !== "approved") {
    throw new Error("Access restricted: Only approved medical practitioners can perform this action.");
  }

  return { supabase, user: session.user, docApp };
}

/**
 * Validates time string (HH:MM or HH:MM:SS) and returns minutes from midnight.
 */
function parseTimeToMinutes(timeStr) {
  const parts = timeStr.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Adds a new availability shift for an approved doctor.
 */
export async function addDoctorShift(formData) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const dayOfWeek = parseInt(formData.day_of_week, 10);
    const startTime = formData.start_time; // 'HH:MM'
    const endTime = formData.end_time;     // 'HH:MM'
    const slotDuration = parseInt(formData.slot_duration_mins || 15, 10);

    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return { success: false, error: "Invalid day of week selected." };
    }

    if (!startTime || !endTime) {
      return { success: false, error: "Both start time and end time are required." };
    }

    const startMins = parseTimeToMinutes(startTime);
    const endMins = parseTimeToMinutes(endTime);

    if (endMins <= startMins) {
      return { success: false, error: "Shift end time must be after the start time." };
    }

    if (![10, 15, 20, 30, 45, 60].includes(slotDuration)) {
      return { success: false, error: "Slot duration must be 10, 15, 20, 30, 45, or 60 minutes." };
    }

    // Friendly validation check for overlapping shifts on the same day
    const { data: existingShifts, error: queryError } = await supabase
      .from("doctor_schedules")
      .select("id, start_time, end_time")
      .eq("doctor_id", user.id)
      .eq("day_of_week", dayOfWeek)
      .eq("is_active", true);

    if (!queryError && existingShifts) {
      for (const shift of existingShifts) {
        const existingStart = parseTimeToMinutes(shift.start_time);
        const existingEnd = parseTimeToMinutes(shift.end_time);

        if (startMins < existingEnd && endMins > existingStart) {
          return {
            success: false,
            error: `Shift overlaps with an existing shift (${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}) on this day.`,
          };
        }
      }
    }

    const { data, error: insertError } = await supabase
      .from("doctor_schedules")
      .insert({
        doctor_id: user.id,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_duration_mins: slotDuration,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message?.includes("overlaps") || insertError.code === "23P01") {
        return { success: false, error: "Shift overlaps with an existing active shift on this day." };
      }
      return { success: false, error: insertError.message || "Failed to add shift." };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message || "An unexpected error occurred." };
  }
}

/**
 * Updates an existing availability shift.
 */
export async function updateDoctorShift(formData) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const id = formData.id;
    const dayOfWeek = parseInt(formData.day_of_week, 10);
    const startTime = formData.start_time;
    const endTime = formData.end_time;
    const slotDuration = parseInt(formData.slot_duration_mins || 15, 10);
    const isActive = Boolean(formData.is_active);

    if (!id) {
      return { success: false, error: "Missing shift identifier." };
    }

    const startMins = parseTimeToMinutes(startTime);
    const endMins = parseTimeToMinutes(endTime);

    if (endMins <= startMins) {
      return { success: false, error: "Shift end time must be after start time." };
    }

    // Overlap validation
    if (isActive) {
      const { data: existingShifts } = await supabase
        .from("doctor_schedules")
        .select("id, start_time, end_time")
        .eq("doctor_id", user.id)
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .neq("id", id);

      if (existingShifts) {
        for (const shift of existingShifts) {
          const existingStart = parseTimeToMinutes(shift.start_time);
          const existingEnd = parseTimeToMinutes(shift.end_time);

          if (startMins < existingEnd && endMins > existingStart) {
            return {
              success: false,
              error: `Shift overlaps with another active shift (${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}).`,
            };
          }
        }
      }
    }

    const { data, error } = await supabase
      .from("doctor_schedules")
      .update({
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_duration_mins: slotDuration,
        is_active: isActive,
      })
      .eq("id", id)
      .eq("doctor_id", user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Toggles a shift's active status.
 */
export async function toggleDoctorShiftStatus(shiftId, newIsActive) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    // If activating, verify overlap first
    if (newIsActive) {
      const { data: currentShift } = await supabase
        .from("doctor_schedules")
        .select("*")
        .eq("id", shiftId)
        .eq("doctor_id", user.id)
        .single();

      if (currentShift) {
        const startMins = parseTimeToMinutes(currentShift.start_time);
        const endMins = parseTimeToMinutes(currentShift.end_time);

        const { data: others } = await supabase
          .from("doctor_schedules")
          .select("id, start_time, end_time")
          .eq("doctor_id", user.id)
          .eq("day_of_week", currentShift.day_of_week)
          .eq("is_active", true)
          .neq("id", shiftId);

        if (others) {
          for (const s of others) {
            if (startMins < parseTimeToMinutes(s.end_time) && endMins > parseTimeToMinutes(s.start_time)) {
              return { success: false, error: "Cannot activate: overlaps with another active shift on this day." };
            }
          }
        }
      }
    }

    const { error } = await supabase
      .from("doctor_schedules")
      .update({ is_active: newIsActive })
      .eq("id", shiftId)
      .eq("doctor_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a doctor shift.
 */
export async function deleteDoctorShift(shiftId) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const { error } = await supabase
      .from("doctor_schedules")
      .delete()
      .eq("id", shiftId)
      .eq("doctor_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Copies shifts from a source day to multiple target days.
 */
export async function copyShiftsToDays(sourceDay, targetDays) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const { data: sourceShifts, error: fetchErr } = await supabase
      .from("doctor_schedules")
      .select("*")
      .eq("doctor_id", user.id)
      .eq("day_of_week", sourceDay)
      .eq("is_active", true);

    if (fetchErr || !sourceShifts || sourceShifts.length === 0) {
      return { success: false, error: "No active shifts to copy from selected day." };
    }

    let copiedCount = 0;
    for (const targetDay of targetDays) {
      if (targetDay === sourceDay) continue;

      for (const shift of sourceShifts) {
        // Attempt insert; ignore or handle overlap
        const { error: insErr } = await supabase.from("doctor_schedules").insert({
          doctor_id: user.id,
          day_of_week: targetDay,
          start_time: shift.start_time,
          end_time: shift.end_time,
          slot_duration_mins: shift.slot_duration_mins,
          is_active: true,
        });

        if (!insErr) {
          copiedCount++;
        }
      }
    }

    return { success: true, count: copiedCount };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Adds a leave entry for an approved doctor.
 */
export async function addDoctorLeave(formData) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const leaveStart = formData.leave_start; // 'YYYY-MM-DD'
    const leaveEnd = formData.leave_end || leaveStart; // 'YYYY-MM-DD'
    const reason = formData.reason ? formData.reason.trim() : null;

    if (!leaveStart) {
      return { success: false, error: "Leave start date is required." };
    }

    if (leaveEnd < leaveStart) {
      return { success: false, error: "Leave end date cannot be earlier than start date." };
    }

    // Phase 06 Reminder: Phase 06 must check booked appointments when leave is added and notify affected patients.
    const { data, error } = await supabase
      .from("doctor_leaves")
      .insert({
        doctor_id: user.id,
        leave_start: leaveStart,
        leave_end: leaveEnd,
        reason,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates an existing leave entry.
 */
export async function updateDoctorLeave(formData) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const id = formData.id;
    const leaveStart = formData.leave_start;
    const leaveEnd = formData.leave_end || leaveStart;
    const reason = formData.reason ? formData.reason.trim() : null;

    if (!id || !leaveStart) {
      return { success: false, error: "Missing required leave fields." };
    }

    if (leaveEnd < leaveStart) {
      return { success: false, error: "Leave end date cannot be earlier than start date." };
    }

    // Phase 06 Reminder: Phase 06 must check booked appointments when leave is updated.
    const { data, error } = await supabase
      .from("doctor_leaves")
      .update({
        leave_start: leaveStart,
        leave_end: leaveEnd,
        reason,
      })
      .eq("id", id)
      .eq("doctor_id", user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a leave entry.
 */
export async function deleteDoctorLeave(leaveId) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const { error } = await supabase
      .from("doctor_leaves")
      .delete()
      .eq("id", leaveId)
      .eq("doctor_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Updates doctor profile with safe fields only.
 */
export async function updateDoctorProfile(formData) {
  try {
    const { supabase, user } = await getVerifiedDoctorSession();

    const consultationFee = parseFloat(formData.consultation_fee);
    const bio = formData.bio ? formData.bio.trim() : "";
    const phone = formData.phone ? formData.phone.trim() : "";
    const languages = Array.isArray(formData.consultation_languages)
      ? formData.consultation_languages
      : typeof formData.consultation_languages === "string"
      ? formData.consultation_languages.split(",").map((l) => l.trim()).filter(Boolean)
      : ["English", "Hindi"];

    if (isNaN(consultationFee) || consultationFee < 0) {
      return { success: false, error: "Please enter a valid consultation fee." };
    }

    if (!phone) {
      return { success: false, error: "Contact phone number is required." };
    }

    // Update doctor_applications safe fields
    const { data, error } = await supabase
      .from("doctor_applications")
      .update({
        consultation_fee: consultationFee,
        bio,
        phone,
        consultation_languages: languages,
      })
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Keep phone in sync in profiles table
    await supabase.from("profiles").update({ phone }).eq("id", user.id);

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
