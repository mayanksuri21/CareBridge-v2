"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Card";
import {
  Calendar,
  Video,
  ShieldCheck,
  Languages,
  CheckCircle2,
  PlayCircle,
  Sparkles,
  ArrowRight,
  Activity,
  UserCheck,
  HeartPulse,
} from "lucide-react";

export function Hero({ onAuthClick }) {
  const { t } = useLanguage();

  return (
    <section id="home" className="relative overflow-hidden pt-8 pb-16 lg:pt-16 lg:pb-24">
      {/* Decorative gradient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-brand-mint/40 via-brand-pale-blue/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headline and Value Proposition */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-block">
              <Badge variant="mint" className="py-1 px-3.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-brand-emerald" />
                <span>{t.hero.badge}</span>
              </Badge>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]">
              {t.hero.titlePrefix}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-emerald via-emerald-600 to-brand-blue">
                {t.hero.titleHighlight}
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
              {t.hero.subtitle}
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
              <Link href="#find-doctors" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="primary"
                  className="w-full sm:w-auto font-bold shadow-lg shadow-brand-emerald/25"
                >
                  <Calendar className="w-5 h-5 mr-2" />
                  <span>{t.hero.bookAppointment}</span>
                </Button>
              </Link>
              <Link href="#how-it-works" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto font-semibold border-slate-300"
                >
                  <PlayCircle className="w-5 h-5 mr-2 text-brand-blue" />
                  <span>{t.hero.howItWorksBtn}</span>
                </Button>
              </Link>
            </div>

            {/* Trust Badges Bar */}
            <div className="pt-6 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-brand-emerald flex items-center justify-center border border-emerald-100 flex-shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{t.hero.stats.verifiedDoctors}</p>
                  <p className="text-[11px] text-slate-500">NMC Registered</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center border border-blue-100 flex-shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{t.hero.stats.multipleSpecialties}</p>
                  <p className="text-[11px] text-slate-500">Cardio, Peds & more</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-brand-emerald flex items-center justify-center border border-emerald-100 flex-shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{t.hero.stats.onlineConsultations}</p>
                  <p className="text-[11px] text-slate-500">WebRTC Encrypted</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-brand-blue flex items-center justify-center border border-blue-100 flex-shrink-0">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{t.hero.stats.multilingual}</p>
                  <p className="text-[11px] text-slate-500">Pan-India Access</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Graphic Card */}
          <div className="lg:col-span-5 relative">
            {/* Visual Healthcare Composite Card */}
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="relative rounded-3xl bg-gradient-to-br from-brand-mint/60 via-white to-brand-pale-blue/60 p-6 sm:p-8 border border-slate-200/90 shadow-xl card-elevation">
                {/* Doctor Visual Header */}
                <div className="relative rounded-2xl bg-gradient-to-tr from-brand-emerald to-emerald-600 p-6 text-white overflow-hidden shadow-md">
                  <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white">
                        Telemedicine Video Suite
                      </span>
                      <h3 className="text-xl font-bold mt-2">Connecting India to Care</h3>
                      <p className="text-xs text-emerald-100 mt-1">
                        Accessible consultation in Hindi & English
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
                      <HeartPulse className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Consultation mockup pill */}
                  <div className="mt-6 bg-white/15 backdrop-blur-md rounded-xl p-3 flex items-center justify-between border border-white/20 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
                      <span className="font-medium">Active Online Consultations</span>
                    </div>
                    <span className="font-bold bg-white text-brand-emerald px-2 py-0.5 rounded text-[11px]">
                      LiveKit Ready
                    </span>
                  </div>
                </div>

                {/* Floating Micro-Cards */}
                <div className="mt-5 space-y-3">
                  <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-pale-blue flex items-center justify-center text-brand-blue font-bold">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          {t.hero.floatingDoctorTag}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Medical Registration Certified
                        </p>
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-brand-emerald" />
                  </div>

                  <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-brand-mint flex items-center justify-center text-brand-emerald font-bold">
                        <Languages className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          Regional Language Consultation
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Communicate in English, Hindi & regional languages
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-brand-emerald bg-brand-mint px-2 py-1 rounded">
                      Pan-India
                    </span>
                  </div>
                </div>

                {/* Quick Action Prompt */}
                <div className="mt-5 pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Looking for quick consultation?</span>
                  <Link
                    href="#find-doctors"
                    className="font-bold text-brand-emerald hover:text-brand-emerald-dark inline-flex items-center gap-1"
                  >
                    Browse Directory <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
