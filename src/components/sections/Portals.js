"use client";

import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { Badge } from "../ui/Card";
import { Button } from "../ui/Button";
import { UserCheck, Stethoscope, Video, Calendar, ShieldCheck, HeartPulse, Check, ArrowRight } from "lucide-react";

export function Portals({ onAuthClick }) {
  const { t } = useLanguage();

  return (
    <section className="py-20 bg-slate-50 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Patient Card */}
          <div className="relative rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-brand-mint/40 p-8 sm:p-10 border border-emerald-200/80 shadow-md card-elevation flex flex-col justify-between overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-100/50 rounded-full blur-2xl -z-10" />

            <div className="space-y-5">
              <Badge variant="mint">{t.portals.patient.badge}</Badge>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug">
                {t.portals.patient.title}
              </h3>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                {t.portals.patient.desc}
              </p>

              {/* Patient feature checklist */}
              <ul className="space-y-3 pt-2 text-sm text-slate-700">
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-brand-emerald flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Direct discovery by local language, location, and fee</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-brand-emerald flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Instant or scheduled high-quality video appointments</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-brand-emerald flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Digital prescriptions sent directly to your phone & account</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-emerald-100">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onAuthClick("Patient Registration / Login")}
                className="w-full sm:w-auto font-bold shadow-md shadow-brand-emerald/20"
              >
                <UserCheck className="w-5 h-5 mr-2" />
                <span>{t.portals.patient.btn}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Doctor Card */}
          <div className="relative rounded-3xl bg-gradient-to-br from-blue-50 via-white to-brand-pale-blue/40 p-8 sm:p-10 border border-blue-200/80 shadow-md card-elevation flex flex-col justify-between overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-100/50 rounded-full blur-2xl -z-10" />

            <div className="space-y-5">
              <Badge variant="blue">{t.portals.doctor.badge}</Badge>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug">
                {t.portals.doctor.title}
              </h3>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
                {t.portals.doctor.desc}
              </p>

              {/* Doctor feature checklist */}
              <ul className="space-y-3 pt-2 text-sm text-slate-700">
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-brand-blue flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Define custom consultation hours and transparent slot fees</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-brand-blue flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Seamless video consulting with clinical note-taking interface</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-brand-blue flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span>Standardized compliant digital Rx with medicine dosage builder</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 pt-6 border-t border-blue-100">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => onAuthClick("Doctor Portal / Onboarding")}
                className="w-full sm:w-auto font-bold shadow-md shadow-brand-blue/20"
              >
                <Stethoscope className="w-5 h-5 mr-2" />
                <span>{t.portals.doctor.btn}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
