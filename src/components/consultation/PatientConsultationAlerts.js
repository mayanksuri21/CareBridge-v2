"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Video, X } from "lucide-react";
import { Badge } from "../ui/Card";
import { Button } from "../ui/Button";
import { createClient } from "../../lib/supabase/client";
import { getConsultationReminders, dismissConsultationReminder } from "../../lib/consultationActions";
import {
  getConsultationState,
  formatConsultationSlotIST,
  JOIN_GRACE_BEFORE_MS,
  JOIN_GRACE_AFTER_MS,
} from "../../lib/consultation";

const REMINDER_POLL_MS = 60 * 1000;
const PRESENCE_POLL_MS = 10 * 1000;
const CLOCK_TICK_MS = 30 * 1000;

/**
 * Patient-side consultation alerts.
 *
 * Two separate events:
 *  1. Time-based 15-minute reminder, persisted in public.patient_notifications
 *     (so it survives refreshes and is not duplicated) and pushed over Supabase
 *     Realtime when the patient is on the dashboard.
 *  2. Doctor-arrival alert, derived from LiveKit room presence via
 *     /api/consultation/state — the server is the trusted source, so it also
 *     recovers correctly after a refresh while the doctor is already inside.
 *
 * Neither alert bypasses admission: both only link to the consultation waiting
 * room, where the doctor must still admit the patient.
 */
export default function PatientConsultationAlerts({ appointments = [], userId }) {
  const [reminders, setReminders] = useState([]);
  const [arrivals, setArrivals] = useState({});
  const [now, setNow] = useState(() => Date.now());

  // Re-render periodically so window-based decisions stay correct over time.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Confirmed appointments only — reminders are never shown for cancelled,
  // declined, or otherwise ineligible appointments.
  const confirmedAppointments = useMemo(
    () => appointments.filter((a) => a?.status === "confirmed"),
    [appointments]
  );

  // Appointments inside the consultation join window (used for presence polls).
  const inWindowAppointments = useMemo(
    () => confirmedAppointments.filter((a) => getConsultationState(a, now).canJoin),
    [confirmedAppointments, now]
  );

  const inWindowKey = useMemo(
    () => inWindowAppointments.map((a) => a.id).sort().join(","),
    [inWindowAppointments]
  );

  const loadReminders = useCallback(async () => {
    const result = await getConsultationReminders();
    if (result.success) {
      setReminders(result.notifications);
    }
  }, []);

  // Load (and idempotently create) reminders on mount and keep a slow poll as a
  // fallback for environments where Realtime is unavailable.
  useEffect(() => {
    if (!userId) return undefined;
    loadReminders();
    const timer = setInterval(loadReminders, REMINDER_POLL_MS);
    return () => clearInterval(timer);
  }, [userId, loadReminders]);

  // Realtime push so a new reminder appears without a manual refresh.
  useEffect(() => {
    if (!userId) return undefined;

    const supabase = createClient();
    const channel = supabase
      .channel(`patient-consultation-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "patient_notifications",
          filter: `patient_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload?.new;
          if (!incoming?.id) return;
          setReminders((prev) =>
            prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Doctor-arrival detection. LiveKit room presence is read through the
  // authenticated server endpoint for the confirmed in-window appointments.
  useEffect(() => {
    if (!inWindowKey) {
      setArrivals({});
      return undefined;
    }

    let stopped = false;
    const ids = inWindowKey.split(",").filter(Boolean);

    const check = async () => {
      for (const id of ids) {
        try {
          const res = await fetch(
            `/api/consultation/state?appointmentId=${encodeURIComponent(id)}`,
            { cache: "no-store" }
          );
          if (!res.ok) continue;
          const state = await res.json();
          if (stopped) return;
          setArrivals((prev) => {
            const next = { ...prev };
            if (state?.doctorPresent) {
              next[id] = state.doctorName || "Your doctor";
            } else {
              delete next[id];
            }
            return next;
          });
        } catch {
          // Transient failures are ignored; the next tick retries.
        }
      }
    };

    check();
    const timer = setInterval(check, PRESENCE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [inWindowKey]);

  const appointmentsById = useMemo(() => {
    const map = new Map();
    appointments.forEach((a) => map.set(a.id, a));
    return map;
  }, [appointments]);

  // Only reminders whose appointment is still confirmed and still upcoming.
  const visibleReminders = useMemo(() => {
    return reminders.filter((n) => {
      if (n.read_at) return false;
      const appointment = appointmentsById.get(n.appointment_id);
      if (!appointment || appointment.status !== "confirmed") return false;
      const startsAt = new Date(appointment.starts_at).getTime();
      if (Number.isNaN(startsAt)) return false;
      return now <= startsAt + JOIN_GRACE_AFTER_MS;
    });
  }, [reminders, appointmentsById, now]);

  const handleDismiss = async (notificationId) => {
    setReminders((prev) => prev.filter((n) => n.id !== notificationId));
    await dismissConsultationReminder(notificationId);
  };

  const arrivalEntries = useMemo(() => {
    return Object.entries(arrivals).filter(([id]) => {
      const appointment = appointmentsById.get(id);
      if (!appointment || appointment.status !== "confirmed") return false;
      return getConsultationState(appointment, now).canJoin;
    });
  }, [arrivals, appointmentsById, now]);

  const hasReminders = visibleReminders.length > 0;
  const hasArrivals = arrivalEntries.length > 0;

  if (!hasReminders && !hasArrivals) return null;

  return (
    <div className="space-y-3 mb-6">
      {/* Doctor arrival — highest priority */}
      {arrivalEntries.map(([appointmentId, doctorName]) => {
        const appointment = appointmentsById.get(appointmentId);
        const state = getConsultationState(appointment, now);
        return (
          <div
            key={`arrival-${appointmentId}`}
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 border border-emerald-200">
                <Video className="w-4 h-4 text-brand-emerald" />
              </div>
              <div>
                <p className="text-xs font-black text-emerald-900">
                  {doctorName} is in the consultation room
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Join now to start your consultation
                  {appointment?.starts_at ? ` — ${formatConsultationSlotIST(appointment.starts_at)}` : ""}.
                </p>
              </div>
            </div>
            {state.canJoin && (
              <Link
                href={`/consultation/${appointmentId}`}
                className="inline-flex items-center justify-center rounded-xl bg-brand-emerald px-4 py-2 text-xs font-bold text-white hover:opacity-90"
              >
                Join consultation
              </Link>
            )}
          </div>
        );
      })}

      {/* 15-minute reminder */}
      {visibleReminders.map((notification) => {
        const appointment = appointmentsById.get(notification.appointment_id);
        const state = getConsultationState(appointment, now);
        return (
          <div
            key={`reminder-${notification.id}`}
            role="status"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 border border-blue-200">
                <Bell className="w-4 h-4 text-brand-blue" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black text-slate-900">{notification.title}</p>
                  <Badge variant="slate">
                    <CalendarClock className="w-3 h-3" />
                    {appointment?.starts_at ? formatConsultationSlotIST(appointment.starts_at) : ""}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">{notification.body}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {state.canJoin ? (
                <Link
                  href={`/consultation/${notification.appointment_id}`}
                  className="inline-flex items-center justify-center rounded-xl bg-brand-blue px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                >
                  Join consultation
                </Link>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Join opens {Math.round(JOIN_GRACE_BEFORE_MS / 60000)} minutes before the scheduled time.
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Dismiss reminder"
                className="text-slate-400 hover:text-slate-700"
                onClick={() => handleDismiss(notification.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
