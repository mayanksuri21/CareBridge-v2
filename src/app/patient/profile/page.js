"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { Button } from "../../../components/ui/Button";
import { Badge, Card } from "../../../components/ui/Card";
import {
  getPatientProfile,
  updatePatientProfile,
} from "../../../lib/patientActions";
import { createClient } from "../../../lib/supabase/client";
import {
  HeartPulse,
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Languages,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const GENDER_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी (Hindi)" },
];

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export default function PatientProfilePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [needsInit, setNeedsInit] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [email, setEmail] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    date_of_birth: "",
    gender: "",
    preferred_language: "en",
    state: "",
    district: "",
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const age = calculateAge(form.date_of_birth);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const res = await getPatientProfile();

        if (!res.success) {
          if (!active) return;
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            router.push("/patient/login");
            return;
          }

          // Client-side fallback if SSR cookie sync has not propagated
          const { data: prof } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!active) return;
          const meta = session.user.user_metadata || {};
          setEmail(prof?.email || session.user.email || "");
          setAvatarUrl(meta.avatar_url || meta.picture || null);
          setNeedsInit(!prof);
          setForm({
            full_name: prof?.full_name || meta.full_name || meta.name || "",
            phone: prof?.phone || "",
            date_of_birth: prof?.date_of_birth || "",
            gender: prof?.gender || "",
            preferred_language: prof?.preferred_language || "en",
            state: prof?.state || "",
            district: prof?.district || "",
          });
          setLoading(false);
          return;
        }

        if (!active) return;
        const p = res.profile || {};
        setForm({
          full_name: p.full_name || "",
          phone: p.phone || "",
          date_of_birth: p.date_of_birth || "",
          gender: p.gender || "",
          preferred_language: p.preferred_language || "en",
          state: p.state || "",
          district: p.district || "",
        });
        setEmail(res.meta?.email || p.email || "");
        setAvatarUrl(res.meta?.avatar_url || null);
        setNeedsInit(Boolean(res.needsInit));
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoadError(err.message || "Unable to load your profile.");
        setLoading(false);
      }
    }

    loadProfile();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && active) {
        router.push("/patient/login");
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [router]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");

    if (!form.full_name.trim()) {
      setSaveError("Full name is required.");
      return;
    }

    if (form.date_of_birth) {
      const dob = new Date(form.date_of_birth);
      if (Number.isNaN(dob.getTime()) || dob > new Date()) {
        setSaveError("Please enter a valid date of birth.");
        return;
      }
    }

    if (form.phone && !/^[0-9+\-\s()]{6,20}$/.test(form.phone.trim())) {
      setSaveError("Please enter a valid phone number.");
      return;
    }

    setSaving(true);
    const res = await updatePatientProfile(form);
    setSaving(false);

    if (!res.success) {
      setSaveError(res.error || "Failed to save your profile.");
      return;
    }

    setSaveSuccess("Profile updated successfully.");
    setNeedsInit(false);
    // Refresh the shared auth context so the navbar reflects the new name.
    await refreshProfile();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-brand-emerald animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const displayName = form.full_name || email || "Patient";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
              href="/patient/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-emerald hover:text-emerald-700 transition-colors"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back link + title */}
        <div className="space-y-2">
          <Link
            href="/patient/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-emerald transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="mint">Patient Profile</Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            My Profile
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Keep your personal details accurate for smooth teleconsultations.
          </p>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Identity header with avatar */}
        <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-8 h-8" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 truncate">{displayName}</h2>
              <p className="text-xs text-slate-500 truncate">{email}</p>
              {age !== null && (
                <p className="text-xs font-semibold text-brand-emerald">
                  {age} years old
                </p>
              )}
            </div>
          </div>

          {needsInit && (
            <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                Your profile details are not fully set up yet. Please review and save the
                form below to complete your profile.
              </span>
            </div>
          )}
        </Card>

        {/* Edit form */}
        <Card className="p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <ShieldCheck className="w-5 h-5 text-brand-emerald" />
            <div>
              <h2 className="text-lg font-black text-slate-900">Personal Details</h2>
              <p className="text-xs text-slate-500">
                You can only edit your own profile. Email and role are managed by CareBridge.
              </p>
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Full name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={handleChange("full_name")}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  />
                </div>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address <span className="text-slate-400 font-medium">(read-only)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    disabled
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={handleChange("phone")}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  />
                </div>
              </div>

              {/* Date of birth */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date of Birth
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={form.date_of_birth}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={handleChange("date_of_birth")}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  />
                </div>
                {age !== null && (
                  <p className="mt-1 text-[11px] font-semibold text-brand-emerald">
                    Age: {age} years
                  </p>
                )}
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  value={form.gender}
                  onChange={handleChange("gender")}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preferred language */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Preferred Language
                </label>
                <div className="relative">
                  <Languages className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <select
                    value={form.preferred_language}
                    onChange={handleChange("preferred_language")}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* State */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  State
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={form.state}
                    onChange={handleChange("state")}
                    placeholder="e.g. Maharashtra"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  />
                </div>
              </div>

              {/* District */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  District
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={form.district}
                    onChange={handleChange("district")}
                    placeholder="e.g. Pune"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
              <Link href="/patient/dashboard">
                <Button variant="outline" size="md" className="text-xs" type="button">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={saving}
                className="font-bold shadow-md shadow-brand-emerald/20 text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
