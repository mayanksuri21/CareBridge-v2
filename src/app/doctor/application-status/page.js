"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import {
  HeartPulse,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogOut,
  ArrowRight,
  RefreshCw,
  FileText,
  UploadCloud,
  Check,
} from "lucide-react";
import { uploadDoctorCredentialDocument } from "../../../lib/doctorDocumentActions";

export default function DoctorApplicationStatusPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [appData, setAppData] = useState(null);
  const [user, setUser] = useState(null);
  const [existingDocs, setExistingDocs] = useState([]);

  // Upload/replacement state for documents
  const [regFile, setRegFile] = useState(null);
  const [degreeFile, setDegreeFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState("");
  const [docUploadSuccess, setDocUploadSuccess] = useState("");

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push("/doctor/login");
        return;
      }

      setUser(session.user);

      const { data, error } = await supabase
        .from("doctor_applications")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setAppData(data);
        if (data.status === "approved") {
          router.push("/doctor/dashboard");
          return;
        }

        // Fetch existing documents
        const { data: docs } = await supabase
          .from("doctor_documents")
          .select("*")
          .eq("application_id", data.id)
          .order("created_at", { ascending: true });

        setExistingDocs(docs || []);
      } else {
        setAppData(null);
      }
    } catch {
      // Catch network or table errors
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleUploadOrReplace = async (e) => {
    e.preventDefault();
    if (!regFile && !degreeFile) {
      setDocUploadError("Please select at least one document to upload or replace.");
      return;
    }

    setUploadingDoc(true);
    setDocUploadError("");
    setDocUploadSuccess("");

    try {
      if (regFile) {
        const formData = new FormData();
        formData.append("application_id", appData.id);
        formData.append("document_type", "nmc_registration_certificate");
        formData.append("file", regFile);

        const res = await uploadDoctorCredentialDocument(formData);
        if (!res.success) {
          throw new Error(res.error || "Failed to upload Registration Certificate.");
        }
      }

      if (degreeFile) {
        const formData = new FormData();
        formData.append("application_id", appData.id);
        formData.append("document_type", "degree_certificate");
        formData.append("file", degreeFile);

        const res = await uploadDoctorCredentialDocument(formData);
        if (!res.success) {
          throw new Error(res.error || "Failed to upload Degree Certificate.");
        }
      }

      setDocUploadSuccess("Documents uploaded successfully! Your application status has been returned to Pending Verification for admin review.");
      setRegFile(null);
      setDegreeFile(null);
      await fetchStatus();
    } catch (err) {
      setDocUploadError(err.message || "Document upload failed. Please try again.");
    } finally {
      setUploadingDoc(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Verifying credential status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md">
              <HeartPulse className="w-5 h-5" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Care<span className="text-brand-emerald">Bridge</span>
            </span>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-600 text-xs">
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign Out
          </Button>
        </div>

        {/* Status Presentation Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-lg card-elevation space-y-6">
          <div className="text-center space-y-3">
            <Badge variant="blue">Credential Review System</Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Doctor Application Status
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Account: <span className="font-semibold text-slate-800">{user?.email}</span>
            </p>
          </div>

          {!appData ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 text-center space-y-4">
              <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
              <div>
                <h3 className="text-base font-bold text-amber-900">No Application Found</h3>
                <p className="text-xs text-amber-800 mt-1">
                  You are signed in, but have not submitted your medical credentials yet.
                </p>
              </div>
              <Link href="/doctor/apply">
                <Button variant="primary" size="md" className="font-bold">
                  Submit Doctor Application
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dynamic Status Banner */}
              {appData.status === "pending" && (
                <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-brand-blue flex-shrink-0">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                      Status: Pending Verification
                    </span>
                    <h3 className="text-base font-bold text-blue-950">
                      Credentials Awaiting Verification
                    </h3>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Your doctor registration request has been received. Our admin team will review your medical qualifications and registration documents. Your doctor account will remain inactive until your application is approved.
                    </p>
                    <p className="text-xs font-semibold text-amber-900 bg-amber-100/70 border border-amber-200 rounded-lg p-2.5 mt-2">
                      You cannot access the doctor dashboard until an administrator approves your application.
                    </p>
                  </div>
                </div>
              )}

              {appData.status === "changes_requested" && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                      Status: Corrections Needed
                    </span>
                    <h3 className="text-base font-bold text-amber-950">
                      Changes Requested by Admin
                    </h3>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {appData.review_notes || "Please re-upload clearer registration documentation or verify council information."}
                    </p>
                  </div>
                </div>
              )}

              {appData.status === "rejected" && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 flex-shrink-0">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black uppercase tracking-wider">
                      Status: Application Declined
                    </span>
                    <h3 className="text-base font-bold text-rose-950">
                      Verification Not Approved
                    </h3>
                    <p className="text-xs text-rose-800 leading-relaxed">
                      {appData.review_notes || "Your application could not be verified against the official medical council directory."}
                    </p>
                  </div>
                </div>
              )}

              {/* Document Status & Upload Form (Available for pending, changes_requested, or rejected) */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Uploaded Credential Documents ({existingDocs.length})
                  </h4>
                </div>

                {existingDocs.length > 0 ? (
                  <div className="space-y-2">
                    {existingDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs shadow-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-brand-blue flex-shrink-0" />
                          <div>
                            <p className="font-bold text-slate-800">{doc.file_name}</p>
                            <p className="text-[10px] text-slate-500">
                              {doc.document_type === "degree_certificate"
                                ? "Degree Certificate"
                                : "NMC Registration Certificate"}{" "}
                              • {(doc.file_size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          On File
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-xl">
                    No documents currently on file. Please upload your mandatory registration certificate below.
                  </p>
                )}

                {/* Upload or Replace Form */}
                <form onSubmit={handleUploadOrReplace} className="space-y-3 pt-3 border-t border-slate-200">
                  <h5 className="text-xs font-bold text-slate-800">
                    Upload or Replace Documents
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    Uploading a document will replace the existing file on file and return your application status to Pending Verification for administrative re-review.
                  </p>

                  {docUploadSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{docUploadSuccess}</span>
                    </div>
                  )}

                  {docUploadError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <span>{docUploadError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        NMC / State Registration Certificate
                      </label>
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg"
                        onChange={(e) => setRegFile(e.target.files[0] || null)}
                        className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-800 hover:file:bg-emerald-100 cursor-pointer w-full"
                      />
                      {regFile && (
                        <p className="text-[11px] text-emerald-700 font-semibold truncate">
                          ✓ {regFile.name}
                        </p>
                      )}
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Degree Certificate (Optional)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,image/png,image/jpeg"
                        onChange={(e) => setDegreeFile(e.target.files[0] || null)}
                        className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-800 hover:file:bg-blue-100 cursor-pointer w-full"
                      />
                      {degreeFile && (
                        <p className="text-[11px] text-brand-blue font-semibold truncate">
                          ✓ {degreeFile.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={uploadingDoc || (!regFile && !degreeFile)}
                      className="font-bold text-xs"
                    >
                      <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                      {uploadingDoc ? "Uploading..." : "Upload & Resubmit for Review"}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Application Details Summary */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Submitted Profile Summary
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Practitioner Name:</span>
                    <p className="font-semibold text-slate-800">{appData.full_name}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Registration Number:</span>
                    <p className="font-semibold text-slate-800">{appData.registration_number}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Issuing Council:</span>
                    <p className="font-semibold text-slate-800">{appData.issuing_council}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Specialty & Experience:</span>
                    <p className="font-semibold text-slate-800">
                      {appData.specialization} ({appData.experience_years} Years)
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Consultation Fee:</span>
                    <p className="font-semibold text-slate-800">₹{appData.consultation_fee}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Languages:</span>
                    <p className="font-semibold text-slate-800">
                      {Array.isArray(appData.consultation_languages)
                        ? appData.consultation_languages.join(", ")
                        : "English, Hindi"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Refresh Action */}
              <div className="pt-2 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchStatus}
                  className="text-xs border-slate-300"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Check Status Again
                </Button>
                <Link href="/" className="text-xs font-bold text-brand-emerald hover:underline">
                  Return to Homepage
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
