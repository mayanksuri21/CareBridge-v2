"use server";

import { createClientServer } from "./supabase/server";

/**
 * Updates a patient's own profile demographic fields.
 * Prevents changing role, email, or tampering with unauthorized records.
 */
export async function updatePatientProfile(formData) {
  try {
    const supabase = createClientServer();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return { success: false, error: "Please sign in to update your profile." };
    }

    const fullName = formData.full_name ? formData.full_name.trim() : "";
    const phone = formData.phone ? formData.phone.trim() : "";
    const preferredLanguage = formData.preferred_language || "en";
    const dateOfBirth = formData.date_of_birth || null;
    const gender = formData.gender || null;
    const state = formData.state ? formData.state.trim() : null;
    const district = formData.district ? formData.district.trim() : null;

    if (!fullName) {
      return { success: false, error: "Full name is required." };
    }

    // Only update safe fields. Never allow changing role or email.
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        preferred_language: preferredLanguage,
        date_of_birth: dateOfBirth,
        gender,
        state,
        district,
      })
      .eq("id", session.user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message || "Failed to update profile." };
  }
}
