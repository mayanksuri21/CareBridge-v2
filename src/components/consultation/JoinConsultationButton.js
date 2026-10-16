"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Video } from "lucide-react";
import { Button } from "../ui/Button";
import { getConsultationState } from "../../lib/consultation";

const HINTS = {
  not_confirmed: "Available once confirmed",
  too_early: "Join opens 15 min before start",
  ended: "Consultation window ended",
  no_time: "No scheduled time",
  unavailable: "",
};

/**
 * Shows "Start Consultation" for doctor immediately upon appointment confirmation.
 * Shows "Join Consultation" for patient once doctor is present in the room (or during window).
 *
 * @param {{
 *   appointment: { id: string, status: string, starts_at: string, ends_at: string },
 *   isDoctor?: boolean,
 *   doctorPresent?: boolean
 * }} props
 */
export function JoinConsultationButton({ appointment, isDoctor = false, doctorPresent: doctorPresentProp }) {
  const [now, setNow] = useState(() => Date.now());
  const [doctorPresent, setDoctorPresent] = useState(false);

  // Re-evaluate eligibility periodically so the button appears/expires without
  // requiring a page refresh.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // For patient: poll doctor room presence so button activates as soon as doctor joins
  useEffect(() => {
    if (isDoctor || appointment?.status !== "confirmed" || !appointment?.id) return undefined;
    if (doctorPresentProp !== undefined) return undefined;

    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(
          `/api/consultation/state?appointmentId=${encodeURIComponent(appointment.id)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data?.doctorPresent !== undefined) {
          setDoctorPresent(Boolean(data.doctorPresent));
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [appointment?.id, appointment?.status, isDoctor, doctorPresentProp]);

  const effectiveDoctorPresent = doctorPresentProp ?? doctorPresent;
  const { canJoin, reason } = getConsultationState(appointment, now, {
    isDoctor,
    doctorPresent: effectiveDoctorPresent,
  });

  if (canJoin) {
    return (
      <Link href={`/consultation/${appointment.id}`}>
        <Button variant="primary" size="sm" className="text-xs font-bold">
          <Video className="w-3.5 h-3.5 mr-1" />
          {isDoctor ? "Start Consultation" : "Join Consultation"}
        </Button>
      </Link>
    );
  }

  if (!isDoctor && appointment?.status === "confirmed") {
    return (
      <span className="text-[11px] text-slate-400">Waiting for doctor to start...</span>
    );
  }

  return (
    <span className="text-[11px] text-slate-400">{HINTS[reason] || ""}</span>
  );
}
