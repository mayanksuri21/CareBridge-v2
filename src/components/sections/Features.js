"use client";

import React from "react";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Card } from "../ui/Card";
import {
  Video,
  CalendarCheck,
  UserCheck2,
  FileText,
  Languages,
  ShieldCheck,
} from "lucide-react";

export function Features() {
  const { t } = useLanguage();

  const iconList = [
    <Video key="video" className="w-6 h-6 text-brand-emerald" />,
    <CalendarCheck key="calendar" className="w-6 h-6 text-brand-blue" />,
    <UserCheck2 key="verified" className="w-6 h-6 text-brand-emerald" />,
    <FileText key="rx" className="w-6 h-6 text-brand-blue" />,
    <Languages key="lang" className="w-6 h-6 text-brand-emerald" />,
    <ShieldCheck key="privacy" className="w-6 h-6 text-brand-blue" />,
  ];

  return (
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <Badge variant="mint">{t.features.badge}</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {t.features.titlePrefix}{" "}
            <span className="text-brand-emerald">{t.features.titleHighlight}</span>
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            {t.features.subtitle}
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {t.features.items.map((item, index) => (
            <Card
              key={index}
              hover
              className="p-8 border-slate-200/90 flex flex-col justify-between group"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                  {iconList[index % iconList.length]}
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-emerald transition-colors">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {item.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-semibold text-brand-emerald">
                <span>CareBridge Architecture Standard</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
