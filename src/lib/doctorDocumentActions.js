"use server";

import { createClientServer } from "./supabase/server";

/**
 * Server action to upload a document and save metadata for a doctor application.
 * Verifies that the caller's session matches the doctor user_id.
 * Validates file type (PDF, JPG, PNG) and size (<= 5MB).
 * Returns safe metadata or error.
 */
export async function uploadDoctorCredentialDocument(formData) {
  try {
    const supabase = createClientServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Authentication session required. Please sign in." };
    }

    const userId = user.id;
    const applicationId = formData.get("application_id");
    const docType = formData.get("document_type"); // 'nmc_registration_certificate' | 'degree_certificate'
    const file = formData.get("file");

    if (!applicationId || !docType || !file) {
      return { success: false, error: "Missing required document upload parameters." };
    }

    // Verify application belongs to caller
    const { data: appData, error: appErr } = await supabase
      .from("doctor_applications")
      .select("id, user_id, status")
      .eq("id", applicationId)
      .eq("user_id", userId)
      .single();

    if (appErr || !appData) {
      return { success: false, error: "Doctor application record not found or unauthorized." };
    }

    // File validation: Size <= 5MB
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: "File exceeds 5 MB limit." };
    }

    // File validation: Extension
    const originalName = file.name || "document";
    const fileExt = originalName.split(".").pop().toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(fileExt)) {
      return { success: false, error: "Only PDF, JPG, and PNG files are accepted." };
    }

    const safeBaseName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${userId}/${applicationId}_${docType}_${Date.now()}.${fileExt}`;

    // Upload to storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await supabase.storage
      .from("doctor-credentials")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // If an existing document of this type exists for this application, delete old storage object
    const { data: existingDoc } = await supabase
      .from("doctor_documents")
      .select("id, storage_path")
      .eq("application_id", applicationId)
      .eq("document_type", docType)
      .maybeSingle();

    if (existingDoc) {
      if (existingDoc.storage_path) {
        await supabase.storage.from("doctor-credentials").remove([existingDoc.storage_path]);
      }
      await supabase.from("doctor_documents").delete().eq("id", existingDoc.id);
    }

    // Insert document metadata row
    const { data: docRecord, error: insertErr } = await supabase
      .from("doctor_documents")
      .insert({
        application_id: applicationId,
        user_id: userId,
        document_type: docType,
        storage_path: filePath,
        file_name: safeBaseName,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
      })
      .select()
      .single();

    if (insertErr) {
      return { success: false, error: `Failed to record document metadata: ${insertErr.message}` };
    }

    // If application was in changes_requested or rejected, set status back to pending
    if (appData.status === "changes_requested" || appData.status === "rejected") {
      await supabase
        .from("doctor_applications")
        .update({
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
    }

    return { success: true, document: docRecord };
  } catch (err) {
    return { success: false, error: err.message || "An unexpected error occurred during document upload." };
  }
}
