"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import "@livekit/components-styles";
import { Badge, Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import {
  AlertTriangle,
  Clock,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Video,
  VideoOff,
} from "lucide-react";

// Human-readable messages for the secure token API's error codes.
const ERROR_MESSAGES = {
  unauthenticated: "Please sign in to join this consultation.",
  not_a_participant: "You are not a participant of this consultation.",
  doctor_not_verified: "Only verified doctors can join this consultation.",
  appointment_not_found: "This appointment was not found or you do not have access to it.",
  appointment_not_confirmed: "This consultation has not been confirmed yet.",
  consultation_not_started: "This consultation has not started yet. Please return when your slot begins.",
  consultation_ended: "This consultation window has ended.",
  appointment_time_missing: "This appointment has no valid scheduled time.",
  livekit_not_configured: "The video service is not configured. Please contact support.",
  admission_lookup_failed: "Could not verify your consultation access. Please try again.",
  network_error: "Could not reach the consultation service. Check your connection and try again.",
};

const CONNECTION_LABELS = {
  [ConnectionState.Connecting]: "Connecting…",
  [ConnectionState.Connected]: "Connected",
  [ConnectionState.Reconnecting]: "Reconnecting…",
  [ConnectionState.Disconnected]: "Disconnected",
};

const PRESENCE_POLL_MS = 5000;

export default function ConsultationPage() {
  const params = useParams();
  const router = useRouter();
  const appointmentId = Array.isArray(params?.appointmentId)
    ? params.appointmentId[0]
    : params?.appointmentId;

  const [phase, setPhase] = useState("loading"); // loading | waiting | room | error | ended
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { status, role, token, url, room, doctorName }
  const [doctorName, setDoctorName] = useState(null);
  const [doctorPresent, setDoctorPresent] = useState(false);
  const intentionalLeaveRef = useRef(false);
  const upgradingRef = useRef(false);

  // Request a token from the secure server API using ONLY the appointment id.
  // The API authorizes the caller and decides whether the patient gets the
  // waiting-room token or the active-room token; the client never decides.
  const requestToken = useCallback(async () => {
    try {
      const res = await fetch("/api/consultation/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload?.token || !payload?.url) {
        setError({
          code: payload?.error || "request_failed",
          message: payload?.message || "Unable to start the consultation.",
        });
        setPhase("error");
        return null;
      }

      setSession(payload);
      if (payload.doctorName) setDoctorName(payload.doctorName);
      setPhase(payload.status === "waiting" ? "waiting" : "room");
      return payload;
    } catch {
      setError({ code: "network_error", message: ERROR_MESSAGES.network_error });
      setPhase("error");
      return null;
    }
  }, [appointmentId]);

  useEffect(() => {
    if (!appointmentId) {
      setError({ code: "invalid_appointment", message: "No appointment was specified." });
      setPhase("error");
      return;
    }
    requestToken();
  }, [appointmentId, requestToken]);

  // While waiting, poll the server for admission / doctor arrival. Admission is
  // granted only by the doctor and enforced server-side, so this poll can only
  // ever observe state — it can never let the patient in by itself.
  useEffect(() => {
    if (phase !== "waiting" || !appointmentId) return undefined;

    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(
          `/api/consultation/state?appointmentId=${encodeURIComponent(appointmentId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const state = await res.json();
        if (stopped) return;

        if (state?.doctorName) setDoctorName(state.doctorName);
        setDoctorPresent(Boolean(state?.doctorPresent));

        if (state?.admitted && !upgradingRef.current) {
          upgradingRef.current = true;
          const upgraded = await requestToken();
          // If the server still reports "waiting" (e.g. a race), allow retrying.
          if (!upgraded || upgraded.status === "waiting") {
            upgradingRef.current = false;
          }
          if (upgraded?.status === "admitted" && upgraded?.role === "patient") {
            intentionalLeaveRef.current = false;
          }
        }
      } catch {
        // Transient network errors are ignored; the next tick retries.
      }
    };

    check();
    const timer = setInterval(check, PRESENCE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [phase, appointmentId, requestToken]);

  // Explicit Leave / End Call. This only disconnects the local room — it never
  // cancels, approves, or otherwise mutates the appointment.
  const handleLeave = useCallback(() => {
    intentionalLeaveRef.current = true;
    router.back();
  }, [router]);

  let content = null;

  if (phase === "loading") {
    content = (
      <Card className="max-w-md mx-auto mt-10 p-8 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-brand-blue mx-auto animate-spin" />
        <h1 className="text-base font-black text-slate-900">Preparing your consultation</h1>
        <p className="text-xs text-slate-500">Verifying your appointment and securing a private room…</p>
      </Card>
    );
  } else if (phase === "error") {
    content = (
      <Card className="max-w-md mx-auto mt-10 p-8 space-y-4 text-center">
        <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto" />
        <h1 className="text-base font-black text-slate-900">Unable to join consultation</h1>
        <p className="text-xs text-slate-600">
          {ERROR_MESSAGES[error?.code] || error?.message || "Something went wrong."}
        </p>
        <Button variant="outline" size="sm" className="text-xs font-bold" onClick={() => router.back()}>
          Go Back
        </Button>
      </Card>
    );
  } else if (phase === "ended") {
    content = (
      <Card className="max-w-md mx-auto mt-10 p-8 space-y-4 text-center">
        <PhoneOff className="w-9 h-9 text-slate-400 mx-auto" />
        <h1 className="text-base font-black text-slate-900">Consultation ended</h1>
        <p className="text-xs text-slate-600">
          You have left the call. Your appointment status has not been changed.
        </p>
        <Button variant="primary" size="sm" className="text-xs font-bold" onClick={() => router.back()}>
          Back to Dashboard
        </Button>
      </Card>
    );
  } else if (phase === "waiting") {
    // Connecting to the waiting room is what tells the doctor that this patient
    // is present. This token cannot publish or subscribe, and it is scoped to
    // the waiting room only — the active consultation room is not reachable.
    content = (
      <>
        <LiveKitRoom
          token={session?.token}
          serverUrl={session?.url}
          connect
          audio={false}
          video={false}
          className="hidden"
          onError={() => {
            setError({ code: "connection_failed", message: "The waiting room connection failed. Please try again." });
            setPhase("error");
          }}
        />
        <WaitingRoom doctorName={doctorName} doctorPresent={doctorPresent} onLeave={handleLeave} />
      </>
    );
  } else {
    content = (
      <LiveKitRoom
        token={session?.token}
        serverUrl={session?.url}
        connect
        audio
        video
        className="space-y-4"
        onError={() => {
          setError({ code: "connection_failed", message: "The video connection failed. Please try again." });
          setPhase("error");
        }}
        onMediaDeviceFailure={(_failure, kind) => {
          setError({
            code: "device_error",
            message:
              kind === "audio"
                ? "Microphone access was blocked. Enable microphone permission and refresh."
                : "Camera access was blocked. Enable camera permission and refresh.",
          });
          setPhase("error");
        }}
        onDisconnected={() => {
          if (!intentionalLeaveRef.current) {
            setPhase("ended");
          }
        }}
      >
        <RoomAudioRenderer />
        <ConsultationStage role={session?.role} appointmentId={appointmentId} onLeave={handleLeave} />
      </LiveKitRoom>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-emerald" />
            <div>
              <p className="text-sm font-black text-slate-900 leading-tight">CareBridge Consultation</p>
              <p className="text-[11px] text-slate-500 leading-tight">Secure end-to-end video room</p>
            </div>
          </div>
          {session?.role && (
            <Badge variant="slate">{session.role === "doctor" ? "Doctor" : "Patient"}</Badge>
          )}
          <Link href="/" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            Exit
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{content}</main>
    </div>
  );
}

/**
 * Patient waiting screen. The patient is present in the waiting room but has no
 * access to the active consultation until the doctor admits them server-side.
 */
function WaitingRoom({ doctorName, doctorPresent, onLeave }) {
  const doctorLabel = doctorName || "your doctor";

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-4">
      <Card className="p-8 text-center space-y-4">
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-brand-blue/10 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Users className="w-8 h-8 text-brand-blue" />
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-base font-black text-slate-900">
            Waiting for {doctorLabel} to let you in
          </h1>
          <p className="text-xs text-slate-500">
            You are in the waiting room. Your camera and microphone stay off until the doctor admits you.
          </p>
        </div>

        <div className="flex items-center justify-center">
          <Badge variant={doctorPresent ? "mint" : "slate"}>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                doctorPresent ? "bg-brand-emerald" : "bg-amber-500"
              }`}
            />
            {doctorPresent ? `${doctorLabel} is in the consultation room` : "Connecting to the doctor…"}
          </Badge>
        </div>

        <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          This page updates automatically — no need to refresh.
        </p>

        <Button variant="outline" size="sm" className="text-xs font-bold" onClick={onLeave}>
          <PhoneOff className="w-4 h-4 mr-1.5" />
          Leave Waiting Room
        </Button>
      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Waiting here does not change your appointment. The doctor must admit you before the consultation starts.
      </p>
    </div>
  );
}

/**
 * Doctor-side admission control. Presence of the waiting patient is read from
 * the server (LiveKit room state), and admission is enforced server-side.
 */
function AdmitPanel({ appointmentId }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/consultation/state?appointmentId=${encodeURIComponent(appointmentId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch {
      // Ignore transient failures; the next tick retries.
    }
  }, [appointmentId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, PRESENCE_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const admit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/consultation/admit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: payload?.message || "Could not admit the patient." });
        return;
      }
      setMessage({ tone: "success", text: "Patient admitted. They can now join the consultation." });
      await refresh();
    } catch {
      setMessage({ tone: "error", text: ERROR_MESSAGES.network_error });
    } finally {
      setBusy(false);
    }
  };

  const patientWaiting = Boolean(state?.patientWaiting);
  const patientAdmitted = Boolean(state?.patientAdmitted);
  const patientName = state?.patientName || "Your patient";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-brand-blue" />
          <span className="text-xs font-black text-slate-800">Waiting room</span>
        </div>
        <Badge variant={patientWaiting ? "mint" : "slate"}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              patientWaiting ? "bg-brand-emerald" : "bg-slate-300"
            }`}
          />
          {patientWaiting ? `${patientName} is waiting` : "No one is waiting"}
        </Badge>
      </div>

      {!patientWaiting && !patientAdmitted && (
        <p className="text-[11px] text-slate-500">
          The patient has not opened the waiting room yet. They will appear here automatically.
        </p>
      )}

      {patientWaiting && !patientAdmitted && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">{patientName}</span> is waiting to join.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="text-xs font-bold"
            onClick={admit}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Admit patient
          </Button>
        </div>
      )}

      {patientAdmitted && (
        <p className="text-[11px] text-emerald-700 font-semibold">
          {patientName} has been admitted to this consultation.
        </p>
      )}

      {message && (
        <p
          className={`text-[11px] font-semibold ${
            message.tone === "error" ? "text-rose-600" : "text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * The in-room stage: participant video, mic/camera toggles, connection state,
 * the participant list, and the explicit Leave control.
 * Must be rendered inside <LiveKitRoom>.
 */
function ConsultationStage({ role, appointmentId, onLeave }) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [controlError, setControlError] = useState(null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const connectionLabel = useMemo(
    () => CONNECTION_LABELS[connectionState] || connectionState,
    [connectionState]
  );

  const toggleMic = async () => {
    setControlError(null);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setControlError("Microphone is unavailable. Check your browser permissions.");
    }
  };

  const toggleCamera = async () => {
    setControlError(null);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      setControlError("Camera is unavailable. Check your browser permissions.");
    }
  };

  const handleLeaveClick = async () => {
    try {
      await room.disconnect();
    } catch {
      // Ignore disconnect errors; LiveKitRoom also cleans up on unmount.
    }
    onLeave();
  };

  const isConnected = connectionState === ConnectionState.Connected;
  const gridCols = tracks.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";

  return (
    <div className="space-y-4">
      {/* Connection state */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={isConnected ? "mint" : "slate"}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isConnected ? "bg-brand-emerald" : "bg-amber-500"
            }`}
          />
          {connectionLabel}
        </Badge>
        <span className="text-[11px] text-slate-400">{tracks.length} participant(s) in room</span>
      </div>

      {controlError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{controlError}</span>
        </div>
      )}

      {/* Doctor-controlled waiting room */}
      {role === "doctor" && <AdmitPanel appointmentId={appointmentId} />}

      {/* Participant video — display names come from the server-issued token */}
      <div className={`grid ${gridCols} gap-3`}>
        {tracks.map((track) => {
          const key = `${track.participant.identity}-${track.source}`;
          const isLocal = track.participant.isLocal;
          const hasVideo = Boolean(track.publication);
          const displayName =
            track.participant.name || (isLocal ? "You" : "Participant");
          return (
            <div
              key={key}
              className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800"
            >
              {hasVideo ? (
                <VideoTrack trackRef={track} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                  <VideoOff className="w-7 h-7" />
                  <span className="text-[11px] font-semibold">{displayName}</span>
                </div>
              )}
              <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
                {displayName}
                {isLocal ? " (You)" : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Participant list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-blue" />
          <span className="text-xs font-black text-slate-800">In this consultation</span>
        </div>
        <ul className="space-y-1.5">
          {participants.map((participant) => (
            <li
              key={participant.identity}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="font-semibold text-slate-700">
                {participant.name || "Participant"}
                {participant.isLocal ? " (You)" : ""}
              </span>
              <span className="text-slate-400">
                {participant.isLocal ? "You" : "Connected"}
              </span>
            </li>
          ))}
          {participants.length <= 1 && (
            <li className="text-[11px] text-slate-400">
              <Clock className="w-3 h-3 inline mr-1" />
              Waiting for the other participant to join…
            </li>
          )}
        </ul>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <Button
          variant={isMicrophoneEnabled ? "mint" : "outline"}
          size="md"
          onClick={toggleMic}
          aria-pressed={isMicrophoneEnabled}
          className="text-xs font-bold"
        >
          {isMicrophoneEnabled ? <Mic className="w-4 h-4 mr-1.5" /> : <MicOff className="w-4 h-4 mr-1.5" />}
          {isMicrophoneEnabled ? "Mute" : "Unmute"}
        </Button>

        <Button
          variant={isCameraEnabled ? "mint" : "outline"}
          size="md"
          onClick={toggleCamera}
          aria-pressed={isCameraEnabled}
          className="text-xs font-bold"
        >
          {isCameraEnabled ? <Video className="w-4 h-4 mr-1.5" /> : <VideoOff className="w-4 h-4 mr-1.5" />}
          {isCameraEnabled ? "Stop Camera" : "Start Camera"}
        </Button>

        <Button
          variant="primary"
          size="md"
          onClick={handleLeaveClick}
          className="text-xs font-bold bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
        >
          <PhoneOff className="w-4 h-4 mr-1.5" />
          Leave Call
        </Button>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Leaving the call does not cancel or change your appointment.
      </p>
    </div>
  );
}
