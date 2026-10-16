"use server";

import { createClientServer } from "./supabase/server";

/**
 * Returns the signed-in patient's consultation reminders.
 *
 * Calls the idempotent `ensure_consultation_reminders()` SECURITY DEFINER
 * function, which creates a reminder row for any confirmed appointment starting
 * within the next 15 minutes (skipping ones that already exist) and returns only
 * the caller's notifications. This guarantees the reminder appears immediately
 * when a patient opens the portal inside the reminder window.
 */
export async function getConsultationReminders() {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated.", notifications: [] };
    }

    const { data, error } = await supabase.rpc("ensure_consultation_reminders");

    if (error) {
      // The table/function may not be migrated yet; degrade quietly.
      return { success: false, error: error.message, notifications: [] };
    }

    return { success: true, notifications: Array.isArray(data) ? data : [] };
  } catch (err) {
    return { success: false, error: err.message || "Failed to load reminders.", notifications: [] };
  }
}

/**
 * Dismisses one of the caller's own reminders. The SQL function scopes the
 * update to `patient_id = auth.uid()`, so a patient can never touch another
 * user's notification.
 */
export async function dismissConsultationReminder(notificationId) {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated." };
    }

    const { error } = await supabase.rpc("dismiss_patient_notification", {
      p_id: notificationId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Failed to dismiss the reminder." };
  }
}
