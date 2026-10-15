"use client";

import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { Badge } from "../ui/Card";
import { Search, Calendar, Video, FileCheck2, ArrowRight } from "lucide-react";

export function HowItWorks() {
  const { t } = useLanguage();

  const stepIcons = [
    <Search key="search" className="w-6 h-6 text-brand-emerald" />,
    <Calendar key="calendar" className="w-6 h-6 text-brand-blue" />,
    <Video key="video" className="w-6 h-6 text-brand-emerald" />,
    <FileCheck2 key="rx" className="w-6 h-6 text-brand-blue" />,
  ];

  return (
    <section id="how-it-works" className="py-20 bg-slate-50 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <Badge variant="blue">{t.howItWorks.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {t.howItWorks.titlePrefix}{" "}
            <span className="text-brand-emerald">{t.howItWorks.titleHighlight}</span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            {t.howItWorks.subtitle}
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {t.howItWorks.steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200 card-elevation relative flex flex-col justify-between group hover:border-brand-emerald/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {stepIcons[idx]}
                  </div>
                  <span className="text-2xl font-black text-slate-200 group-hover:text-brand-emerald/20 transition-colors">
                    0{step.step}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {step.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-1 text-xs font-semibold text-brand-emerald">
                <span>Step 0{step.step} Complete</span>
                {idx < 3 && <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
