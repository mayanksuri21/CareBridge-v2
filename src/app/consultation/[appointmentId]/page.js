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
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  Video,
  VideoOff,
  Pill,
  Users,
} from "lucide-react";

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

export default function ConsultationPage() {
  const params = useParams();
  const router = useRouter();

  const rawId = params?.appointmentId || params?.id;
  const appointmentId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [patientDetails, setPatientDetails] = useState(null);
  const intentionalLeaveRef = useRef(false);

  const requestToken = useCallback(async () => {
    if (!appointmentId) return null;
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
      setPhase("room");
      return payload;
    } catch {
      setError({ code: "network_error", message: ERROR_MESSAGES.network_error });
      setPhase("error");
      return null;
    }
  }, [appointmentId]);

  const fetchPatientDetails = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const res = await fetch(
        `/api/consultation/patient-details?appointmentId=${encodeURIComponent(appointmentId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      // Yahan data.patient || data kar do taaki exact match ho jaye
      setPatientDetails(data?.patient || data);
    } catch (err) {
      console.error("[Patient Details] Fetch error:", err);
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

  useEffect(() => {
    if (appointmentId) {
      fetchPatientDetails();
    }
  }, [appointmentId, fetchPatientDetails]);

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
        <p className="text-xs text-slate-600">You have left the call.</p>
        <Button variant="primary" size="sm" className="text-xs font-bold" onClick={() => router.back()}>
          Back to Dashboard
        </Button>
      </Card>
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

      {/* Patient Details Bar */}
      {phase === "room" && (
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-semibold text-slate-400 uppercase tracking-wide">Patient Details</span>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-semibold text-slate-700">
                    {patientDetails?.full_name || patientDetails?.name || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Age:</span>
                  <span className="font-semibold text-slate-700">
                    {patientDetails?.age ? `${patientDetails.age} yrs` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Gender:</span>
                  <span className="font-semibold text-slate-700 capitalize">
                    {patientDetails?.gender || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-700">
                    {patientDetails?.phone || "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{content}</main>
    </div>
  );
}

function DraggablePiP({ children, className }) {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - startPosRef.current.x,
        y: e.clientY - startPosRef.current.y,
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={dragRef}
      className={className}
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: 10,
      }}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
}

function ConsultationStage({ role, appointmentId, onLeave, patientDetails }) {
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
      setControlError("Microphone is unavailable. Check permissions.");
    }
  };

  const toggleCamera = async () => {
    setControlError(null);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      setControlError("Camera is unavailable. Check permissions.");
    }
  };

  const handleLeaveClick = async () => {
    try {
      await room.disconnect();
    } catch { }
    onLeave();
  };

  const isConnected = connectionState === ConnectionState.Connected;
  const localTrack = tracks.find((track) => track.participant.isLocal);
  const remoteTracks = tracks.filter((track) => !track.participant.isLocal);

  const mainTrack = remoteTracks.length > 0 ? remoteTracks[0] : localTrack;
  const hasMainVideo = Boolean(mainTrack?.publication);
  const mainDisplayName =
    mainTrack?.participant.name || (mainTrack?.participant.isLocal ? "You" : "Participant");
  const isMainLocal = mainTrack?.participant.isLocal || false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant={isConnected ? "mint" : "slate"}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${isConnected ? "bg-brand-emerald" : "bg-amber-500"
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

      <div className="flex gap-4">
        <div className="flex-1 space-y-4">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
            {hasMainVideo ? (
              <VideoTrack trackRef={mainTrack} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                <VideoOff className="w-12 h-12" />
                <span className="text-sm font-semibold">{mainDisplayName}</span>
              </div>
            )}
            <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white">
              {mainDisplayName}
              {isMainLocal ? " (You)" : ""}
            </span>

            {localTrack && !isMainLocal && (
              <DraggablePiP className="w-[180px] h-[120px] rounded-xl overflow-hidden bg-slate-900 border-2 border-white shadow-lg">
                {localTrack.publication ? (
                  <VideoTrack trackRef={localTrack} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                    <VideoOff className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">You</span>
                  </div>
                )}
                <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold text-white">
                  You
                </span>
              </DraggablePiP>
            )}
          </div>

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
        </div>

        <div className="w-[360px] flex-shrink-0 space-y-4">
          <ConsultationPanel role={role} appointmentId={appointmentId} />
        </div>
      </div>

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
              Waiting for the other participant to join…
            </li>
          )}
        </ul>
      </div>

      <p className="text-center text-[11px] text-slate-400">
        Leaving the call does not cancel or change your appointment.
      </p>
    </div>
  );
}

function ConsultationPanel({ role, appointmentId }) {
  const isDoctor = role === "doctor";
  const [medicines, setMedicines] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    strength: "",
    dose: "",
    frequency: "",
    duration: "",
    instructions: "",
  });
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [prescriptionStatus, setPrescriptionStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addMedicine = () => {
    if (!formData.name.trim()) return;

    if (editingId) {
      setMedicines(
        medicines.map((med) => (med.id === editingId ? { ...formData, id: editingId } : med))
      );
      setEditingId(null);
    } else {
      setMedicines([...medicines, { ...formData, id: Date.now() }]);
    }

    setFormData({
      name: "",
      strength: "",
      dose: "",
      frequency: "",
      duration: "",
      instructions: "",
    });
  };

  const editMedicine = (medicine) => {
    setFormData({
      name: medicine.name,
      strength: medicine.strength,
      dose: medicine.dose,
      frequency: medicine.frequency,
      duration: medicine.duration,
      instructions: medicine.instructions,
    });
    setEditingId(medicine.id);
  };

  const removeMedicine = (id) => {
    setMedicines(medicines.filter((med) => med.id !== id));
    if (editingId === id) {
      cancelEdit();
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: "",
      strength: "",
      dose: "",
      frequency: "",
      duration: "",
      instructions: "",
    });
  };

  // Poll/Load prescription for both Doctor and Patient so updates sync in real-time
  const loadPrescription = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const res = await fetch(
        `/api/consultation/prescription?appointmentId=${encodeURIComponent(appointmentId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();

      if (data.prescription) {
        setPrescriptionStatus(data.prescription.status);
        if (!isDoctor) {
          // Sync doctor's notes and medicines to patient side
          setClinicalNotes(data.prescription.clinicalNotes || "");
          setMedicines(data.prescription.medicines || []);
        } else if (!medicines.length) {
          // Initial load for doctor
          setClinicalNotes(data.prescription.clinicalNotes || "");
          setMedicines(data.prescription.medicines || []);
        }
      }
    } catch { }
  }, [appointmentId, isDoctor, medicines.length]);

  useEffect(() => {
    loadPrescription();
    // Patient live poll: updates every 4 seconds when doctor hits Save Draft
    if (!isDoctor) {
      const timer = setInterval(loadPrescription, 4000);
      return () => clearInterval(timer);
    }
  }, [loadPrescription, isDoctor]);

  const savePrescription = async (status) => {
    if (!appointmentId) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/consultation/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          status,
          clinicalNotes,
          medicines: medicines.map((med) => ({
            name: med.name,
            strength: med.strength,
            dose: med.dose,
            frequency: med.frequency,
            duration: med.duration,
            instructions: med.instructions,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveMessage({ tone: "error", text: data?.message || "Failed to save prescription." });
        return;
      }

      setPrescriptionStatus(status);
      setSaveMessage({ tone: "success", text: status === "finalized" ? "Prescription Finalized & Sent!" : "Draft Saved & Visible to Patient!" });
      setTimeout(() => setSaveMessage(null), 3500);
    } catch {
      setSaveMessage({ tone: "error", text: "Failed to save prescription." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Previous Records */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Previous Records</h3>
        <p className="text-xs text-slate-400 italic">No previous records yet</p>
      </div>

      {/* Clinical Notes */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Clinical Notes</h3>
        {isDoctor ? (
          <textarea
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            placeholder="Write clinical notes, advice or tests to order…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 resize-none"
            rows={4}
            disabled={prescriptionStatus === "finalized"}
          />
        ) : (
          <p className="text-xs text-slate-600 whitespace-pre-wrap">
            {clinicalNotes || <span className="text-slate-400 italic">Clinical notes from the doctor will appear here.</span>}
          </p>
        )}
      </div>

      {/* Prescription */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Prescription</h3>
          {prescriptionStatus && (
            <Badge variant={prescriptionStatus === "finalized" ? "mint" : "slate"}>
              {prescriptionStatus === "finalized" ? "Finalized" : "Draft"}
            </Badge>
          )}
        </div>

        {saveMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-2 text-[10px] font-semibold ${saveMessage.tone === "error"
              ? "bg-rose-50 border border-rose-200 text-rose-700"
              : "bg-emerald-50 border border-emerald-200 text-emerald-700"
              }`}
          >
            {saveMessage.text}
          </div>
        )}

        {isDoctor && (
          <>
            <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 ${prescriptionStatus === "finalized" ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-slate-500">
                  {editingId ? "Edit Medicine" : "Add New Medicine"}
                </span>
                {editingId && (
                  <button
                    onClick={cancelEdit}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Medicine Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="e.g. Paracetamol"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Strength / Form
                  </label>
                  <input
                    type="text"
                    value={formData.strength}
                    onChange={(e) => handleInputChange("strength", e.target.value)}
                    placeholder="e.g. 500mg Tablet"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Dose
                  </label>
                  <input
                    type="text"
                    value={formData.dose}
                    onChange={(e) => handleInputChange("dose", e.target.value)}
                    placeholder="e.g. 1 tablet"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Frequency
                  </label>
                  <input
                    type="text"
                    value={formData.frequency}
                    onChange={(e) => handleInputChange("frequency", e.target.value)}
                    placeholder="e.g. Twice daily"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formData.duration}
                    onChange={(e) => handleInputChange("duration", e.target.value)}
                    placeholder="e.g. 5 days"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Instructions
                </label>
                <input
                  type="text"
                  value={formData.instructions}
                  onChange={(e) => handleInputChange("instructions", e.target.value)}
                  placeholder="e.g. After food"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                className="w-full text-xs font-bold"
                onClick={addMedicine}
              >
                {editingId ? "Update Medicine" : "+ Add Medicine"}
              </Button>
            </div>
          </>
        )}

        {/* Medicines List (Visible to Both Doctor and Patient) */}
        {medicines.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-brand-emerald" />
              <span>Prescribed Medicines ({medicines.length})</span>
            </div>
            {medicines.map((medicine, idx) => (
              <div
                key={medicine.id || idx}
                className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {medicine.name}
                    </div>
                    {(medicine.strength || medicine.dose) && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {medicine.strength} {medicine.strength && medicine.dose && "•"} {medicine.dose}
                      </div>
                    )}
                    {(medicine.frequency || medicine.duration) && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {medicine.frequency} {medicine.frequency && medicine.duration && "•"} {medicine.duration}
                      </div>
                    )}
                    {medicine.instructions && (
                      <div className="text-[10px] text-slate-400 italic truncate">
                        {medicine.instructions}
                      </div>
                    )}
                  </div>

                  {isDoctor && prescriptionStatus !== "finalized" && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => editMedicine(medicine)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 hover:text-brand-blue"
                        title="Edit"
                      >
                        <span className="text-[10px]">✎</span>
                      </button>
                      <button
                        onClick={() => removeMedicine(medicine.id)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 hover:text-rose-600"
                        title="Remove"
                      >
                        <span className="text-xs">✕</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            {isDoctor ? "No medicines added yet." : "Medicines prescribed during the call will appear here."}
          </p>
        )}

        {isDoctor && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs font-bold"
              onClick={() => savePrescription("draft")}
              disabled={isSaving || prescriptionStatus === "finalized"}
            >
              {isSaving ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="flex-1 text-xs font-bold"
              onClick={() => savePrescription("finalized")}
              disabled={isSaving || prescriptionStatus === "finalized"}
            >
              {isSaving ? "Finalizing..." : "Finalize"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}