"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { HeartPulse, Shield, MapPin, Phone, Mail, Award } from "lucide-react";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-400 flex items-center justify-center text-white shadow-md">
                <HeartPulse className="w-6 h-6" />
              </div>
              <span className="text-2xl font-black tracking-tight text-white">
                Care<span className="text-brand-emerald">Bridge</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              {t.footer.tagline}
            </p>
            <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-emerald-400 border border-slate-700 font-medium">
                <Shield className="w-3.5 h-3.5" />
                Telemedicine Guidelines Compliant
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-blue-400 border border-slate-700 font-medium">
                <Award className="w-3.5 h-3.5" />
                NMC Verified Doctors
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {t.footer.quickLinksTitle}
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link href="#home" className="hover:text-emerald-400 transition-colors">
                  {t.nav.home}
                </Link>
              </li>
              <li>
                <Link href="#find-doctors" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.findDoctors}
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.howItWorks}
                </Link>
              </li>
              <li>
                <Link href="#features" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.features}
                </Link>
              </li>
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.specialties}
                </Link>
              </li>
            </ul>
          </div>

          {/* Medical Specialties */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {t.footer.servicesTitle}
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  General Medicine
                </Link>
              </li>
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  Cardiology
                </Link>
              </li>
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  Dermatology
                </Link>
              </li>
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  Pediatrics
                </Link>
              </li>
              <li>
                <Link href="#specialties" className="hover:text-emerald-400 transition-colors">
                  Orthopedics
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust, Support & Legal */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              {t.footer.supportTitle}
            </h4>
            <ul className="space-y-2 text-sm text-slate-400">
              <li>
                <Link href="#about" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.about}
                </Link>
              </li>
              <li>
                <Link href="#trust" className="hover:text-emerald-400 transition-colors">
                  {t.footer.links.telemedicineGuidelines}
                </Link>
              </li>
              <li>
                <span className="text-slate-500 cursor-not-allowed">
                  {t.footer.links.privacyPolicy} (Policy Draft)
                </span>
              </li>
              <li>
                <span className="text-slate-500 cursor-not-allowed">
                  {t.footer.links.terms} (Terms Draft)
                </span>
              </li>
              <li className="pt-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  support@carebridge.in
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Disclaimer & Copyright */}
        <div className="pt-8 text-xs text-slate-500 space-y-4">
          <p className="bg-slate-800/60 p-3 rounded-lg border border-slate-800 leading-relaxed text-slate-400">
            {t.footer.disclaimer}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} {t.footer.rights}</p>
            <p className="text-slate-500">
              CareBridge Telemedicine Project — Pan-India Telehealth Architecture
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
