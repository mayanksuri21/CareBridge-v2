"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import PharmacyPrices from "../../../components/PharmacyPrices";
import {
  HeartPulse,
  User,
  FileText,
  LogOut,
  UserCircle,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pill,
} from "lucide-react";

export default function PatientPrescriptionsPage() {
  const router = useRouter();
  const { user, profile, loading, signOut } = useAuth();

  const [prescriptions, setPrescriptions] = useState([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(false);
  const [prescriptionsError, setPrescriptionsError] = useState("");

  const loadPrescriptions = async () => {
    setPrescriptionsLoading(true);
    setPrescriptionsError("");
    try {
      const res = await fetch("/api/patient/prescriptions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setPrescriptionsError(data?.message || "Unable to load prescriptions.");
      } else {
        setPrescriptions(data.prescriptions || []);
      }
    } catch (err) {
      console.log("Load prescriptions error:", err);
      setPrescriptionsError("Failed to load prescriptions.");
    } finally {
      setPrescriptionsLoading(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      loadPrescriptions();
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/patient/login");
    }
  }, [loading, user, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const formatDateIST = (iso) => {
    return new Date(iso).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTimeIST = (iso) => {
    return new Date(iso).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading Prescriptions...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/patient/dashboard" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md">
              <HeartPulse className="w-5 h-5" />
            </div>
            <span className="text-xl font-black text-slate-900">
              Care<span className="text-brand-emerald">Bridge</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/patient/prescriptions"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-emerald hover:text-emerald-700 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Prescriptions
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">My Prescriptions</h1>
            <p className="text-xs text-slate-500">
              View your finalized prescriptions and clinical notes from consultations
            </p>
          </div>
          <button
            type="button"
            onClick={loadPrescriptions}
            className="text-xs font-bold text-brand-emerald hover:underline flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${prescriptionsLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Error Alert */}
        {prescriptionsError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{prescriptionsError}</span>
            </div>
            <button
              onClick={loadPrescriptions}
              className="text-rose-700 hover:text-rose-900 font-bold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Prescriptions List */}
        {prescriptions.length === 0 && !prescriptionsLoading ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-sm">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800">No Prescriptions Yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your finalized prescriptions will appear here after consultations.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {prescriptions.map((prescription) => (
              <Card
                key={prescription.id}
                className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 text-base">
                        {prescription.doctor.name}
                      </h3>
                      {prescription.doctor.specialization && (
                        <span className="text-xs font-semibold text-brand-blue">
                          {prescription.doctor.specialization}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDateIST(prescription.appointmentDate)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTimeIST(prescription.appointmentDate)} IST</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={prescription.status === "finalized" ? "mint" : "slate"}>
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${prescription.status === "finalized" ? "bg-brand-emerald" : "bg-amber-500"
                        }`}
                    />
                    {prescription.status === "finalized" ? "Finalized" : "Draft"}
                  </Badge>
                </div>

                {/* Medicines */}
                {prescription.medicines.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Pill className="w-3.5 h-3.5" />
                      Medicines ({prescription.medicines.length})
                    </h4>
                    <div className="space-y-2">
                      {prescription.medicines.map((med, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1"
                        >
                          <div className="font-semibold text-slate-900">{med.name}</div>
                          <div className="text-slate-600">
                            {med.strength && <span>{med.strength}</span>}
                            {med.strength && med.dose && <span> • </span>}
                            {med.dose && <span>{med.dose}</span>}
                          </div>
                          <div className="text-slate-600">
                            {med.frequency && <span>{med.frequency}</span>}
                            {med.frequency && med.duration && <span> • </span>}
                            {med.duration && <span>{med.duration}</span>}
                          </div>
                          {med.instructions && (
                            <div className="text-slate-500 italic">{med.instructions}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clinical Notes */}
                {prescription.clinicalNotes && (
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                    <div className="font-semibold mb-1">Clinical Notes:</div>
                    <p className="whitespace-pre-wrap">{prescription.clinicalNotes}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {prescription.status === "finalized"
                      ? `Finalized on ${formatDateIST(prescription.finalizedAt)}`
                      : `Created on ${formatDateIST(prescription.createdAt)}`}
                  </span>
                  {prescription.status === "finalized" && (
                    <div className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified Prescription</span>
                    </div>
                  )}
                </div>

                {/* Pharmacy Prices (only for finalized prescriptions) */}
                {prescription.status === "finalized" && (
                  <PharmacyPrices prescriptionId={prescription.id} />
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
