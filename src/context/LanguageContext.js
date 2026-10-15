"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { translations } from "../lib/translations";

const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    // Check localStorage if available
    try {
      const savedLang = localStorage.getItem("carebridge_lang");
      if (savedLang && (savedLang === "en" || savedLang === "hi")) {
        setLanguageState(savedLang);
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  const setLanguage = (lang) => {
    if (lang === "en" || lang === "hi") {
      setLanguageState(lang);
      try {
        localStorage.setItem("carebridge_lang", lang);
      } catch {
        // Ignore
      }
    }
  };

  const t = translations[language] || translations.en;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: "en",
      setLanguage: () => {},
      t: translations.en,
    };
  }
  return context;
}
