"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import { JoinConsultationButton } from "../../../components/consultation/JoinConsultationButton";
import {
  HeartPulse,
  Stethoscope,
  Calendar,
  Clock,
  Video,
  FileText,
  LogOut,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Users,
  CalendarCheck,
  CalendarX,
  CreditCard,
  UserCheck,
  ChevronRight,
  Info,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Lock,
  Save,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  addDoctorShift,
  updateDoctorShift,
  toggleDoctorShiftStatus,
  deleteDoctorShift,
  copyShiftsToDays,
  addDoctorLeave,
  updateDoctorLeave,
  deleteDoctorLeave,
  updateDoctorProfile,
} from "../../../lib/doctorActions";
import {
  getDoctorAppointments,
  respondToAppointmentAction,
  cancelAppointmentAction,
  checkLeaveConflicts,
} from "../../../lib/appointmentActions";

const DAYS_OF_WEEK = [
  { id: 1, name: "Monday", short: "Mon" },
  { id: 2, name: "Tuesday", short: "Tue" },
  { id: 3, name: "Wednesday", short: "Wed" },
  { id: 4, name: "Thursday", short: "Thu" },
  { id: 5, name: "Friday", short: "Fri" },
  { id: 6, name: "Saturday", short: "Sat" },
  { id: 0, name: "Sunday", short: "Sun" },
];

export default function DoctorDashboardShell() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [doctorApp, setDoctorApp] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Access state: null (checking), 'authorized', 'unverified'
  const [accessState, setAccessState] = useState(null);
  const [unverifiedReason, setUnverifiedReason] = useState("");

  // Schedule & Leave state
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  // Shift form state
  const [shiftForm, setShiftForm] = useState({
    isOpen: false,
    isEdit: false,
    id: null,
    day_of_week: 1,
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_mins: 15,
  });
  const [shiftActionLoading, setShiftActionLoading] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [shiftSuccess, setShiftSuccess] = useState("");

  // Copy helper modal
  const [copyModal, setCopyModal] = useState({
    isOpen: false,
    sourceDay: 1,
    targetDays: [2, 3, 4, 5],
  });
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");

  // Leave form state
  const [leaveForm, setLeaveForm] = useState({
    isOpen: false,
    isEdit: false,
    id: null,
    leave_start: "",
    leave_end: "",
    reason: "",
  });
  const [leaveActionLoading, setLeaveActionLoading] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaveSuccess, setLeaveSuccess] = useState("");

  // Profile edit form state
  const [profileForm, setProfileForm] = useState({
    consultation_fee: "",
    phone: "",
    bio: "",
    consultation_languages: [],
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  // Appointments state
  const [appointments, setAppointments] = useState([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [apptActionLoading, setApptActionLoading] = useState(false);
  const [apptActionMsg, setApptActionMsg] = useState("");
  const [declineModal, setDeclineModal] = useState({ isOpen: false, id: null, note: "" });

  // Leave conflict warning state
  const [leaveConflictWarning, setLeaveConflictWarning] = useState({
    isOpen: false,
    conflicts: [],
    pendingLeaveData: null,
  });

  const loadDoctorData = useCallback(async (userId) => {
    try {
      setLoadingSchedule(true);
      setLoadingLeaves(true);
      setLoadingAppts(true);

      const [schedRes, leaveRes, apptsRes] = await Promise.all([
        supabase
          .from("doctor_schedules")
          .select("*")
          .eq("doctor_id", userId)
          .order("start_time", { ascending: true }),
        supabase
          .from("doctor_leaves")
          .select("*")
          .eq("doctor_id", userId)
          .order("leave_start", { ascending: true }),
        getDoctorAppointments(),
      ]);

      if (schedRes.data) setSchedules(schedRes.data);
      if (leaveRes.data) setLeaves(leaveRes.data);
      if (apptsRes.success) setAppointments(apptsRes.appointments || []);
    } catch {
      // Handled silently
    } finally {
      setLoadingSchedule(false);
      setLoadingLeaves(false);
      setLoadingAppts(false);
    }
  }, [supabase]);

  useEffect(() => {
    async function verifyDoctorAccess() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push("/doctor/login");
          return;
        }

        setUser(session.user);

        // Fetch trusted server-side doctor application status
        const { data: docData } = await supabase
          .from("doctor_applications")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!docData) {
          setAccessState("unverified");
          setUnverifiedReason("no_application");
          setLoading(false);
          return;
        }

        // Check verification status
        if (docData.status !== "approved") {
          setDoctorApp(docData);
          setAccessState("unverified");
          setUnverifiedReason(docData.status);
          setLoading(false);
          return;
        }

        // Approved doctor
        setDoctorApp(docData);
        setProfileForm({
          consultation_fee: docData.consultation_fee || "",
          phone: docData.phone || "",
          bio: docData.bio || "",
          consultation_languages: Array.isArray(docData.consultation_languages)
            ? docData.consultation_languages
            : ["English", "Hindi"],
        });
        setAccessState("authorized");
        loadDoctorData(session.user.id);
      } catch {
        // network or table errors
      } finally {
        setLoading(false);
      }
    }

    verifyDoctorAccess();
  }, [router, supabase, loadDoctorData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // --- Shift Calculations & Helpers ---
  const calculateSlots = (startTime, endTime, durationMins) => {
    if (!startTime || !endTime || !durationMins) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (endMins <= startMins) return 0;
    return Math.floor((endMins - startMins) / durationMins);
  };

  // Total weekly consultation hours
  const totalWeeklyMinutes = schedules
    .filter((s) => s.is_active)
    .reduce((acc, curr) => {
      const [sh, sm] = curr.start_time.split(":").map(Number);
      const [eh, em] = curr.end_time.split(":").map(Number);
      return acc + (eh * 60 + em - (sh * 60 + sm));
    }, 0);
  const totalWeeklyHours = (totalWeeklyMinutes / 60).toFixed(1);

  // Next upcoming leave
  const todayStr = new Date().toISOString().split("T")[0];
  const nextLeave = leaves
    .filter((l) => l.leave_end >= todayStr)
    .sort((a, b) => a.leave_start.localeCompare(b.leave_start))[0];

  // --- Handlers: Shift Management ---
  const handleOpenAddShift = (dayOfWeek = 1) => {
    setShiftError("");
    setShiftSuccess("");
    setShiftForm({
      isOpen: true,
      isEdit: false,
      id: null,
      day_of_week: dayOfWeek,
      start_time: "09:00",
      end_time: "13:00",
      slot_duration_mins: 15,
    });
  };

  const handleOpenEditShift = (shift) => {
    setShiftError("");
    setShiftSuccess("");
    setShiftForm({
      isOpen: true,
      isEdit: true,
      id: shift.id,
      day_of_week: shift.day_of_week,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      slot_duration_mins: shift.slot_duration_mins,
      is_active: shift.is_active,
    });
  };

  const handleSaveShift = async (e) => {
    e.preventDefault();
    setShiftActionLoading(true);
    setShiftError("");
    setShiftSuccess("");

    const res = shiftForm.isEdit
      ? await updateDoctorShift(shiftForm)
      : await addDoctorShift(shiftForm);

    if (res.success) {
      setShiftSuccess(shiftForm.isEdit ? "Shift updated successfully!" : "Shift added successfully!");
      setShiftForm((prev) => ({ ...prev, isOpen: false }));
      if (user) loadDoctorData(user.id);
    } else {
      setShiftError(res.error || "Failed to save shift.");
    }
    setShiftActionLoading(false);
  };

  const handleToggleShift = async (shift) => {
    const res = await toggleDoctorShiftStatus(shift.id, !shift.is_active);
    if (res.success) {
      if (user) loadDoctorData(user.id);
    } else {
      alert(res.error || "Failed to toggle shift status.");
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!confirm("Are you sure you want to delete this availability shift?")) return;
    const res = await deleteDoctorShift(shiftId);
    if (res.success) {
      if (user) loadDoctorData(user.id);
    } else {
      alert(res.error || "Failed to delete shift.");
    }
  };

  const handleCopyShifts = async () => {
    setCopyLoading(true);
    setCopyMsg("");
    const res = await copyShiftsToDays(copyModal.sourceDay, copyModal.targetDays);
    if (res.success) {
      setCopyMsg(`Successfully copied shifts to selected days!`);
      setTimeout(() => {
        setCopyModal((prev) => ({ ...prev, isOpen: false }));
        setCopyMsg("");
      }, 1200);
      if (user) loadDoctorData(user.id);
    } else {
      setCopyMsg(res.error || "Failed to copy shifts.");
    }
    setCopyLoading(false);
  };

  // --- Handlers: Leave Management ---
  const handleOpenAddLeave = () => {
    setLeaveError("");
    setLeaveSuccess("");
    setLeaveForm({
      isOpen: true,
      isEdit: false,
      id: null,
      leave_start: todayStr,
      leave_end: todayStr,
      reason: "",
    });
  };

  const handleOpenEditLeave = (leave) => {
    setLeaveError("");
    setLeaveSuccess("");
    setLeaveForm({
      isOpen: true,
      isEdit: true,
      id: leave.id,
      leave_start: leave.leave_start,
      leave_end: leave.leave_end,
      reason: leave.reason || "",
    });
  };

  const executeSaveLeave = async (leaveData) => {
    setLeaveActionLoading(true);
    setLeaveError("");
    setLeaveSuccess("");

    const res = leaveData.isEdit
      ? await updateDoctorLeave(leaveData)
      : await addDoctorLeave(leaveData);

    if (res.success) {
      setLeaveSuccess(leaveData.isEdit ? "Leave updated successfully!" : "Leave added successfully!");
      setLeaveForm((prev) => ({ ...prev, isOpen: false }));
      setLeaveConflictWarning({ isOpen: false, conflicts: [], pendingLeaveData: null });
      if (user) loadDoctorData(user.id);
    } else {
      setLeaveError(res.error || "Failed to save leave.");
    }
    setLeaveActionLoading(false);
  };

  const handleSaveLeave = async (e) => {
    e.preventDefault();
    setLeaveActionLoading(true);
    setLeaveError("");
    setLeaveSuccess("");

    if (leaveForm.leave_start < todayStr) {
      const proceed = confirm("Note: The selected leave start date is in the past. Do you still wish to proceed?");
      if (!proceed) {
        setLeaveActionLoading(false);
        return;
      }
    }

    // Step 3 Requirement: Check if proposed leave conflicts with existing requested or confirmed appointments
    const conflictRes = await checkLeaveConflicts(leaveForm.leave_start, leaveForm.leave_end);
    if (conflictRes.success && conflictRes.conflicts && conflictRes.conflicts.length > 0) {
      setLeaveConflictWarning({
        isOpen: true,
        conflicts: conflictRes.conflicts,
        pendingLeaveData: { ...leaveForm },
      });
      setLeaveActionLoading(false);
      return;
    }

    await executeSaveLeave(leaveForm);
  };

  const handleDeleteLeave = async (leaveId) => {
    if (!confirm("Are you sure you want to remove this leave period?")) return;
    const res = await deleteDoctorLeave(leaveId);
    if (res.success) {
      if (user) loadDoctorData(user.id);
    } else {
      alert(res.error || "Failed to delete leave.");
    }
  };

  // --- Handlers: Appointments ---
  const handleAcceptAppointment = async (appointmentId) => {
    setApptActionLoading(true);
    setApptActionMsg("");
    const res = await respondToAppointmentAction({
      appointmentId,
      action: "confirmed",
    });
    if (!res.success) {
      alert(res.error || "Failed to confirm appointment.");
    } else {
      setApptActionMsg("Appointment confirmed successfully.");
      if (user) loadDoctorData(user.id);
    }
    setApptActionLoading(false);
  };

  const handleOpenDecline = (appointmentId) => {
    setDeclineModal({ isOpen: true, id: appointmentId, note: "" });
  };

  const handleConfirmDecline = async (e) => {
    e.preventDefault();
    if (!declineModal.note.trim()) {
      alert("A decline reason note is required.");
      return;
    }

    setApptActionLoading(true);
    const res = await respondToAppointmentAction({
      appointmentId: declineModal.id,
      action: "declined",
      note: declineModal.note.trim(),
    });

    if (!res.success) {
      alert(res.error || "Failed to decline appointment.");
    } else {
      setDeclineModal({ isOpen: false, id: null, note: "" });
      setApptActionMsg("Appointment request declined.");
      if (user) loadDoctorData(user.id);
    }
    setApptActionLoading(false);
  };

  const handleCancelDoctorAppointment = async (appointmentId) => {
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    setApptActionLoading(true);
    const res = await cancelAppointmentAction(appointmentId);
    if (!res.success) {
      alert(res.error || "Failed to cancel appointment.");
    } else {
      setApptActionMsg("Appointment cancelled.");
      if (user) loadDoctorData(user.id);
    }
    setApptActionLoading(false);
  };

  // --- Handlers: Profile Updates ---
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError("");
    setProfileSuccess("");

    const res = await updateDoctorProfile(profileForm);
    if (res.success) {
      setProfileSuccess("Doctor profile and consultation fee updated successfully!");
      setDoctorApp(res.data);
    } else {
      setProfileError(res.error || "Failed to update profile.");
    }
    setProfileLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Verifying Doctor Authorization...</p>
        </div>
      </div>
    );
  }

  // UNVERIFIED DOCTOR SCREEN
  if (accessState === "unverified") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto w-full space-y-6">
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2 group mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-blue to-blue-500 flex items-center justify-center text-white shadow-md">
                <HeartPulse className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black tracking-tight text-slate-900">
                Care<span className="text-brand-blue">Bridge</span>
              </span>
            </Link>
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                Access Restricted
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-black text-slate-900">Doctor Dashboard Restricted</h2>
            <p className="mt-1 text-xs text-slate-600">
              Account: <strong className="text-slate-800">{user?.email}</strong>
            </p>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-md card-elevation space-y-5 text-center">
            {unverifiedReason === "no_application" ? (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No Doctor Application on File</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You are signed in, but have not submitted your medical credentials for NMC verification yet. Doctor privileges require an approved platform application.
                </p>
                <div className="pt-2">
                  <Link href="/doctor/apply">
                    <Button variant="primary" size="sm" className="font-bold text-xs">
                      Submit Doctor Application
                    </Button>
                  </Link>
                </div>
              </div>
            ) : unverifiedReason === "pending" ? (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-brand-blue flex items-center justify-center mx-auto">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Application Pending Verification</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your medical credentials and NMC registration details are currently under review by CareBridge administrators. You cannot access the doctor dashboard until an administrator approves your application.
                </p>
                <div className="pt-2">
                  <Link href="/doctor/application-status">
                    <Button variant="outline" size="sm" className="text-xs text-brand-blue border-blue-300">
                      View Application Review Status
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Application Not Approved</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your medical application could not be verified against the official medical council directory. Clinical features remain inaccessible.
                </p>
                <div className="pt-2">
                  <Link href="/doctor/application-status">
                    <Button variant="outline" size="sm" className="text-xs text-rose-700 border-rose-300">
                      Check Status Details
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                size="md"
                onClick={handleSignOut}
                className="w-full text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="w-4 h-4 mr-1.5 text-rose-600" />
                Sign Out of Account
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Appointment Slices
  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const pendingRequests = appointments.filter((a) => a.status === "requested");
  const confirmedAppointments = appointments.filter((a) => a.status === "confirmed");
  const todayAppointments = appointments.filter((a) => {
    const apptDateStr = new Date(a.starts_at).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    return apptDateStr === todayDateStr && ["requested", "confirmed"].includes(a.status);
  });
  const pastAppointments = appointments.filter((a) => {
    const isFuture = new Date(a.starts_at) > now;
    const isActive = ["requested", "confirmed"].includes(a.status);
    return !isFuture || !isActive;
  });

  // AUTHORIZED DOCTOR DASHBOARD
  const navigationItems = [
    { id: "overview", label: "Overview & Metrics", icon: HeartPulse },
    { id: "schedule", label: "Availability Schedule", icon: Clock },
    { id: "leave", label: "Leave Days", icon: CalendarX },
    { id: "profile", label: "Profile & Consultation Fee", icon: CreditCard },
    {
      id: "requests",
      label: "Incoming Consultation Requests",
      icon: Users,
      badge: pendingRequests.length > 0 ? pendingRequests.length : null,
      badgeVariant: "rose",
    },
    {
      id: "confirmed",
      label: "Confirmed Requests",
      icon: CheckCircle2,
      badge: confirmedAppointments.length > 0 ? confirmedAppointments.length : null,
      badgeVariant: "mint",
    },
    { id: "scheduled", label: "Scheduled Appointments", icon: CalendarCheck },
    { id: "history", label: "Past Consultations / Records", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-blue to-blue-500 flex items-center justify-center text-white shadow-md">
              <HeartPulse className="w-5 h-5" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Care<span className="text-brand-blue">Bridge</span>
            </span>
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-brand-pale-blue text-brand-blue-dark">
              Practitioner
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full">
              <Stethoscope className="w-3.5 h-3.5 text-brand-blue" />
              <span>{doctorApp?.full_name || user?.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-xs border-slate-300"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-3 space-y-4">
            {/* Doctor Profile Capsule */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-brand-emerald" />
                  Verified Doctor
                </span>
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm">{doctorApp?.full_name}</h3>
              <p className="text-xs text-slate-500 truncate">{doctorApp?.specialization}</p>
              <p className="text-[11px] text-slate-400">Reg: {doctorApp?.registration_number}</p>
            </div>

            {/* Nav Tabs */}
            <nav className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-brand-blue text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge !== null && item.badge !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isActive
                              ? "bg-white text-brand-blue"
                              : item.badgeVariant === "rose"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/80" />}
                    </div>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Workspace Area */}
          <main className="lg:col-span-9 space-y-6">
            {/* ========================================================= */}
            {/* Tab: Overview                                             */}
            {/* ========================================================= */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Today&apos;s Appointments</p>
                    <p className="text-2xl font-black text-slate-900">{todayAppointments.length}</p>
                    <p className="text-[11px] text-slate-400">Scheduled for today</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Pending Requests</p>
                    <p className="text-2xl font-black text-rose-600">{pendingRequests.length}</p>
                    <p className="text-[11px] text-slate-400">Awaiting your response</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Confirmed Upcoming</p>
                    <p className="text-2xl font-black text-brand-emerald">{confirmedAppointments.length}</p>
                    <p className="text-[11px] text-slate-400">Booked & confirmed</p>
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Consultation Fee</p>
                    <p className="text-2xl font-black text-brand-blue">₹{doctorApp?.consultation_fee}</p>
                    <p className="text-[11px] text-slate-400">Standard patient charge</p>
                  </div>
                </div>

                {/* Today's Consultations List */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">Today&apos;s Consultations ({todayAppointments.length})</h3>
                      <p className="text-xs text-slate-500">Appointments scheduled for today in Asia/Kolkata</p>
                    </div>
                    <Badge variant="blue">Today</Badge>
                  </div>

                  {todayAppointments.length === 0 ? (
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-400 italic">
                      No appointments scheduled for today.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {todayAppointments.map((appt) => {
                        const startIST = new Date(appt.starts_at).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        });
                        return (
                          <div
                            key={appt.id}
                            className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs"
                          >
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {appt.patient_name || "Patient"}
                              </span>
                              <p className="text-[11px] text-slate-500">Slot: {startIST} IST</p>
                              {appt.reason && (
                                <p className="text-[11px] text-slate-600 italic">Reason: {appt.reason}</p>
                              )}
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                appt.status === "confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {appt.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Availability Schedule (Live backed by Supabase)       */}
            {/* ========================================================= */}
            {activeTab === "schedule" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Weekly Availability Schedule</h2>
                    <p className="text-xs text-slate-500">
                      Configure your weekly shifts (Asia/Kolkata timezone). Patients book consultation slots within these hours.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCopyModal({ isOpen: true, sourceDay: 1, targetDays: [2, 3, 4, 5] })}
                      className="text-xs border-slate-300"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy Shifts
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenAddShift(1)}
                      className="text-xs font-bold"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Shift
                    </Button>
                  </div>
                </div>

                {shiftSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{shiftSuccess}</span>
                  </div>
                )}

                {/* Day-by-Day Shifts List */}
                <div className="space-y-4">
                  {DAYS_OF_WEEK.map((day) => {
                    const dayShifts = schedules.filter((s) => s.day_of_week === day.id);
                    return (
                      <div
                        key={day.id}
                        className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{day.name}</span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              ({dayShifts.length} {dayShifts.length === 1 ? "shift" : "shifts"})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenAddShift(day.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand-blue hover:underline"
                          >
                            <Plus className="w-3 h-3" />
                            Add Shift
                          </button>
                        </div>

                        {dayShifts.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No shifts configured for this day.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {dayShifts.map((shift) => {
                              const slots = calculateSlots(shift.start_time, shift.end_time, shift.slot_duration_mins);
                              return (
                                <div
                                  key={shift.id}
                                  className={`p-3.5 rounded-xl border bg-white flex items-center justify-between gap-3 shadow-sm ${
                                    shift.is_active ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50"
                                  }`}
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-xs text-slate-900">
                                        {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          shift.is_active
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-slate-100 text-slate-500"
                                        }`}
                                      >
                                        {shift.is_active ? "Active" : "Inactive"}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      {shift.slot_duration_mins} min slots • <strong className="text-slate-700">{slots} slots generated</strong>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleShift(shift)}
                                      className={`p-1.5 rounded-lg text-xs font-bold ${
                                        shift.is_active
                                          ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                          : "text-emerald-600 hover:bg-emerald-50"
                                      }`}
                                      title={shift.is_active ? "Deactivate shift" : "Activate shift"}
                                    >
                                      {shift.is_active ? "Pause" : "Resume"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditShift(shift)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-blue hover:bg-blue-50"
                                      title="Edit Shift"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteShift(shift.id)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                      title="Delete Shift"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add / Edit Shift Modal */}
                {shiftForm.isOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-extrabold text-slate-900 text-base">
                          {shiftForm.isEdit ? "Edit Availability Shift" : "Add Availability Shift"}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShiftForm((prev) => ({ ...prev, isOpen: false }))}
                          className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {shiftError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                          <span>{shiftError}</span>
                        </div>
                      )}

                      <form onSubmit={handleSaveShift} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Day of Week</label>
                          <select
                            value={shiftForm.day_of_week}
                            onChange={(e) =>
                              setShiftForm({ ...shiftForm, day_of_week: parseInt(e.target.value, 10) })
                            }
                            className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                          >
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                            <input
                              type="time"
                              required
                              value={shiftForm.start_time}
                              onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">End Time</label>
                            <input
                              type="time"
                              required
                              value={shiftForm.end_time}
                              onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Slot Duration (Minutes)
                          </label>
                          <select
                            value={shiftForm.slot_duration_mins}
                            onChange={(e) =>
                              setShiftForm({
                                ...shiftForm,
                                slot_duration_mins: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                          >
                            <option value={10}>10 Minutes</option>
                            <option value={15}>15 Minutes (Default)</option>
                            <option value={20}>20 Minutes</option>
                            <option value={30}>30 Minutes</option>
                            <option value={45}>45 Minutes</option>
                            <option value={60}>60 Minutes</option>
                          </select>
                        </div>

                        {/* Live Slot Preview */}
                        <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-900">
                          <p className="font-bold">Live Slot Preview:</p>
                          <p className="mt-0.5">
                            {shiftForm.start_time} – {shiftForm.end_time} at {shiftForm.slot_duration_mins} min ={" "}
                            <strong className="text-brand-blue">
                              {calculateSlots(
                                shiftForm.start_time,
                                shiftForm.end_time,
                                shiftForm.slot_duration_mins
                              )}{" "}
                              slots
                            </strong>
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShiftForm((prev) => ({ ...prev, isOpen: false }))}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={shiftActionLoading}
                            className="text-xs font-bold"
                          >
                            {shiftActionLoading ? "Saving..." : shiftForm.isEdit ? "Update Shift" : "Add Shift"}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Copy Shifts Modal */}
                {copyModal.isOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-extrabold text-slate-900 text-base">Copy Shifts to Other Days</h3>
                        <button
                          type="button"
                          onClick={() => setCopyModal((prev) => ({ ...prev, isOpen: false }))}
                          className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {copyMsg && (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                          {copyMsg}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Copy Shifts From:</label>
                          <select
                            value={copyModal.sourceDay}
                            onChange={(e) =>
                              setCopyModal({ ...copyModal, sourceDay: parseInt(e.target.value, 10) })
                            }
                            className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                          >
                            {DAYS_OF_WEEK.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({schedules.filter((s) => s.day_of_week === d.id && s.is_active).length} active shifts)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Paste To Target Days:</label>
                          <div className="grid grid-cols-2 gap-2">
                            {DAYS_OF_WEEK.map((d) => {
                              const isSource = d.id === copyModal.sourceDay;
                              const isChecked = copyModal.targetDays.includes(d.id);
                              return (
                                <label
                                  key={d.id}
                                  className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer ${
                                    isSource
                                      ? "opacity-40 bg-slate-100 border-slate-200 cursor-not-allowed"
                                      : isChecked
                                      ? "bg-blue-50 border-blue-300 text-brand-blue font-bold"
                                      : "bg-white border-slate-200 text-slate-700"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={isSource}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setCopyModal({
                                          ...copyModal,
                                          targetDays: [...copyModal.targetDays, d.id],
                                        });
                                      } else {
                                        setCopyModal({
                                          ...copyModal,
                                          targetDays: copyModal.targetDays.filter((id) => id !== d.id),
                                        });
                                      }
                                    }}
                                    className="rounded text-brand-blue"
                                  />
                                  <span>{d.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCopyModal((prev) => ({ ...prev, isOpen: false }))}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={copyLoading || copyModal.targetDays.length === 0}
                            onClick={handleCopyShifts}
                            className="text-xs font-bold"
                          >
                            {copyLoading ? "Copying..." : "Apply Copies"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Leave Days (Live backed by Supabase)                 */}
            {/* ========================================================= */}
            {activeTab === "leave" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Leave Days & Unavailability</h2>
                    <p className="text-xs text-slate-500">
                      Block single days or date ranges to prevent patient consultations during your absence.
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={handleOpenAddLeave} className="text-xs font-bold">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Schedule Leave
                  </Button>
                </div>

                {leaveSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{leaveSuccess}</span>
                  </div>
                )}

                {/* Upcoming Leaves */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Active & Upcoming Leave Entries
                  </h3>

                  {leaves.filter((l) => l.leave_end >= todayStr).length === 0 ? (
                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                      <CalendarX className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">No Upcoming Leave Scheduled</p>
                      <p className="text-[11px] text-slate-400">
                        You are currently available for all configured weekly shifts.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {leaves
                        .filter((l) => l.leave_end >= todayStr)
                        .map((leave) => (
                          <div
                            key={leave.id}
                            className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Leave Period
                              </span>
                              <h4 className="font-extrabold text-xs text-slate-900">
                                {leave.leave_start === leave.leave_end
                                  ? leave.leave_start
                                  : `${leave.leave_start} to ${leave.leave_end}`}
                              </h4>
                              <p className="text-[11px] text-slate-600">
                                {leave.reason || "Personal Leave / Time Off"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditLeave(leave)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-brand-blue hover:bg-white"
                                title="Edit Leave"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLeave(leave.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-white"
                                title="Delete Leave"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Past Leaves */}
                {leaves.filter((l) => l.leave_end < todayStr).length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Past Leave History</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-60">
                      {leaves
                        .filter((l) => l.leave_end < todayStr)
                        .map((leave) => (
                          <div
                            key={leave.id}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-slate-700">
                                {leave.leave_start} – {leave.leave_end}
                              </p>
                              <p className="text-[10px] text-slate-400">{leave.reason || "Past leave"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteLeave(leave.id)}
                              className="text-slate-400 hover:text-rose-600 p-1"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Add / Edit Leave Modal */}
                {leaveForm.isOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="font-extrabold text-slate-900 text-base">
                          {leaveForm.isEdit ? "Edit Leave Entry" : "Schedule Leave Day(s)"}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setLeaveForm((prev) => ({ ...prev, isOpen: false }))}
                          className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      {leaveError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                          <span>{leaveError}</span>
                        </div>
                      )}

                      <form onSubmit={handleSaveLeave} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                            <input
                              type="date"
                              required
                              value={leaveForm.leave_start}
                              onChange={(e) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  leave_start: e.target.value,
                                  leave_end: leaveForm.leave_end < e.target.value ? e.target.value : leaveForm.leave_end,
                                })
                              }
                              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                            <input
                              type="date"
                              required
                              min={leaveForm.leave_start}
                              value={leaveForm.leave_end}
                              onChange={(e) => setLeaveForm({ ...leaveForm, leave_end: e.target.value })}
                              className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Reason (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Medical conference, Annual vacation"
                            value={leaveForm.reason}
                            onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                            className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLeaveForm((prev) => ({ ...prev, isOpen: false }))}
                            className="text-xs"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            disabled={leaveActionLoading}
                            className="text-xs font-bold"
                          >
                            {leaveActionLoading ? "Saving..." : leaveForm.isEdit ? "Update Leave" : "Confirm Leave"}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Profile & Consultation Fee (Live backed by Supabase) */}
            {/* ========================================================= */}
            {activeTab === "profile" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Doctor Profile & Consultation Fee</h2>
                    <p className="text-xs text-slate-500">
                      Manage safe profile fields and consultation charges. Critical clinical credentials are read-only.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" />
                    Verified NMC Practitioner
                  </span>
                </div>

                {profileSuccess && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{profileSuccess}</span>
                  </div>
                )}

                {profileError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                {/* Read-Only Credentials Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Verified Clinical Credentials (Read-Only)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 italic">
                    Changing these credentials requires administrator re-verification against medical council records.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Practitioner Full Name</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.full_name}</p>
                    </div>
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Medical Registration Number</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.registration_number}</p>
                    </div>
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Issuing Council</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.issuing_council}</p>
                    </div>
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Primary Specialization</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.specialization}</p>
                    </div>
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Qualification & Degree</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.qualification}</p>
                    </div>
                    <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                      <span className="text-slate-500">Graduating Institute</span>
                      <p className="font-bold text-slate-800 text-sm">{doctorApp?.institution}</p>
                    </div>
                  </div>
                </div>

                {/* Editable Safe Fields Form */}
                <form onSubmit={handleSaveProfile} className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Editable Consultation Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Consultation Fee (INR ₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        required
                        value={profileForm.consultation_fee}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, consultation_fee: e.target.value })
                        }
                        className="w-full text-xs font-bold rounded-xl border border-slate-300 p-2.5 focus:border-brand-emerald focus:ring-1 focus:ring-brand-emerald text-emerald-900"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Standard charge presented to patients during telemedicine booking.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Contact Phone Number
                      </label>
                      <input
                        type="tel"
                        required
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Used for administrative communications.</p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Consultation Languages (Comma-separated)
                      </label>
                      <input
                        type="text"
                        value={
                          Array.isArray(profileForm.consultation_languages)
                            ? profileForm.consultation_languages.join(", ")
                            : profileForm.consultation_languages
                        }
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            consultation_languages: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="e.g. English, Hindi, Bengali"
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Doctor Bio & Clinical Focus
                      </label>
                      <textarea
                        rows={3}
                        value={profileForm.bio}
                        onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                        placeholder="Brief overview of your clinical experience and areas of care..."
                        className="w-full text-xs rounded-xl border border-slate-300 p-2.5 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={profileLoading}
                      className="font-bold text-xs"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      {profileLoading ? "Saving Changes..." : "Save Profile & Fee"}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Incoming Consultation Requests (Live)                */}
            {/* ========================================================= */}
            {activeTab === "requests" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Incoming Consultation Requests</h2>
                    <p className="text-xs text-slate-500">
                      Patients requesting teleconsultations. Accept to confirm slot or decline with reason note.
                    </p>
                  </div>
                  <Badge variant="rose">{pendingRequests.length} Pending</Badge>
                </div>

                {apptActionMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <span>{apptActionMsg}</span>
                    <button onClick={() => setApptActionMsg("")} className="font-bold">✕</button>
                  </div>
                )}

                {pendingRequests.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center space-y-2">
                    <Users className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-800">No Pending Consultation Requests</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      All consultation requests have been addressed. New patient bookings will appear here in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((appt) => {
                      const startIST = new Date(appt.starts_at).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const dateIST = new Date(appt.starts_at).toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });

                      let patientAge = null;
                      if (appt.patient_date_of_birth) {
                        const dob = new Date(appt.patient_date_of_birth);
                        if (!Number.isNaN(dob.getTime())) {
                          const today = new Date();
                          patientAge =
                            today.getFullYear() -
                            dob.getFullYear() -
                            (today.getMonth() < dob.getMonth() ||
                            (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
                              ? 1
                              : 0);
                        }
                      }

                      const formattedGender = appt.patient_gender
                        ? String(appt.patient_gender)
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())
                        : null;

                      return (
                        <div
                          key={appt.id}
                          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400">Patient Name</span>
                              <h3 className="text-base font-black text-slate-900">
                                {appt.patient_name || "Patient"}
                              </h3>
                              <p className="text-xs text-slate-500">
                                Age: {patientAge !== null && patientAge >= 0 ? `${patientAge} yrs` : "Not provided"}
                                {" • "}
                                Gender: {formattedGender || "Not provided"}
                              </p>
                              <p className="text-xs font-semibold text-brand-emerald">
                                Fee: ₹{Number(appt.fee_at_booking || doctorApp?.consultation_fee || 0).toFixed(0)}
                              </p>
                            </div>
                            <div className="sm:text-right">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Requested Time (IST)</span>
                              <p className="text-xs font-extrabold text-slate-800">{dateIST}</p>
                              <p className="text-xs text-slate-600">{startIST} IST</p>
                            </div>
                          </div>

                          {appt.reason && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
                              <span className="font-bold text-slate-500 block text-[11px] mb-0.5">
                                Patient Reason Note:
                              </span>
                              <p className="italic">&ldquo;{appt.reason}&rdquo;</p>
                            </div>
                          )}

                          <div className="pt-2 flex items-center justify-end gap-2.5">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={apptActionLoading}
                              onClick={() => handleOpenDecline(appt.id)}
                              className="text-xs text-rose-700 hover:text-rose-900 border-rose-200 hover:bg-rose-50"
                            >
                              Decline Request
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={apptActionLoading}
                              onClick={() => handleAcceptAppointment(appt.id)}
                              className="text-xs font-bold"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                              Accept & Confirm
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Confirmed Requests                                    */}
            {/* ========================================================= */}
            {activeTab === "confirmed" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Confirmed Requests</h2>
                    <p className="text-xs text-slate-500">
                      Accepted telemedicine appointments awaiting consultation slot
                    </p>
                  </div>
                  <Badge variant="mint">{confirmedAppointments.length} Confirmed</Badge>
                </div>

                {confirmedAppointments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-800">No Confirmed Requests</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Confirmed consultation appointments will appear here with scheduled slot times.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {confirmedAppointments.map((appt) => {
                      const startIST = new Date(appt.starts_at).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const dateIST = new Date(appt.starts_at).toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });

                      return (
                        <div
                          key={appt.id}
                          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400">Patient</span>
                              <h3 className="text-base font-black text-slate-900">{appt.patient_name || "Patient"}</h3>
                            </div>
                            <div className="sm:text-right">
                              <span className="text-[10px] uppercase font-bold text-slate-400">Slot Time (IST)</span>
                              <p className="text-xs font-extrabold text-slate-800">{dateIST} • {startIST} IST</p>
                            </div>
                          </div>

                          {appt.reason && (
                            <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              Reason: &ldquo;{appt.reason}&rdquo;
                            </p>
                          )}

                          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-400">
                              Join when the consultation window opens.
                            </span>
                            <div className="flex items-center gap-2">
                              <JoinConsultationButton appointment={appt} />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={apptActionLoading}
                                onClick={() => handleCancelDoctorAppointment(appt.id)}
                                className="text-xs text-rose-700 hover:text-rose-900 border-rose-200 hover:bg-rose-50"
                              >
                                Cancel Appointment
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Scheduled Appointments (Chronological Timeline)       */}
            {/* ========================================================= */}
            {activeTab === "scheduled" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Scheduled Appointments Timeline</h2>
                    <p className="text-xs text-slate-500">
                      Chronological upcoming agenda across all active telemedicine shifts
                    </p>
                  </div>
                  <Badge variant="blue">Timeline</Badge>
                </div>

                {confirmedAppointments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center space-y-2">
                    <CalendarCheck className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-800">No Scheduled Sessions</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Your upcoming confirmed video slots will appear here in chronological order.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {confirmedAppointments
                      .slice()
                      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
                      .map((appt) => {
                        const startIST = new Date(appt.starts_at).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        });
                        const dateIST = new Date(appt.starts_at).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        });

                        return (
                          <div
                            key={appt.id}
                            className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                          >
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {appt.patient_name || "Patient"}
                              </span>
                              <p className="text-xs text-slate-600">
                                {dateIST} at <strong className="text-slate-800">{startIST} IST</strong>
                              </p>
                              {appt.reason && (
                                <p className="text-[11px] text-slate-500 italic line-clamp-1">
                                  Note: {appt.reason}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <JoinConsultationButton appointment={appt} />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={apptActionLoading}
                                onClick={() => handleCancelDoctorAppointment(appt.id)}
                                className="text-xs text-rose-700 hover:text-rose-900 border-rose-200"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================= */}
            {/* Tab: Past Consultations & Clinical History                */}
            {/* ========================================================= */}
            {activeTab === "history" && (
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Past Consultations & History</h2>
                    <p className="text-xs text-slate-500">
                      Completed, declined, and cancelled telemedicine consultation logs
                    </p>
                  </div>
                  <Badge variant="mint">History ({pastAppointments.length})</Badge>
                </div>

                {pastAppointments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center space-y-2">
                    <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                    <h3 className="text-sm font-bold text-slate-800">No Past Consultations on File</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Completed patient visits, declined consultations, and cancellation logs will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastAppointments.map((appt) => {
                      const startIST = new Date(appt.starts_at).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const dateIST = new Date(appt.starts_at).toLocaleDateString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });

                      return (
                        <div
                          key={appt.id}
                          className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <span className="font-extrabold text-slate-900 text-sm block">
                              {appt.patient_name || "Patient"}
                            </span>
                            <p className="text-slate-500">
                              {dateIST} at {startIST} IST
                            </p>
                            {appt.reason && (
                              <p className="text-[11px] text-slate-600 italic">Reason: {appt.reason}</p>
                            )}
                            {appt.decision_note && (
                              <p className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded-md border border-rose-200 inline-block mt-0.5">
                                Decline Note: {appt.decision_note}
                              </p>
                            )}
                          </div>

                          <div>
                            {appt.status === "completed" && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Completed
                              </span>
                            )}
                            {appt.status === "declined" && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                Declined
                              </span>
                            )}
                            {appt.status === "cancelled" && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Cancelled
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Decline Reason Modal */}
      {declineModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">Decline Consultation Request</h3>
              <button
                type="button"
                onClick={() => setDeclineModal({ isOpen: false, id: null, note: "" })}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDecline} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Declining (Required for patient):
                </label>
                <textarea
                  required
                  rows={3}
                  value={declineModal.note}
                  onChange={(e) => setDeclineModal({ ...declineModal, note: e.target.value })}
                  placeholder="e.g. Schedule emergency, requires in-person diagnostic test, out of specialization..."
                  className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeclineModal({ isOpen: false, id: null, note: "" })}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={apptActionLoading}
                  className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {apptActionLoading ? "Declining..." : "Confirm Decline"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Conflict Warning Modal (Step 3 Requirement) */}
      {leaveConflictWarning.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl border border-amber-300 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Existing Appointments Conflict With Leave
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  You have <strong>{leaveConflictWarning.conflicts.length}</strong> active appointment(s) booked during the proposed leave period ({leaveConflictWarning.pendingLeaveData?.leave_start} to {leaveConflictWarning.pendingLeaveData?.leave_end}).
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 bg-amber-50/60 p-3 rounded-2xl border border-amber-200 text-xs">
              <p className="font-bold text-amber-900 mb-1">Conflicting Booked Appointments:</p>
              {leaveConflictWarning.conflicts.map((c) => {
                const startIST = new Date(c.starts_at).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const dateIST = new Date(c.starts_at).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div key={c.id} className="bg-white p-2.5 rounded-xl border border-amber-200/80 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">{dateIST} at {startIST} IST</span>
                      <span className="text-[10px] text-slate-400 block">Status: {c.status}</span>
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      Conflict
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
              <p>
                <strong>Important Policy:</strong> Saving this leave will blackout this period from new patient bookings. Existing booked appointments stay in place until you explicitly cancel or reschedule them with the patients.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLeaveConflictWarning({ isOpen: false, conflicts: [], pendingLeaveData: null })}
                className="text-xs"
              >
                Go Back & Review
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => executeSaveLeave(leaveConflictWarning.pendingLeaveData)}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
              >
                Proceed & Save Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
