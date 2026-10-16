"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

const AuthContext = createContext({
  user: null,
  profile: null,
  doctorApp: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [doctorApp, setDoctorApp] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const loadUserData = async (currentUser) => {
    if (!currentUser) {
      setUser(null);
      setProfile(null);
      setDoctorApp(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setUser(currentUser);

    try {
      const [profRes, adminRes, docRes] = await Promise.allSettled([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("administrators")
          .select("user_id")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("doctor_applications")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
      ]);

      if (profRes.status === "fulfilled" && profRes.value?.data) {
        setProfile(profRes.value.data);
      } else {
        setProfile(null);
      }

      if (adminRes.status === "fulfilled" && adminRes.value?.data) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }

      if (docRes.status === "fulfilled" && docRes.value?.data) {
        setDoctorApp(docRes.value.data);
      } else {
        setDoctorApp(null);
      }
    } catch {
      // Supabase connection or table not set up yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Initial check
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          loadUserData(session?.user || null);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    // 2. Continuous auth subscription
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        await loadUserData(session?.user || null);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // fallback
    }
    setUser(null);
    setProfile(null);
    setDoctorApp(null);
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserData(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        doctorApp,
        isAdmin,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
