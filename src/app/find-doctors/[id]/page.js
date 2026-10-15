"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "../../../components/layout/Navbar";
import { Footer } from "../../../components/layout/Footer";
import { Card, Badge } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { createClient } from "../../../lib/supabase/client";
import {
  getDoctorAvailableSlots,
  bookAppointmentAction,
} from "../../../lib/appointmentActions";
import { computeAvailableSlots } from "../../../lib/slotEngine";
import {
  ShieldCheck,
  Calendar,
  Clock,
  GraduationCap,
  Briefcase,
  Languages,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Info,
  CalendarCheck,
  UserCheck,
} from "lucide-react";

export default function DoctorBookingPage() {
  const params = useParams();
  const router = useRouter();
  const doctorId = params.id;

  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [doctor, setDoctor] = useState(null);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState("");

  const [isPending, startTransition] = useTransition();

  // Slots data
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  // Selected Date & Slot
  const [selectedDateStr, setSelectedDateStr] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState("");

  // Booking outcome
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // 1. Check user auth
  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push(`/patient/login?redirect=/find-doctors/${doctorId}`);
          return;
        }
        setUser(session.user);
      } catch (err) {
        console.error("Auth check err:", err);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, [doctorId, router, supabase]);

  // 2. Fetch doctor public profile
  useEffect(() => {
    async function fetchDoctor() {
      if (!doctorId) return;
      setDocLoading(true);
      setDocError("");

      try {
        const { data, error } = await supabase.rpc("get_approved_doctor_by_id", {
          target_doctor_id: doctorId,
        });

        if (error) {
          setDocError(error.message);
        } else if (!data || data.length === 0) {
          setDocError("Verified doctor record not found or doctor is not approved.");
        } else {
          setDoctor(data[0]);
        }
      } catch (err) {
        setDocError(err.message);
      } finally {
        setDocLoading(false);
      }
    }

    fetchDoctor();
  }, [doctorId, supabase]);

  // 3. Generate 14-day date strip
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dateStrip = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(nowIST);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    dateStrip.push({
      dateStr,
      dayName: dayNames[d.getDay()],
      dayNum: d.getDate(),
      monthName: monthNames[d.getMonth()],
      isToday: i === 0,
    });
  }

  // 4. Fetch slots for the doctor
  const loadSlots = () => {
    if (!doctorId) return;
    setSlotsLoading(true);
    setSlotsError("");

    const fromDate = dateStrip[0].dateStr;
    const toDate = dateStrip[dateStrip.length - 1].dateStr;

    startTransition(async () => {
      try {
        let computedSlots = [];
        const res = await getDoctorAvailableSlots(doctorId, fromDate, toDate);
        if (res.success && res.slots && res.slots.length > 0) {
          computedSlots = res.slots;
        } else {
          // If server action returned empty due to SSR cookie sync, query directly with client Supabase session
          const [{ data: schedules, error: schedErr }, { data: leaves }] = await Promise.all([
            supabase
              .from("doctor_schedules")
              .select("day_of_week, start_time, end_time, slot_duration_mins, is_active")
              .eq("doctor_id", doctorId)
              .eq("is_active", true),
            supabase
              .from("doctor_leaves")
              .select("leave_start, leave_end")
              .eq("doctor_id", doctorId),
          ]);

          if (schedErr) {
            console.error("Client schedule fetch error:", schedErr.message);
          }

          if (schedules && schedules.length > 0) {
            computedSlots = computeAvailableSlots(schedules, leaves || [], fromDate, toDate);
          }
        }

        setSlots(computedSlots);

        // Default selected date to first day with available slots or today
        if (!selectedDateStr) {
          if (computedSlots.length > 0) {
            const firstSlotDate = new Date(computedSlots[0].slot_start).toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            });
            setSelectedDateStr(firstSlotDate);
          } else {
            setSelectedDateStr(dateStrip[0].dateStr);
          }
        }
      } catch (err) {
        console.error("Slot load error:", err);
        setSlotsError(err.message || "Unable to retrieve availability slots.");
      } finally {
        setSlotsLoading(false);
      }
    });
  };

  useEffect(() => {
    if (doctorId && doctor) {
      loadSlots();
    }
  }, [doctorId, doctor]);

  // Map slots to dates
  const slotsByDate = {};
  slots.forEach((s) => {
    const slotDateStr = new Date(s.slot_start).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (!slotsByDate[slotDateStr]) slotsByDate[slotDateStr] = [];
    slotsByDate[slotDateStr].push(s);
  });

  const currentDaySlots = slotsByDate[selectedDateStr] || [];

  // 5. Booking Handler
  const handleConfirmBooking = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setBookingError("Please pick a consultation time slot.");
      return;
    }

    setBookingLoading(true);
    setBookingError("");

    const res = await bookAppointmentAction({
      doctorId,
      startsAt: selectedSlot.slot_start,
      reason,
    });

    if (!res.success) {
      setBookingError(res.error || "Failed to book slot.");
      setBookingLoading(false);
      // Refresh slots immediately in case it was just taken
      loadSlots();
    } else {
      setBookingLoading(false);
      setBookingSuccess(true);
    }
  };

  if (authLoading || docLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-emerald mx-auto"></div>
            <p className="text-xs text-slate-500 font-semibold">Loading practitioner booking chamber...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (docError) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <main className="flex-1 max-w-3xl mx-auto px-4 py-12 w-full space-y-6">
          <Link
            href="/find-doctors"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Doctors Directory
          </Link>
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
            <h2 className="text-base font-extrabold text-rose-900">Doctor Profile Not Available</h2>
            <p className="text-xs text-rose-700 max-w-md mx-auto">{docError}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* Back Link */}
        <div>
          <Link
            href="/find-doctors"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Doctors Directory
          </Link>
        </div>

        {/* Doctor Summary Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm card-elevation space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-mint to-brand-pale-blue flex items-center justify-center font-black text-2xl text-brand-emerald border border-slate-100 shadow-sm flex-shrink-0">
                {doctor.full_name?.split(" ")[1]?.charAt(0) || doctor.full_name?.charAt(0) || "D"}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900">{doctor.full_name}</h1>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-emerald" />
                    Verified
                  </span>
                </div>
                <p className="text-sm font-bold text-brand-blue">{doctor.specialization}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                  <span>{doctor.qualification} {doctor.institution ? `• ${doctor.institution}` : ""}</span>
                </p>
                {doctor.issuing_council && (
                  <p className="text-[11px] text-slate-400">Registered with {doctor.issuing_council}</p>
                )}
              </div>
            </div>

            <div className="sm:text-right bg-slate-50 sm:bg-transparent p-4 sm:p-0 rounded-2xl border sm:border-0 border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Consultation Fee</p>
              <p className="text-2xl font-black text-slate-900">₹{Number(doctor.consultation_fee || 0).toFixed(0)}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Teleconsultation session</p>
            </div>
          </div>

          {/* Doctor Bio and Spoken Languages */}
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
            <div className="md:col-span-2">
              <span className="font-bold text-slate-700 block mb-1">About Doctor:</span>
              <p className="text-slate-600 leading-relaxed italic">
                {doctor.bio || "Registered medical specialist offering comprehensive online clinical consultations."}
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-slate-700 block mb-1">Languages Spoken:</span>
              <p className="text-slate-800 font-semibold">
                {Array.isArray(doctor.consultation_languages)
                  ? doctor.consultation_languages.join(", ")
                  : "English, Hindi"}
              </p>
              <p className="text-slate-500 text-[11px] pt-1">
                Clinical Experience: <strong className="text-slate-800">{doctor.experience_years} Years</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Success Confirmation Modal / Banner */}
        {bookingSuccess ? (
          <div className="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-12 text-center space-y-5 shadow-lg animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="text-2xl font-black text-slate-900">Request Sent Successfully!</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your consultation request for <strong>{new Date(selectedSlot?.slot_start).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short", year: "numeric" })}</strong> at <strong>{new Date(selectedSlot?.slot_start).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })} IST</strong> has been sent to {doctor.full_name}.
              </p>
              <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                The doctor will review and confirm your slot. You will be able to join the telemedicine chamber once confirmed.
              </p>
            </div>
            <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
              <Link href="/patient/dashboard#appointments-history">
                <Button variant="primary" size="md" className="text-xs font-bold">
                  View in My Appointments
                </Button>
              </Link>
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setBookingSuccess(false);
                  setSelectedSlot(null);
                  setReason("");
                  loadSlots();
                }}
                className="text-xs font-semibold"
              >
                Book Another Slot
              </Button>
            </div>
          </div>
        ) : (
          /* Slot Selection & Booking Chamber */
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm card-elevation space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Select Date & Consultation Slot</h2>
                <p className="text-xs text-slate-500">
                  Times displayed in Indian Standard Time (IST). Only active, unbooked slots are available.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSlots}
                className="text-xs font-bold text-brand-emerald hover:underline flex items-center gap-1 self-start sm:self-auto"
              >
                <Clock className="w-3.5 h-3.5" />
                Refresh Slots
              </button>
            </div>

            {/* Error Message */}
            {slotsError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{slotsError}</span>
              </div>
            )}

            {/* 14-Day Date Strip */}
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2.5">Available Days (Next 14 Days):</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {dateStrip.map((item) => {
                  const daySlotsCount = (slotsByDate[item.dateStr] || []).length;
                  const isSelected = selectedDateStr === item.dateStr;
                  const hasSlots = daySlotsCount > 0;

                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      disabled={!hasSlots}
                      onClick={() => {
                        setSelectedDateStr(item.dateStr);
                        setSelectedSlot(null);
                        setBookingError("");
                      }}
                      className={`flex flex-col items-center justify-center min-w-[70px] py-3 px-2 rounded-2xl border transition-all text-center flex-shrink-0 ${
                        !hasSlots
                          ? "bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed text-slate-400"
                          : isSelected
                          ? "bg-brand-emerald text-white border-brand-emerald shadow-md ring-2 ring-brand-emerald/30 font-bold"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                        {item.dayName}
                      </span>
                      <span className="text-base font-black my-0.5">{item.dayNum}</span>
                      <span className="text-[10px] font-semibold">
                        {hasSlots ? `${daySlotsCount} slots` : "No slots"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slot Times Grid for Selected Day */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">
                  Available Slots for{" "}
                  <span className="text-brand-emerald">
                    {selectedDateStr
                      ? new Date(`${selectedDateStr}T00:00:00+05:30`).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })
                      : "Selected Day"}
                  </span>
                  :
                </p>
                {currentDaySlots.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    {currentDaySlots.length} available slots
                  </span>
                )}
              </div>

              {slotsLoading ? (
                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-emerald"></div>
                  <span>Calculating real-time doctor availability...</span>
                </div>
              ) : currentDaySlots.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center space-y-2">
                  <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No Consultation Slots Available on this Day</p>
                  <p className="text-[11px] text-slate-500">
                    The doctor has no active shifts scheduled or has booked all appointments for this date. Please choose another active day above.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {currentDaySlots.map((slot, idx) => {
                    const startIST = new Date(slot.slot_start).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const isPicked = selectedSlot?.slot_start === slot.slot_start;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot);
                          setBookingError("");
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all text-center flex flex-col items-center justify-center ${
                          isPicked
                            ? "bg-brand-emerald text-white border-brand-emerald shadow-sm ring-2 ring-brand-emerald/30"
                            : "bg-white text-slate-800 border-slate-200 hover:border-brand-emerald hover:bg-emerald-50/50"
                        }`}
                      >
                        <span>{startIST}</span>
                        <span className={`text-[10px] font-normal ${isPicked ? "text-emerald-100" : "text-slate-400"}`}>
                          IST
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Booking Form with Optional Reason */}
            {selectedSlot && (
              <form onSubmit={handleConfirmBooking} className="pt-6 border-t border-slate-100 space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-slate-800">Booking Summary:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Doctor:</span>
                      <strong className="text-slate-800">{doctor.full_name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Date & Time (IST):</span>
                      <strong className="text-slate-800">
                        {new Date(selectedSlot.slot_start).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        at{" "}
                        {new Date(selectedSlot.slot_start).toLocaleTimeString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Consultation Fee:</span>
                      <strong className="text-brand-emerald font-black text-sm">
                        ₹{Number(doctor.consultation_fee || 0).toFixed(0)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Scope Note on Payment */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p>
                    <strong className="font-semibold">Payment Information:</strong> Consultation fee is displayed for your information. Online payment processing is scheduled for a subsequent phase; no charges are deducted today.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reason for Consultation (Optional - max 500 characters):
                  </label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly describe your symptoms, health concerns, or questions for the doctor..."
                    className="w-full text-xs rounded-xl border border-slate-300 p-3 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-brand-emerald"
                  />
                  <span className="text-[10px] text-slate-400 block text-right">
                    {reason.length}/500
                  </span>
                </div>

                {bookingError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{bookingError}</span>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={bookingLoading}
                    className="text-xs font-bold px-6"
                  >
                    <CalendarCheck className="w-4 h-4 mr-2" />
                    {bookingLoading ? "Confirming Slot..." : "Confirm Booking Request"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
