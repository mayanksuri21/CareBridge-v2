"use client";

import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Card } from "../ui/Card";
import { ShieldCheck, Lock, Award, FileSpreadsheet, CheckCircle } from "lucide-react";

export function Trust() {
  const { t } = useLanguage();

  const trustIcons = [
    <Award key="nmc" className="w-6 h-6 text-brand-emerald" />,
    <Lock key="lock" className="w-6 h-6 text-brand-blue" />,
    <ShieldCheck key="protocol" className="w-6 h-6 text-brand-emerald" />,
    <FileSpreadsheet key="fee" className="w-6 h-6 text-brand-blue" />,
  ];

  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <Badge variant="mint">{t.trust.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {t.trust.titlePrefix}{" "}
            <span className="text-brand-emerald">{t.trust.titleHighlight}</span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            {t.trust.subtitle}
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.trust.items.map((item, index) => (
            <Card
              key={index}
              className="p-7 border-slate-200/90 flex flex-col justify-between group hover:border-slate-300 transition-colors"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                  {trustIcons[index]}
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                  {item.desc}
                </p>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-brand-emerald font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Verified Standard</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
