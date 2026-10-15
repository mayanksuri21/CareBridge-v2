"use client";

import React, { useState } from "react";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Hero } from "../components/sections/Hero";
import { DoctorDiscovery } from "../components/sections/DoctorDiscovery";
import { Features } from "../components/sections/Features";
import { HowItWorks } from "../components/sections/HowItWorks";
import { Specialties } from "../components/sections/Specialties";
import { Portals } from "../components/sections/Portals";
import { Trust } from "../components/sections/Trust";
import { CTA } from "../components/sections/CTA";
import { AuthModal } from "../components/ui/AuthModal";

export default function HomePage() {
  const [authModal, setAuthModal] = useState({ isOpen: false, action: "" });

  const handleAuthClick = (actionName) => {
    setAuthModal({ isOpen: true, action: actionName });
  };

  const closeAuthModal = () => {
    setAuthModal({ isOpen: false, action: "" });
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Reusable Navbar */}
      <Navbar onAuthClick={handleAuthClick} />

      {/* Main Page Composition */}
      <main className="flex-1">
        {/* 1. Hero Section */}
        <Hero onAuthClick={handleAuthClick} />

        {/* 2. Doctor Discovery Section */}
        <DoctorDiscovery onAuthClick={handleAuthClick} />

        {/* 3. Features Section */}
        <Features />

        {/* 4. How It Works Section */}
        <HowItWorks />

        {/* 5. Medical Specialties Section */}
        <Specialties />

        {/* 6. Dedicated Patient and Doctor Portals Section */}
        <Portals onAuthClick={handleAuthClick} />

        {/* 7. Trust, Privacy & Security Section */}
        <Trust />

        {/* 8. Final CTA Section */}
        <CTA onAuthClick={handleAuthClick} />
      </main>

      {/* Reusable Footer */}
      <Footer />

      {/* Clear, Non-functional Auth Placeholder Modal per specifications */}
      <AuthModal
        isOpen={authModal.isOpen}
        onClose={closeAuthModal}
        targetAction={authModal.action}
      />
    </div>
  );
}
