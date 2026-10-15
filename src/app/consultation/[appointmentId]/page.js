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
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import "@livekit/components-styles";
import { Badge, Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import {
  AlertTriangle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
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
  network_error: "Could not reach the consultation service. Check your connection and try again.",
};

const CONNECTION_LABELS = {
  [ConnectionState.Connecting]: "Connecting…",
  [ConnectionState.Connected]: "Connected",
  [ConnectionState.Reconnecting]: "Reconnecting…",
  [ConnectionState.Disconnected]: "Disconnected",
};

export default function ConsultationPage() {
  const params = useParams();
  const router = useRouter();
  const appointmentId = Array.isArray(params?.appointmentId)
    ? params.appointmentId[0]
    : params?.appointmentId;

  const [status, setStatus] = useState("loading"); // loading | ready | error | ended
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState({ token: null, url: null, room: null });
  const intentionalLeaveRef = useRef(false);

  // Request a token from the secure server API using ONLY the appointment id.
  // The API authorizes the caller; the client never decides who may join.
  useEffect(() => {
    if (!appointmentId) {
      setError({ code: "invalid_appointment", message: "No appointment was specified." });
      setStatus("error");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/consultation/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId }),
        });
        const payload = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok || !payload?.token || !payload?.url) {
          setError({
            code: payload?.error || "request_failed",
            message: payload?.message || "Unable to start the consultation.",
          });
          setStatus("error");
          return;
        }

        setConnection({ token: payload.token, url: payload.url, room: payload.room });
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setError({
            code: "network_error",
            message: ERROR_MESSAGES.network_error,
          });
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  // Explicit Leave / End Call. This only disconnects the local room — it never
  // cancels, approves, or otherwise mutates the appointment.
  const handleLeave = useCallback(() => {
    intentionalLeaveRef.current = true;
    router.back();
  }, [router]);

  let content = null;

  if (status === "loading") {
    content = (
      <Card className="max-w-md mx-auto mt-10 p-8 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-brand-blue mx-auto animate-spin" />
        <h1 className="text-base font-black text-slate-900">Preparing your consultation</h1>
        <p className="text-xs text-slate-500">Verifying your appointment and securing a private room…</p>
      </Card>
    );
  } else if (status === "error") {
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
  } else if (status === "ended") {
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
  } else {
    content = (
      <LiveKitRoom
        token={connection.token}
        serverUrl={connection.url}
        connect
        audio
        video
        className="space-y-4"
        onError={() => {
          setError({ code: "connection_failed", message: "The video connection failed. Please try again." });
          setStatus("error");
        }}
        onMediaDeviceFailure={(_failure, kind) => {
          setError({
            code: "device_error",
            message:
              kind === "audio"
                ? "Microphone access was blocked. Enable microphone permission and refresh."
                : "Camera access was blocked. Enable camera permission and refresh.",
          });
          setStatus("error");
        }}
        onDisconnected={() => {
          if (!intentionalLeaveRef.current) {
            setStatus("ended");
          }
        }}
      >
        <RoomAudioRenderer />
        <ConsultationStage onLeave={handleLeave} />
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
 * The in-room stage: participant video, mic/camera toggles, connection state,
 * and the explicit Leave control. Must be rendered inside <LiveKitRoom>.
 */
function ConsultationStage({ onLeave }) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
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

      {/* Participant video */}
      <div className={`grid ${gridCols} gap-3`}>
        {tracks.map((track) => {
          const key = `${track.participant.identity}-${track.source}`;
          const isLocal = track.participant.isLocal;
          const hasVideo = Boolean(track.publication);
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
                  <span className="text-[11px] font-semibold">Camera off</span>
                </div>
              )}
              <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
                {isLocal ? "You" : "Other participant"}
              </span>
            </div>
          );
        })}
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
