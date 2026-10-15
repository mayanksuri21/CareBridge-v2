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
 * Shows a "Join Consultation" action only while the appointment is eligible
 * (confirmed + inside the consultation window). The secure token API performs
 * the real authorization server-side; this is only the affordance.
 *
 * @param {{ appointment: { id: string, status: string, starts_at: string, ends_at: string } }} props
 */
export function JoinConsultationButton({ appointment }) {
  const [now, setNow] = useState(() => Date.now());

  // Re-evaluate eligibility periodically so the button appears/expires without
  // requiring a page refresh.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const { canJoin, reason } = getConsultationState(appointment, now);

  if (canJoin) {
    return (
      <Link href={`/consultation/${appointment.id}`}>
        <Button variant="primary" size="sm" className="text-xs font-bold">
          <Video className="w-3.5 h-3.5 mr-1" />
          Join Consultation
        </Button>
      </Link>
    );
  }

  return (
    <span className="text-[11px] text-slate-400">{HINTS[reason] || ""}</span>
  );
}
