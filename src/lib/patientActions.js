"use server";

import { createClientServer } from "./supabase/server";

/**
 * Fetches the authenticated patient's own profile row.
 * Falls back to Auth metadata (e.g. Google) for display when the row is missing.
 */
export async function getPatientProfile() {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please sign in to view your profile.", profile: null };
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, profile: null };
    }

    const meta = user.user_metadata || {};
    const authMeta = {
      avatar_url: meta.avatar_url || meta.picture || null,
      email: user.email || "",
    };

    const derivedName =
      meta.full_name ||
      meta.name ||
      (meta.given_name ? `${meta.given_name} ${meta.family_name || ""}`.trim() : "") ||
      (user.email ? user.email.split("@")[0] : "");

    // If the profile row is missing, present a safe, metadata-derived fallback.
    if (!profile) {
      return {
        success: true,
        profile: {
          id: user.id,
          role: "patient",
          full_name: derivedName || "Patient",
          email: user.email || "",
          phone: null,
          preferred_language: "en",
          date_of_birth: null,
          gender: null,
          state: null,
          district: null,
        },
        meta: authMeta,
        needsInit: true,
      };
    }

    return { success: true, profile, meta: authMeta, needsInit: false };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Failed to load profile.",
      profile: null,
    };
  }
}

/**
 * Updates a patient's own profile demographic fields.
 * Prevents changing role, email, or tampering with unauthorized records.
 * Safely creates the profile row if missing without breaking RLS.
 */
export async function updatePatientProfile(formData) {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
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

    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      if (Number.isNaN(dob.getTime()) || dob > new Date()) {
        return { success: false, error: "Please enter a valid date of birth." };
      }
    }

    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      return { success: false, error: "Please enter a valid phone number." };
    }

    const allowedGenders = ["male", "female", "other", "prefer_not_to_say"];
    if (gender && !allowedGenders.includes(gender)) {
      return { success: false, error: "Please select a valid gender." };
    }

    // Check if profile exists; insert if missing (e.g. signup trigger didn't run)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    let result;
    if (existingProfile) {
      result = await supabase
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
        .eq("id", user.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          role: "patient",
          email: user.email || "",
          full_name: fullName,
          phone,
          preferred_language: preferredLanguage,
          date_of_birth: dateOfBirth,
          gender,
          state,
          district,
        })
        .select()
        .single();
    }

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: err.message || "Failed to update profile." };
  }
}
