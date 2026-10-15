"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../ui/Button";
import {
  HeartPulse,
  Globe,
  Menu,
  X,
  ArrowRight,
  User,
  Stethoscope,
  ChevronDown,
  LayoutDashboard,
  Calendar,
  LogOut,
  UserCircle,
} from "lucide-react";

export function Navbar({ onAuthClick }) {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { user, profile, isAdmin, doctorApp, signOut } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  // Determine if signed-in account is a patient
  const isPatient = Boolean(user && !isAdmin && !doctorApp);

  // Derive patient display name: profile > user_metadata > email split
  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (user?.email ? user.email.split("@")[0] : "Patient");

  const handleSignOut = async () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    await signOut();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo and Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md shadow-brand-emerald/20 group-hover:scale-105 transition-transform">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-black tracking-tight text-slate-900">
                  Care<span className="text-brand-emerald">Bridge</span>
                </span>
                <span className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-brand-mint text-brand-emerald-dark">
                  India
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium tracking-wide hidden sm:block">
                {t.nav.tagline}
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7">
            {isPatient ? (
              <>
                <Link
                  href="/"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.home}
                </Link>
                <Link
                  href="/find-doctors"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.findDoctors}
                </Link>
                <Link
                  href="/patient/dashboard"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/patient/dashboard#appointments-history"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  My Appointments
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/#home"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.home}
                </Link>
                <Link
                  href="/find-doctors"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.findDoctors}
                </Link>
                <Link
                  href="/#how-it-works"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.howItWorks}
                </Link>
                <Link
                  href="/#features"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.features}
                </Link>
                <Link
                  href="/#specialties"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.specialties}
                </Link>
                <Link
                  href="/#about"
                  className="text-sm font-semibold text-slate-700 hover:text-brand-emerald transition-colors"
                >
                  {t.nav.about}
                </Link>
              </>
            )}
          </nav>

          {/* Right Action Controls */}
          <div className="hidden md:flex items-center gap-3">
            {/* Functional Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              title="Switch Language / भाषा बदलें"
              aria-label="Switch Language"
            >
              <Globe className="w-4 h-4 text-brand-emerald" />
              <span>{language === "en" ? "हिंदी" : "English"}</span>
            </button>

            {isPatient ? (
              /* Patient Authenticated Dropdown Menu */
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100/70 transition-colors shadow-sm"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-emerald text-white flex items-center justify-center font-bold text-[11px]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="max-w-[140px] truncate font-bold text-slate-800">
                    {displayName}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white shadow-xl border border-slate-200/80 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Patient Portal</p>
                      <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/patient/dashboard"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-emerald transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-slate-400" />
                        Dashboard
                      </Link>
                      <Link
                        href="/patient/dashboard#appointments-history"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-emerald transition-colors"
                      >
                        <Calendar className="w-4 h-4 text-slate-400" />
                        My Appointments & History
                      </Link>
                      <Link
                        href="/patient/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-emerald transition-colors"
                      >
                        <UserCircle className="w-4 h-4 text-slate-400" />
                        My Profile
                      </Link>
                    </div>

                    <div className="pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : doctorApp ? (
              /* Doctor Account Menu */
              <div className="flex items-center gap-2">
                <Link
                  href={doctorApp.status === "approved" ? "/doctor/dashboard" : "/doctor/application-status"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-brand-blue border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>{doctorApp.status === "approved" ? "Doctor Dashboard" : "Application Status"}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : isAdmin ? (
              /* Admin Menu */
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/dashboard"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-emerald-400 border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Admin Dashboard</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* Visitor Public Actions */
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAuthClick ? onAuthClick("Sign In") : router.push("/patient/login")}
                  className="text-slate-700 font-semibold text-sm hover:text-brand-emerald"
                >
                  {t.nav.signIn}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onAuthClick ? onAuthClick("Get Started") : router.push("/patient/signup")}
                  className="font-semibold text-sm shadow-brand-emerald/20 shadow-md"
                >
                  <span>{t.nav.getStarted}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-700"
              aria-label="Switch Language"
            >
              {language === "en" ? "हिंदी" : "EN"}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-4 pb-6 space-y-4">
          <nav className="flex flex-col space-y-3">
            {isPatient ? (
              <>
                <div className="pb-2 border-b border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Signed in as</p>
                  <p className="text-sm font-bold text-slate-800">{displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.home}
                </Link>
                <Link
                  href="/find-doctors"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.findDoctors}
                </Link>
                <Link
                  href="/patient/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1 flex items-center gap-2"
                >
                  <LayoutDashboard className="w-4 h-4 text-brand-emerald" />
                  Dashboard
                </Link>
                <Link
                  href="/patient/dashboard#appointments-history"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1 flex items-center gap-2"
                >
                  <Calendar className="w-4 h-4 text-brand-emerald" />
                  My Appointments & History
                </Link>
                <Link
                  href="/patient/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1 flex items-center gap-2"
                >
                  <UserCircle className="w-4 h-4 text-brand-emerald" />
                  My Profile
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/#home"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.home}
                </Link>
                <Link
                  href="/find-doctors"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.findDoctors}
                </Link>
                <Link
                  href="/#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.howItWorks}
                </Link>
                <Link
                  href="/#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.features}
                </Link>
                <Link
                  href="/#specialties"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.specialties}
                </Link>
                <Link
                  href="/#about"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-semibold text-slate-800 hover:text-brand-emerald py-1"
                >
                  {t.nav.about}
                </Link>
              </>
            )}
          </nav>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            {isPatient ? (
              <Button
                variant="outline"
                size="md"
                onClick={handleSignOut}
                className="w-full justify-center text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            ) : doctorApp ? (
              <div className="space-y-2">
                <Link
                  href={doctorApp.status === "approved" ? "/doctor/dashboard" : "/doctor/application-status"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-blue-50 text-brand-blue border border-blue-200"
                >
                  <Stethoscope className="w-4 h-4" />
                  {doctorApp.status === "approved" ? "Doctor Dashboard" : "Application Status"}
                </Link>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSignOut}
                  className="w-full justify-center text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            ) : isAdmin ? (
              <div className="space-y-2">
                <Link
                  href="/admin/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-emerald-400 border border-slate-700"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Admin Dashboard
                </Link>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleSignOut}
                  className="w-full justify-center text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onAuthClick) {
                      onAuthClick("Sign In");
                    } else {
                      router.push("/patient/login");
                    }
                  }}
                  className="w-full justify-center"
                >
                  <User className="w-4 h-4 mr-2" />
                  {t.nav.signIn}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (onAuthClick) {
                      onAuthClick("Get Started");
                    } else {
                      router.push("/patient/signup");
                    }
                  }}
                  className="w-full justify-center"
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  {t.nav.getStarted}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

