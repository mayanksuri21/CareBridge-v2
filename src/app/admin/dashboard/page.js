"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import {
  ShieldAlert,
  HeartPulse,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Users,
  UserCheck,
  LogOut,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  Clock,
  Mail,
  Phone,
  Filter,
  Eye,
} from "lucide-react";
import {
  getApplicantDocuments,
  createAdminDocumentSignedUrl,
  runBackfillDoctorDocuments,
} from "../../../lib/adminDocumentActions";

export default function AdminDashboardShell() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState(null);
  const [activeTab, setActiveTab] = useState("verification"); // 'verification' | 'users'

  // Tab 1: Verification Requests state
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [docSignedUrls, setDocSignedUrls] = useState({});
  const [generatingUrl, setGeneratingUrl] = useState(false);

  // Registry check state
  const [registryCheck, setRegistryCheck] = useState(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [showRegistryJson, setShowRegistryJson] = useState(false);

  // Tab 2: All Users state
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all"); // 'all' | 'patient' | 'doctor' | 'admin'
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalCount, setUsersTotalCount] = useState(0);
  const PAGE_SIZE = 15;

  // Verify administrator access strictly against public.administrators
  const verifyAdmin = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.push("/admin/login");
      return null;
    }

    const { data: adminRecord, error: adminErr } = await supabase
      .from("administrators")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (adminErr || !adminRecord) {
      await supabase.auth.signOut();
      router.push("/admin/login?error=unauthorized");
      return null;
    }

    setAdminUser(session.user);
    return session.user;
  }, [router, supabase]);

  // Load verification requests
  const loadApplications = useCallback(async () => {
    try {
      const { data: apps } = await supabase
        .from("doctor_applications")
        .select("*, doctor_documents(*)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (apps) {
        setApplications(apps);
        // keep selectedApp in sync if still present
        if (apps.length > 0) {
          setSelectedApp((prev) => {
            if (!prev) return apps[0];
            const updated = apps.find((a) => a.id === prev.id);
            return updated || apps[0];
          });
        } else {
          setSelectedApp(null);
        }
      }
    } catch {
      // Table query failure handled gracefully
    }
  }, [supabase]);

  // Load users for All Users tab with pagination & safe bounded query
  const loadUsers = useCallback(
    async (page = 1, search = "", role = "all") => {
      setUsersLoading(true);
      try {
        let query = supabase
          .from("profiles")
          .select("id, full_name, email, phone, role, is_active, created_at, updated_at", {
            count: "exact",
          });

        if (role !== "all") {
          query = query.eq("role", role);
        }

        if (search.trim()) {
          query = query.or(
            `full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`
          );
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, count, error } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!error && data) {
          // Cross-reference user_ids with doctor_applications for application status
          const userIds = data.map((u) => u.id);
          let appsMap = {};

          if (userIds.length > 0) {
            const { data: relatedApps } = await supabase
              .from("doctor_applications")
              .select("user_id, status")
              .in("user_id", userIds);

            if (relatedApps) {
              relatedApps.forEach((a) => {
                appsMap[a.user_id] = a.status;
              });
            }
          }

          const enriched = data.map((u) => ({
            ...u,
            doctor_app_status: appsMap[u.id] || null,
          }));

          setUsersList(enriched);
          setUsersTotalCount(count || 0);
        }
      } catch {
        // Handled
      } finally {
        setUsersLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
      const user = await verifyAdmin();
      if (user) {
        await loadApplications();
      }
      setLoading(false);
    }
    init();
  }, [verifyAdmin, loadApplications]);

  useEffect(() => {
    if (activeTab === "users") {
      loadUsers(usersPage, userSearch, userRoleFilter);
    }
  }, [activeTab, usersPage, userSearch, userRoleFilter, loadUsers]);

  // Load documents for selected application using server action (with storage fallback)
  const [applicantDocs, setApplicantDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    async function fetchDocs() {
      if (!selectedApp) {
        setApplicantDocs([]);
        setRegistryCheck(null);
        setShowRegistryJson(false);
        return;
      }
      setReviewNotes(selectedApp.review_notes || "");
      setDocSignedUrls({});
      setDocsLoading(true);

      const res = await getApplicantDocuments(selectedApp.user_id, selectedApp.id);
      if (res.success && res.documents) {
        setApplicantDocs(res.documents);
      } else {
        setApplicantDocs(selectedApp.doctor_documents || []);
      }
      setDocsLoading(false);

      // Load registry check status
      loadRegistryCheck(selectedApp.id);
    }

    fetchDocs();
  }, [selectedApp]);

  const loadRegistryCheck = async (applicationId) => {
    setRegistryLoading(true);
    try {
      const res = await fetch(`/api/agents/credential/status?application_id=${applicationId}`);
      const data = await res.json();
      if (res.ok) {
        setRegistryCheck(data);
      } else {
        setRegistryCheck(null);
      }
    } catch (err) {
      console.error("Failed to load registry check:", err);
      setRegistryCheck(null);
    } finally {
      setRegistryLoading(false);
    }
  };

  const handleRerunRegistryCheck = async () => {
    if (!selectedApp) return;
    setRegistryLoading(true);
    try {
      const res = await fetch("/api/agents/credential/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: selectedApp.id }),
      });
      if (res.ok) {
        await loadRegistryCheck(selectedApp.id);
      }
    } catch (err) {
      console.error("Failed to rerun registry check:", err);
    } finally {
      setRegistryLoading(false);
    }
  };

  // Generate short-lived signed URL (60 seconds) strictly via authorized server action
  const handleGenerateSignedUrl = async (storagePath, docId) => {
    setGeneratingUrl(true);
    setFeedbackMsg("");
    try {
      const res = await createAdminDocumentSignedUrl(storagePath);

      if (!res.success) {
        setFeedbackMsg(`Storage access error: ${res.error}`);
      } else if (res.signedUrl) {
        setDocSignedUrls((prev) => ({
          ...prev,
          [docId]: res.signedUrl,
        }));
      }
    } catch (err) {
      setFeedbackMsg(`Failed to create signed URL: ${err.message}`);
    } finally {
      setGeneratingUrl(false);
    }
  };

  const handleDecision = async (newStatus) => {
    if (!selectedApp) return;

    if (newStatus === "rejected" && !reviewNotes.trim()) {
      setFeedbackMsg("A justification reason in the review notes is required when rejecting an application.");
      return;
    }

    setActionLoading(true);
    setFeedbackMsg("");

    try {
      // 1. Update doctor_applications with audit fields
      const { error: updateErr } = await supabase
        .from("doctor_applications")
        .update({
          status: newStatus,
          review_notes: reviewNotes.trim() || null,
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedApp.id);

      if (updateErr) throw updateErr;

      // 2. If approved, promote user's profile role to 'doctor'
      if (newStatus === "approved") {
        await supabase
          .from("profiles")
          .update({ role: "doctor", updated_at: new Date().toISOString() })
          .eq("id", selectedApp.user_id);
      } else if (newStatus === "rejected" || newStatus === "changes_requested") {
        // Demote back to patient if previously set to doctor
        await supabase
          .from("profiles")
          .update({ role: "patient", updated_at: new Date().toISOString() })
          .eq("id", selectedApp.user_id);
      }

      setFeedbackMsg(`Application successfully updated: marked as ${newStatus.toUpperCase()}`);
      await loadApplications();
    } catch (err) {
      setFeedbackMsg(`Decision update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-400">Verifying Administrator Privileges...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(usersTotalCount / PAGE_SIZE) || 1;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Admin Top Navbar */}
      <header className="bg-slate-800/90 border-b border-slate-700 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white">
                Care<span className="text-emerald-400">Bridge</span>
              </span>
              <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-700 text-emerald-400 border border-slate-600">
                Medical Admin Verification
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 hidden sm:inline">
              Admin: <strong className="text-slate-200">{adminUser?.email}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-xs bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Admin Interface */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Banner with Tabs */}
        <div className="bg-slate-800/80 p-6 rounded-2xl border border-slate-700 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">
                Doctor Credential Verification & User Directory
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Authorized medical administration workspace. All review actions require authenticated administrator verification.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activeTab === "verification") loadApplications();
                else loadUsers(usersPage, userSearch, userRoleFilter);
              }}
              className="text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-700 gap-2 pt-2">
            <button
              onClick={() => setActiveTab("verification")}
              className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${activeTab === "verification"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
            >
              <UserCheck className="w-4 h-4" />
              Doctor Verification Requests ({applications.length})
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-colors ${activeTab === "users"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
            >
              <Users className="w-4 h-4" />
              All Registered Users {usersTotalCount > 0 ? `(${usersTotalCount})` : ""}
            </button>
          </div>
        </div>

        {feedbackMsg && (
          <div className="rounded-xl bg-slate-800 border border-emerald-500/50 p-4 text-xs text-emerald-300">
            {feedbackMsg}
          </div>
        )}

        {/* TAB 1: Verification Requests */}
        {activeTab === "verification" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Applications Queue List */}
            <div className="lg:col-span-5 bg-slate-800/60 rounded-2xl border border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Application Review Queue ({applications.length})
                </span>
              </div>

              {applications.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No doctor applications submitted yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => setSelectedApp(app)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${selectedApp?.id === app.id
                        ? "bg-slate-700/80 border-emerald-500 shadow-md"
                        : "bg-slate-800/40 border-slate-700/60 hover:bg-slate-800"
                        }`}
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="text-sm font-bold text-white">{app.full_name}</h4>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${app.status === "approved"
                            ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                            : app.status === "pending"
                              ? "bg-blue-950/80 text-blue-400 border-blue-800"
                              : app.status === "changes_requested"
                                ? "bg-amber-950/80 text-amber-400 border-amber-800"
                                : "bg-rose-950/80 text-rose-400 border-rose-800"
                            }`}
                        >
                          {app.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {app.specialization} • Reg: {app.registration_number}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Fee: ₹{app.consultation_fee}</span>
                        <span>{new Date(app.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detailed Verification & Document Review Pane */}
            <div className="lg:col-span-7 bg-slate-800/60 rounded-2xl border border-slate-700 p-6 space-y-6">
              {selectedApp ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between border-b border-slate-700 pb-4">
                    <div>
                      <h3 className="text-lg font-black text-white">{selectedApp.full_name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {selectedApp.email} • {selectedApp.phone}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Auth User ID: <code className="text-slate-400">{selectedApp.user_id}</code>
                      </p>
                    </div>
                    <span
                      className={`text-xs font-black uppercase px-3 py-1 rounded-full border ${selectedApp.status === "approved"
                        ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                        : selectedApp.status === "pending"
                          ? "bg-blue-950 text-blue-300 border-blue-800"
                          : selectedApp.status === "changes_requested"
                            ? "bg-amber-950 text-amber-300 border-amber-800"
                            : "bg-rose-950 text-rose-300 border-rose-800"
                        }`}
                    >
                      Status: {selectedApp.status}
                    </span>
                  </div>

                  {/* Medical Information Grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs bg-slate-900/60 p-4 rounded-xl border border-slate-700/60">
                    <div>
                      <span className="text-slate-500">Degree & Qualification:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">{selectedApp.qualification}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Graduating Institute:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">{selectedApp.institution}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Registration Number:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">{selectedApp.registration_number}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Issuing Council:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">{selectedApp.issuing_council}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Specialty & Experience:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">
                        {selectedApp.specialization} ({selectedApp.experience_years} Years)
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Proposed Fee:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">₹{selectedApp.consultation_fee}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Languages:</span>
                      <p className="font-semibold text-slate-200 mt-0.5">
                        {Array.isArray(selectedApp.consultation_languages)
                          ? selectedApp.consultation_languages.join(", ")
                          : "English, Hindi"}
                      </p>
                    </div>
                    {selectedApp.bio && (
                      <div className="col-span-2 pt-2 border-t border-slate-800">
                        <span className="text-slate-500">Clinical Bio:</span>
                        <p className="text-slate-300 mt-0.5 leading-relaxed">{selectedApp.bio}</p>
                      </div>
                    )}
                  </div>

                  {/* Registry Check Panel */}
                  <div className="space-y-3 pt-3 border-t border-slate-700">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Registry Check
                      </h4>
                      <div className="flex items-center gap-2">
                        {registryLoading && (
                          <span className="text-[11px] text-emerald-400 animate-pulse">Checking...</span>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={registryLoading}
                          onClick={handleRerunRegistryCheck}
                          className="text-xs border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          <RefreshCw className={`w-3 h-3.5 mr-1 ${registryLoading ? "animate-spin" : ""}`} />
                          Re-run
                        </Button>
                      </div>
                    </div>

                    {registryCheck && registryCheck.exists && registryCheck.agentRun ? (
                      <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${registryCheck.agentRun.comparison === "match"
                              ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                              : registryCheck.agentRun.comparison === "mismatch"
                                ? "bg-rose-950/80 text-rose-400 border-rose-800"
                                : registryCheck.agentRun.status === "running"
                                  ? "bg-blue-950/80 text-blue-400 border-blue-800"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                          >
                            {registryCheck.agentRun.comparison === "match"
                              ? "Match"
                              : registryCheck.agentRun.comparison === "mismatch"
                                ? "Mismatch"
                                : registryCheck.agentRun.status === "running"
                                  ? "Running"
                                  : "Unverified"}
                          </span>
                          <button
                            onClick={() => setShowRegistryJson(!showRegistryJson)}
                            className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                          >
                            {showRegistryJson ? "Hide" : "Show"} Raw JSON
                          </button>
                        </div>

                        {registryCheck.agentRun.status === "running" && (
                          <p className="text-xs text-slate-400">Agent is checking the registry...</p>
                        )}

                        {registryCheck.agentRun.comparison === "unverified" && (
                          <p className="text-xs text-amber-300">
                            Registry could not be checked automatically. Verify manually.
                          </p>
                        )}

                        {registryCheck.agentRun.result && (
                          <div className="space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-slate-500">Registry Name:</span>
                                <p className="font-semibold text-slate-200">
                                  {registryCheck.agentRun.result.name || "N/A"}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Applicant Name:</span>
                                <p className="font-semibold text-slate-200">{selectedApp?.full_name || "N/A"}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Registry Status:</span>
                                <p className="font-semibold text-slate-200">
                                  {registryCheck.agentRun.result.status || "N/A"}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Specialty:</span>
                                <p className="font-semibold text-slate-200">
                                  {registryCheck.agentRun.result.specialty || "N/A"}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Council:</span>
                                <p className="font-semibold text-slate-200">
                                  {registryCheck.agentRun.result.council || "N/A"}
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Blocked:</span>
                                <p className="font-semibold text-slate-200">
                                  {registryCheck.agentRun.result.blocked ? "Yes" : "No"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {showRegistryJson && (
                          <div className="bg-slate-950 rounded-lg p-3 overflow-x-auto">
                            <pre className="text-[10px] text-slate-400 font-mono">
                              {JSON.stringify(registryCheck.agentRun.result || registryCheck.agentRun, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                        No registry check run yet. Click &quot;Re-run&quot; to start verification.
                      </p>
                    )}
                  </div>

                  {/* Submitted Credential Documents with Signed URLs */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Submitted Credential Documents ({applicantDocs.length})
                      </h4>
                      {docsLoading && (
                        <span className="text-[11px] text-emerald-400 animate-pulse">Loading documents...</span>
                      )}
                    </div>

                    {/* Missing Registration Document Alert */}
                    {applicantDocs.length === 0 ||
                      !applicantDocs.some(
                        (d) =>
                          d.document_type?.toLowerCase().includes("registration") ||
                          d.document_type?.toLowerCase().includes("nmc") ||
                          d.file_name?.toLowerCase().includes("registration")
                      ) ? (
                      <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-200 text-xs flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div>
                          <p className="font-bold">Registration certificate not uploaded</p>
                          <p className="text-[11px] text-amber-300/80">
                            The medical council registration certificate is mandatory before an application can be approved.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {applicantDocs && applicantDocs.length > 0 ? (
                        applicantDocs.map((doc) => {
                          const signedUrl = docSignedUrls[doc.id];
                          const isReg =
                            doc.document_type?.toLowerCase().includes("registration") ||
                            doc.document_type?.toLowerCase().includes("nmc");
                          const typeLabel = isReg ? "NMC Registration Certificate" : "Degree Certificate";

                          return (
                            <div
                              key={doc.id}
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-slate-700 text-xs gap-3"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-slate-200">{doc.file_name}</p>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">
                                      {typeLabel}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    Size: {doc.file_size ? (doc.file_size / 1024).toFixed(1) + " KB" : "Unknown"} •{" "}
                                    Uploaded: {doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-IN") : "Recent"}
                                    {doc.is_storage_fallback && (
                                      <span className="text-amber-400 font-semibold ml-1.5">(Discovered via Storage)</span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {signedUrl ? (
                                  <>
                                    <a
                                      href={signedUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View
                                      <ExternalLink className="w-3 h-3 ml-0.5" />
                                    </a>
                                    <a
                                      href={signedUrl}
                                      download={doc.file_name}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      Download
                                    </a>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={generatingUrl}
                                    onClick={() => handleGenerateSignedUrl(doc.storage_path, doc.id)}
                                    className="text-xs border-slate-600 bg-slate-800 text-emerald-400 hover:bg-slate-700"
                                  >
                                    Generate Secure Link (60s)
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                          No credential documents currently recorded for this applicant.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Review Notes and Decision Actions */}
                  <div className="space-y-3 pt-3 border-t border-slate-700">
                    <label className="block text-xs font-bold text-slate-300">
                      Administrator Review Notes / Reason
                      <span className="text-slate-500 font-normal ml-1">
                        (Required when rejecting; visible to applicant on status portal)
                      </span>
                    </label>
                    <textarea
                      rows="3"
                      placeholder="Enter verification notes, approval confirmation, or specific rejection reason..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {/* Approve button is disabled if required registration certificate is missing */}
                      <Button
                        variant="primary"
                        size="md"
                        disabled={
                          actionLoading ||
                          selectedApp.status === "approved" ||
                          applicantDocs.length === 0 ||
                          !applicantDocs.some(
                            (d) =>
                              d.document_type?.toLowerCase().includes("registration") ||
                              d.document_type?.toLowerCase().includes("nmc") ||
                              d.file_name?.toLowerCase().includes("registration")
                          )
                        }
                        onClick={() => handleDecision("approved")}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          applicantDocs.length === 0 ||
                            !applicantDocs.some(
                              (d) =>
                                d.document_type?.toLowerCase().includes("registration") ||
                                d.document_type?.toLowerCase().includes("nmc") ||
                                d.file_name?.toLowerCase().includes("registration")
                            )
                            ? "Cannot approve without a verified registration certificate."
                            : "Approve Doctor"
                        }
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Approve Doctor
                      </Button>

                      <Button
                        variant="outline"
                        size="md"
                        disabled={actionLoading || selectedApp.status === "changes_requested"}
                        onClick={() => {
                          if (
                            applicantDocs.length === 0 ||
                            !applicantDocs.some(
                              (d) =>
                                d.document_type?.toLowerCase().includes("registration") ||
                                d.document_type?.toLowerCase().includes("nmc") ||
                                d.file_name?.toLowerCase().includes("registration")
                            )
                          ) {
                            if (!reviewNotes) {
                              setReviewNotes("Please upload a clear copy of your official NMC or State Medical Council Registration Certificate.");
                            }
                          }
                          handleDecision("changes_requested");
                        }}
                        className="bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900 text-xs font-bold"
                      >
                        <AlertTriangle className="w-4 h-4 mr-1.5" />
                        Request Changes
                      </Button>

                      <Button
                        variant="outline"
                        size="md"
                        disabled={actionLoading || selectedApp.status === "rejected"}
                        onClick={() => handleDecision("rejected")}
                        className="bg-rose-950/40 border-rose-800 text-rose-300 hover:bg-rose-900 text-xs font-bold"
                      >
                        <XCircle className="w-4 h-4 mr-1.5" />
                        Reject Application
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-xs text-slate-500">
                  Select an application from the queue to view credentials and perform verification.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: All Users */}
        {activeTab === "users" && (
          <div className="bg-slate-800/60 rounded-2xl border border-slate-700 p-6 space-y-4">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUsersPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={userRoleFilter}
                  onChange={(e) => {
                    setUserRoleFilter(e.target.value);
                    setUsersPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">All Roles</option>
                  <option value="patient">Patients Only</option>
                  <option value="doctor">Verified Doctors Only</option>
                  <option value="admin">Admins Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-700/80">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Doctor Application</th>
                    <th className="py-3 px-4">Active Status</th>
                    <th className="py-3 px-4">Registered Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {usersLoading ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading directory...
                      </td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-500">
                        No user accounts match the current query.
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{u.full_name}</p>
                          <p className="text-[11px] text-slate-400">{u.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${u.role === "admin"
                              ? "bg-rose-950/80 text-rose-300 border-rose-800"
                              : u.role === "doctor"
                                ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                              }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {u.phone || <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-3 px-4">
                          {u.doctor_app_status ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${u.doctor_app_status === "approved"
                                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                                : u.doctor_app_status === "pending"
                                  ? "bg-blue-950/60 text-blue-400 border-blue-800"
                                  : "bg-amber-950/60 text-amber-400 border-amber-800"
                                }`}
                            >
                              {u.doctor_app_status}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[11px]">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-3 text-xs text-slate-400">
              <span>
                Showing page <strong>{usersPage}</strong> of <strong>{totalPages}</strong> ({usersTotalCount} users total)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={usersPage <= 1 || usersLoading}
                  onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                  className="text-xs border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={usersPage >= totalPages || usersLoading}
                  onClick={() => setUsersPage((p) => p + 1)}
                  className="text-xs border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
