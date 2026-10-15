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
      // 1. Fetch user profile
      const { data: profData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();
      setProfile(profData || null);

      // 2. Check if admin
      const { data: adminData } = await supabase
        .from("administrators")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      setIsAdmin(!!adminData);

      // 3. Check doctor application
      const { data: docData } = await supabase
        .from("doctor_applications")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      setDoctorApp(docData || null);
    } catch {
      // Supabase connection or table not set up yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (mounted) {
          await loadUserData(session?.user || null);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
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
