"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import { Button } from "./Button";
import { Badge } from "./Card";
import { X, User, Stethoscope, ArrowRight, ShieldCheck } from "lucide-react";

export function AuthModal({ isOpen, onClose, targetAction }) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative card-elevation space-y-6">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-2">
          <Badge variant="mint">CareBridge Access Portals</Badge>
          <h3 className="text-2xl font-black text-slate-900">
            {targetAction || "Choose Your Portal"}
          </h3>
          <p className="text-xs text-slate-600">
            CareBridge provides dedicated authentication experiences for patients and certified medical doctors.
          </p>
        </div>

        {/* Portal Selection Cards */}
        <div className="space-y-3">
          <Link
            href="/patient/login"
            onClick={onClose}
            className="flex items-center justify-between p-4 rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/60 to-white hover:border-brand-emerald hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-mint text-brand-emerald flex items-center justify-center font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-emerald transition-colors">
                  Patient Portal
                </h4>
                <p className="text-[11px] text-slate-500">Sign in to book slots & consult doctors</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-brand-emerald group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/doctor/login"
            onClick={onClose}
            className="flex items-center justify-between p-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/60 to-white hover:border-brand-blue hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-pale-blue text-brand-blue flex items-center justify-center font-bold">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-brand-blue transition-colors">
                  Doctor Portal
                </h4>
                <p className="text-[11px] text-slate-500">Sign in, review status, or apply</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-brand-blue group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <Link href="/admin/login" onClick={onClose} className="hover:text-slate-800 transition-colors">
            Medical Admin Login
          </Link>
          <span className="flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            Supabase Protected
          </span>
        </div>
      </div>
    </div>
  );
}
