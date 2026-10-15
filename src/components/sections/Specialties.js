"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { Badge, Card } from "../ui/Card";
import {
  Stethoscope,
  Heart,
  Sparkle,
  Baby,
  Bone,
  PersonStanding,
  Eye,
  Ear,
  Brain,
  Smile,
  ArrowRight,
} from "lucide-react";

export function Specialties() {
  const { t } = useLanguage();

  const specialtyIcons = [
    <Stethoscope key="gen" className="w-6 h-6 text-emerald-600" />,
    <Heart key="heart" className="w-6 h-6 text-rose-500" />,
    <Sparkle key="derma" className="w-6 h-6 text-amber-500" />,
    <Baby key="peds" className="w-6 h-6 text-sky-500" />,
    <Bone key="ortho" className="w-6 h-6 text-indigo-500" />,
    <PersonStanding key="gyn" className="w-6 h-6 text-pink-500" />,
    <Eye key="eye" className="w-6 h-6 text-teal-500" />,
    <Ear key="ent" className="w-6 h-6 text-orange-500" />,
    <Brain key="neuro" className="w-6 h-6 text-purple-500" />,
    <Smile key="mental" className="w-6 h-6 text-emerald-500" />,
  ];

  return (
    <section id="specialties" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <Badge variant="mint">{t.specialties.badge}</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {t.specialties.titlePrefix}{" "}
              <span className="text-brand-emerald">{t.specialties.titleHighlight}</span>
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              {t.specialties.subtitle}
            </p>
          </div>
          <Link
            href="#find-doctors"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-emerald hover:text-brand-emerald-dark"
          >
            <span>{t.specialties.viewAll}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Specialties Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {t.specialties.items.map((spec, i) => (
            <Card
              key={i}
              hover
              className="p-5 flex flex-col justify-between border-slate-200/80 group"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {specialtyIcons[i % specialtyIcons.length]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-brand-emerald transition-colors">
                    {spec.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {spec.desc}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-brand-emerald">
                <span>Verified Specialists</span>
                <ArrowRight className="w-3 h-3 text-slate-300 group-hover:translate-x-1 group-hover:text-brand-emerald transition-all" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
