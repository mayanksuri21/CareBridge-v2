"use server";

import { createClientServer } from "./supabase/server";

/**
 * Validates that caller is an administrator.
 */
async function verifyAdminCaller() {
  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const { data: adminRecord } = await supabase
    .from("administrators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRecord) {
    throw new Error("Access denied: Administrator privileges required.");
  }

  return { supabase, adminUser: user };
}

/**
 * Fetches doctor documents with fallback to storage bucket listing if metadata rows are missing.
 */
export async function getApplicantDocuments(userId, applicationId) {
  try {
    const { supabase } = await verifyAdminCaller();

    // 1. Query public.doctor_documents
    const { data: dbDocs, error: dbErr } = await supabase
      .from("doctor_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (!dbErr && dbDocs && dbDocs.length > 0) {
      return { success: true, documents: dbDocs, source: "database" };
    }

    // 2. Fallback: check storage folder directly for this doctor
    const { data: storageFiles, error: storageErr } = await supabase.storage
      .from("doctor-credentials")
      .list(userId);

    if (storageErr || !storageFiles || storageFiles.length === 0) {
      return { success: true, documents: [], source: "none" };
    }

    // Format storage objects into document representations
    const fallbackDocs = storageFiles.map((file) => {
      const isDegree = file.name.toLowerCase().includes("degree");
      return {
        id: file.id || file.name,
        application_id: applicationId,
        user_id: userId,
        document_type: isDegree ? "degree_certificate" : "nmc_registration_certificate",
        storage_path: `${userId}/${file.name}`,
        file_name: file.name,
        file_size: file.metadata?.size || 0,
        mime_type: file.metadata?.mimetype || "application/pdf",
        created_at: file.created_at || new Date().toISOString(),
        is_storage_fallback: true,
      };
    });

    return { success: true, documents: fallbackDocs, source: "storage" };
  } catch (err) {
    return { success: false, error: err.message, documents: [] };
  }
}

/**
 * Generates a short-lived signed URL (60 seconds) strictly for an authenticated administrator.
 */
export async function createAdminDocumentSignedUrl(storagePath) {
  try {
    const { supabase } = await verifyAdminCaller();

    if (!storagePath) {
      return { success: false, error: "Storage path is required." };
    }

    const { data, error } = await supabase.storage
      .from("doctor-credentials")
      .createSignedUrl(storagePath, 60); // 60 seconds expiry

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, signedUrl: data.signedUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Runs the database backfill function to sync any unmapped storage objects to doctor_documents.
 */
export async function runBackfillDoctorDocuments() {
  try {
    const { supabase } = await verifyAdminCaller();

    const { data, error } = await supabase.rpc("backfill_doctor_documents_from_storage");
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, count: data || 0 };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
