"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { Card, Badge } from "../ui/Card";
import { Button } from "../ui/Button";
import { getDirectoryDoctors } from "../../lib/appointmentActions";
import { createClient } from "../../lib/supabase/client";
import { computeDoctorDirectoryAvailability } from "../../lib/slotEngine";
import {
  Search,
  Filter,
  Languages,
  ShieldCheck,
  Calendar,
  AlertCircle,
  Clock,
  ChevronRight,
  UserCheck,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export function DoctorDiscovery({ onAuthClick, user }) {
  const { t } = useLanguage();
  const [isPending, startTransition] = useTransition();

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");
  const [selectedLanguage, setSelectedLanguage] = useState("all");

  const loadDoctors = () => {
    setLoading(true);
    setFetchError("");
    startTransition(async () => {
      try {
        const res = await getDirectoryDoctors();
        let docs = res.success ? (res.doctors || []) : [];

        // If client-side authenticated, query directly with the client session
        // to guarantee RLS bypasses any SSR cookie delay
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session && docs.length > 0) {
          const docIds = docs.map((d) => d.doctor_id);
          const [{ data: schedules }, { data: leaves }] = await Promise.all([
            supabase
              .from("doctor_schedules")
              .select("doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active")
              .in("doctor_id", docIds)
              .eq("is_active", true),
            supabase
              .from("doctor_leaves")
              .select("doctor_id, leave_start, leave_end, reason")
              .in("doctor_id", docIds),
          ]);

          if (schedules && schedules.length > 0) {
            docs = computeDoctorDirectoryAvailability(docs, schedules, leaves || []);
          }
        }

        if (!res.success && docs.length === 0) {
          setFetchError(res.error || "Unable to load approved doctors directory.");
        } else {
          setDoctors(docs);
        }
      } catch (err) {
        console.error("Directory load error:", err);
        setFetchError(err.message || "Unable to load directory.");
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  // Dynamically extract unique specialties and languages from real doctors
  const specialties = Array.from(
    new Set(doctors.map((d) => d.specialization).filter(Boolean))
  ).sort();

  const allLanguages = Array.from(
    new Set(
      doctors.flatMap((d) =>
        Array.isArray(d.consultation_languages) ? d.consultation_languages : []
      )
    )
  ).sort();

  // Filter doctors
  const filteredDoctors = doctors.filter((doc) => {
    // Search match (name, specialty, qualification, languages)
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      const nameMatch = doc.full_name?.toLowerCase().includes(term);
      const specMatch = doc.specialization?.toLowerCase().includes(term);
      const qualMatch = doc.qualification?.toLowerCase().includes(term);
      const langMatch = Array.isArray(doc.consultation_languages) &&
        doc.consultation_languages.some((l) => l.toLowerCase().includes(term));

      if (!nameMatch && !specMatch && !qualMatch && !langMatch) {
        return false;
      }
    }

    // Specialty filter
    if (selectedSpecialty !== "all" && doc.specialization !== selectedSpecialty) {
      return false;
    }

    // Language filter
    if (selectedLanguage !== "all") {
      if (
        !Array.isArray(doc.consultation_languages) ||
        !doc.consultation_languages.includes(selectedLanguage)
      ) {
        return false;
      }
    }

    return true;
  });

  return (
    <section id="find-doctors" className="py-8 sm:py-12 bg-slate-50 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <Badge variant="blue">National Medical Commission Verified</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Consult Verified <span className="text-brand-emerald">Specialists Online</span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Search licensed practitioners verified through State Medical Councils. Select an approved doctor to view real-time available consultation slots.
          </p>
        </div>

        {/* Discovery Filter & Search Bar Box */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 card-elevation space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
            {/* Search Input */}
            <div className="md:col-span-8 relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by doctor name, specialty, qualification, or language..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white transition-all text-slate-800 placeholder-slate-400 font-medium"
              />
            </div>

            {/* Specialty dropdown built dynamically from real doctors */}
            <div className="md:col-span-4">
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="w-full py-3.5 px-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:bg-white transition-all text-slate-700 font-semibold cursor-pointer"
              >
                <option value="all">All Specialties</option>
                {specialties.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Languages Filter Row */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Languages className="w-4 h-4 text-brand-emerald" />
                Spoken Languages:
              </span>
              <button
                type="button"
                onClick={() => setSelectedLanguage("all")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedLanguage === "all"
                    ? "bg-brand-emerald text-white border-brand-emerald shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                All Languages
              </button>
              {allLanguages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSelectedLanguage(lang)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    selectedLanguage === lang
                      ? "bg-brand-emerald text-white border-brand-emerald shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                Showing {filteredDoctors.length} verified {filteredDoctors.length === 1 ? "doctor" : "doctors"}
              </span>
              <button
                type="button"
                onClick={loadDoctors}
                title="Refresh directory"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-brand-emerald" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {fetchError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-rose-800 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={loadDoctors}
              className="font-bold underline text-rose-700 hover:text-rose-900"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-brand-emerald animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-600">Connecting to verified doctors directory...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredDoctors.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Doctors Match Your Filters</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              We couldn&apos;t find any verified practitioners matching the selected criteria. Try adjusting your search term or resetting the specialty/language filters.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedSpecialty("all");
                  setSelectedLanguage("all");
                }}
                className="text-xs font-bold"
              >
                Reset All Filters
              </Button>
            </div>
          </div>
        )}

        {/* Real Doctors Cards Grid */}
        {!loading && filteredDoctors.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDoctors.map((doc) => {
              const daysOfWeekNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const formattedActiveDays = (doc.activeDays || []).map((d) => daysOfWeekNames[d]).join(", ");

              return (
                <Card
                  key={doc.doctor_id}
                  hover
                  className="flex flex-col justify-between border-slate-200/90 relative group p-6 bg-white rounded-3xl shadow-sm hover:shadow-md transition-all"
                >
                  <div className="space-y-4">
                    {/* Header Row: Initials & Badges */}
                    <div className="flex items-start justify-between">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-mint to-brand-pale-blue flex items-center justify-center font-black text-xl text-brand-emerald border border-slate-100 shadow-sm">
                        {doc.full_name?.split(" ")[1]?.charAt(0) || doc.full_name?.charAt(0) || "D"}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
                          <ShieldCheck className="w-3.5 h-3.5 text-brand-emerald" />
                          Verified
                        </span>
                        {doc.isOnLeaveToday && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            On leave today
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Practitioner Name and Specialty */}
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-brand-emerald transition-colors">
                        {doc.full_name}
                      </h3>
                      <p className="text-xs font-bold text-brand-blue mt-0.5">{doc.specialization}</p>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>{doc.qualification} {doc.institution ? `• ${doc.institution}` : ""}</span>
                      </p>
                    </div>

                    {/* Bio snippet */}
                    {doc.bio && (
                      <p className="text-xs text-slate-600 line-clamp-2 italic bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                        &ldquo;{doc.bio}&rdquo;
                      </p>
                    )}

                    {/* Detailed Attributes */}
                    <div className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Experience:</span>
                        <span className="font-bold text-slate-800">{doc.experience_years} Years</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Languages:</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[150px] text-right">
                          {Array.isArray(doc.consultation_languages)
                            ? doc.consultation_languages.join(", ")
                            : "English"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Schedule:</span>
                        <span className="font-semibold text-slate-700 text-right">
                          {doc.hasActiveSchedule ? formattedActiveDays : (
                            <span className="text-amber-600 font-bold">Availability not set yet</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer with Fee and Action */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Consultation Fee
                      </p>
                      <p className="text-lg font-black text-slate-900">
                        ₹{Number(doc.consultation_fee || 0).toFixed(0)}
                      </p>
                    </div>

                    {doc.hasActiveSchedule ? (
                      <Link href={`/find-doctors/${doc.doctor_id}`}>
                        <Button
                          variant="mint"
                          size="sm"
                          className="text-xs font-bold shadow-sm"
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          Book Slot
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled
                        className="text-xs font-semibold opacity-60 cursor-not-allowed"
                      >
                        Availability not set yet
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
