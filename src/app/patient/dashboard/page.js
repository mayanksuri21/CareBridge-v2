"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import {
  getPatientAppointments,
  cancelAppointmentAction,
} from "../../../lib/appointmentActions";
import {
  HeartPulse,
  User,
  Calendar,
  FileText,
  Clock,
  LogOut,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Video,
  XCircle,
  Info,
  RefreshCw,
  UserCircle,
} from "lucide-react";

export default function PatientDashboardShell() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Appointments state
  const [appointments, setAppointments] = useState([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [apptsError, setApptsError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  const [isPending, startTransition] = useTransition();

  const loadAppointments = () => {
    setApptsLoading(true);
    setApptsError("");
    startTransition(async () => {
      const res = await getPatientAppointments();
      if (!res.success) {
        setApptsError(res.error || "Unable to load your appointments.");
      } else {
        setAppointments(res.appointments || []);
      }
      setApptsLoading(false);
    });
  };

  useEffect(() => {
    async function loadPatient() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.push("/patient/login");
          return;
        }

        setUser(session.user);

        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        setProfile(prof || null);
        loadAppointments();
      } catch (err) {
        console.error("Dashboard init error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPatient();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // Cancellation handler
  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm("Are you sure you want to cancel this consultation request?")) {
      return;
    }

    setCancellingId(appointmentId);
    setActionSuccess("");
    setApptsError("");

    const res = await cancelAppointmentAction(appointmentId);
    if (!res.success) {
      setApptsError(res.error || "Failed to cancel appointment.");
    } else {
      setActionSuccess("Appointment cancelled successfully.");
      loadAppointments();
    }
    setCancellingId(null);
  };

  // Split appointments into Upcoming and Past
  const now = new Date();
  const upcomingAppointments = appointments.filter((a) => {
    const isFuture = new Date(a.starts_at) > now;
    const isActiveStatus = ["requested", "confirmed"].includes(a.status);
    return isFuture && isActiveStatus;
  });

  const pastAppointments = appointments.filter((a) => {
    const isFuture = new Date(a.starts_at) > now;
    const isActiveStatus = ["requested", "confirmed"].includes(a.status);
    return !isFuture || !isActiveStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading Patient Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md">
              <HeartPulse className="w-5 h-5" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Care<span className="text-brand-emerald">Bridge</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/find-doctors"
              className="hidden sm:inline-flex text-xs font-bold text-brand-emerald hover:text-emerald-700 transition-colors"
            >
              Find Doctors
            </Link>
            <Link
              href="/patient/profile"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-emerald transition-colors"
            >
              <UserCircle className="w-3.5 h-3.5 text-brand-emerald" />
              Profile
            </Link>
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full">
              <User className="w-3.5 h-3.5 text-brand-emerald" />
              <span>{profile?.full_name || user?.email}</span>
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

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 card-elevation shadow-sm">
          <div className="space-y-1">
            <Badge variant="mint">Patient Telemedicine Workspace</Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Welcome, {profile?.full_name || user?.email?.split("@")[0]}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              {user?.email} • Verified Patient Identity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/find-doctors">
              <Button variant="primary" size="md" className="font-bold shadow-md shadow-brand-emerald/20 text-xs">
                <Calendar className="w-4 h-4 mr-1.5" />
                Find & Book Doctor
              </Button>
            </Link>
          </div>
        </div>

        {/* Feedback Alerts */}
        {actionSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess("")}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {apptsError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{apptsError}</span>
            </div>
            <button
              onClick={loadAppointments}
              className="text-rose-700 hover:text-rose-900 font-bold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* SECTION: My Appointments                                      */}
        {/* ============================================================= */}
        <section id="appointments-history" className="space-y-6 scroll-mt-20">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-xl font-black text-slate-900">My Appointments</h2>
              <p className="text-xs text-slate-500">
                Track status of your consultation requests and confirmed telemedicine appointments
              </p>
            </div>
            <button
              type="button"
              onClick={loadAppointments}
              className="text-xs font-bold text-brand-emerald hover:underline flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${apptsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Upcoming / Active Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand-emerald" />
              Upcoming & Active Appointments ({upcomingAppointments.length})
            </h3>

            {upcomingAppointments.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-sm">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Upcoming Appointments</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You do not have any pending or confirmed consultation slots at this time.
                </p>
                <div className="pt-1">
                  <Link href="/find-doctors">
                    <Button variant="outline" size="sm" className="text-xs font-bold">
                      Book a Specialist
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingAppointments.map((appt) => {
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
                    <Card
                      key={appt.id}
                      className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400">Practitioner</span>
                            <h4 className="font-extrabold text-slate-900 text-base">{appt.doctor?.full_name}</h4>
                            <p className="text-xs font-semibold text-brand-blue">{appt.doctor?.specialization}</p>
                          </div>
                          <div>
                            {appt.status === "confirmed" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Confirmed
                              </span>
                            )}
                            {appt.status === "requested" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                Requested (Pending)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Scheduled Date:</span>
                            <strong className="text-slate-800">{dateIST}</strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Time (IST):</span>
                            <strong className="text-slate-800">{startIST} IST</strong>
                          </div>
                          {appt.fee_at_booking && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                              <span className="text-slate-500">Consultation Fee:</span>
                              <strong className="text-brand-emerald font-extrabold">
                                ₹{Number(appt.fee_at_booking).toFixed(0)}
                              </strong>
                            </div>
                          )}
                        </div>

                        {appt.reason && (
                          <div className="text-xs text-slate-600">
                            <span className="text-slate-400 block text-[11px] font-bold">Your Consultation Note:</span>
                            <p className="italic bg-white p-2 rounded-xl border border-slate-100 mt-0.5">
                              &ldquo;{appt.reason}&rdquo;
                            </p>
                          </div>
                        )}

                        {/* Honest Video Call Notice */}
                        {appt.status === "confirmed" && (
                          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-900">
                            <Video className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                            <p className="text-[11px]">
                              Video link will be available in a later phase. Please ensure you are logged in prior to the scheduled slot.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Cancel Action */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          {appt.status === "requested" ? "Awaiting doctor response" : "Slot reserved"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={cancellingId === appt.id}
                          onClick={() => handleCancelAppointment(appt.id)}
                          className="text-xs text-rose-700 hover:text-rose-900 border-rose-200 hover:bg-rose-50"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          {cancellingId === appt.id ? "Cancelling..." : "Cancel Appointment"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past / Concluded Appointments */}
          <div className="space-y-4 pt-6">
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Past & Concluded Consultations ({pastAppointments.length})
            </h3>

            {pastAppointments.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-xs text-slate-400 italic">
                No past consultations recorded.
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
                      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{appt.doctor?.full_name}</h4>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-medium">{appt.doctor?.specialization}</span>
                        </div>
                        <p className="text-slate-500">
                          {dateIST} at {startIST} IST
                        </p>
                        {appt.reason && (
                          <p className="text-[11px] text-slate-600 italic">Reason: {appt.reason}</p>
                        )}
                        {appt.decision_note && (
                          <p className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded-md border border-rose-200 inline-block mt-1">
                            Doctor&apos;s note: {appt.decision_note}
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
                            Declined by Doctor
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
        </section>

        {/* Quick Overview Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <Card className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-brand-pale-blue text-brand-blue flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Digital Prescriptions</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Digitally signed prescriptions issued directly by your consulting doctors upon consultation completion.
            </p>
            <div className="pt-2 text-xs text-slate-400 italic">No prescriptions on record.</div>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Family Health Records</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Securely store and share lab reports, previous vitals, and immunization logs during teleconsultations.
            </p>
            <div className="pt-2 text-xs text-slate-400 italic">Feature scheduled for subsequent phase.</div>
          </Card>
        </div>
      </main>
    </div>
  );
}
