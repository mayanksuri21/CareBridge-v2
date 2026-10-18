"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "../../components/layout/Navbar";
import { Footer } from "../../components/layout/Footer";
import { DoctorDiscovery } from "../../components/sections/DoctorDiscovery";
import { useAuth } from "../../context/AuthContext";
import { ShieldAlert } from "lucide-react";
import { Button } from "../../components/ui/Button";

export default function FindDoctorsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-emerald"></div>
        </main>
        <Footer />
      </div>
    );
  }

  // If user is not authenticated, prompt to sign in as patient
  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 max-w-md w-full text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-brand-mint text-brand-emerald flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Patient Sign-In Required</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              To search verified doctor availability, view live schedules, and book teleconsultations, please sign in to your CareBridge patient account.
            </p>
            <div className="pt-2 flex flex-col gap-2.5">
              <Button
                variant="primary"
                onClick={() => router.push("/patient/login?redirect=/find-doctors")}
                className="w-full text-xs font-bold"
              >
                Sign In as Patient
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/patient/signup")}
                className="w-full text-xs font-semibold"
              >
                Create New Patient Account
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <main className="flex-1 py-4 sm:py-8">
        <DoctorDiscovery user={user} />
      </main>

      <Footer />
    </div>
  );
}
