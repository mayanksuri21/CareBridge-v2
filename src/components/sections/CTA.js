"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { Badge } from "../ui/Card";
import { Button } from "../ui/Button";
import { Calendar, Stethoscope, ArrowRight, Sparkles } from "lucide-react";

export function CTA({ onAuthClick }) {
  const { t } = useLanguage();

  return (
    <section className="py-20 bg-gradient-to-br from-brand-emerald-dark via-brand-emerald to-emerald-700 text-white relative overflow-hidden">
      {/* Subtle geometric circles */}
      <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/10 blur-2xl pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8 relative z-10">
        <div className="inline-block">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/15 backdrop-blur-md text-emerald-100 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>{t.cta.badge}</span>
          </span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight max-w-3xl mx-auto">
          {t.cta.title}
        </h2>

        <p className="text-base sm:text-lg text-emerald-100 max-w-2xl mx-auto font-normal leading-relaxed">
          {t.cta.subtitle}
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="#find-doctors" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto bg-white text-brand-emerald-dark hover:bg-slate-100 font-bold shadow-lg"
            >
              <Calendar className="w-5 h-5 mr-2 text-brand-emerald" />
              <span>{t.cta.patientBtn}</span>
            </Button>
          </Link>

          <Button
            size="lg"
            variant="outline"
            onClick={() => onAuthClick("Doctor Registration")}
            className="w-full sm:w-auto bg-transparent border-white/60 text-white hover:bg-white/10 hover:border-white font-bold"
          >
            <Stethoscope className="w-5 h-5 mr-2 text-emerald-200" />
            <span>{t.cta.doctorBtn}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
}
