"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
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

  // Supabase client instance ko memoize kar diya taaki re-renders pe naya instance na bane
  const supabase = useMemo(() => createClient(), []);

  const loadProfileData = useCallback(async (currentUser) => {
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
        supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
        supabase.from("administrators").select("user_id").eq("user_id", currentUser.id).maybeSingle(),
        supabase.from("doctor_applications").select("*").eq("user_id", currentUser.id).maybeSingle(),
      ]);

      setProfile(profRes.status === "fulfilled" ? profRes.value?.data ?? null : null);
      setIsAdmin(adminRes.status === "fulfilled" && Boolean(adminRes.value?.data));
      setDoctorApp(docRes.status === "fulfilled" ? docRes.value?.data ?? null : null);
    } catch (err) {
      console.error("Auth fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let isCancelled = false;

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isCancelled) return;
      if (session?.user) {
        loadProfileData(session.user);
      } else {
        setLoading(false);
      }
    });

    // 2. Auth state change listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (isCancelled) return;

      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setDoctorApp(null);
        setIsAdmin(false);
        setLoading(false);
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (session?.user) {
          loadProfileData(session.user);
        }
      }
    });

    return () => {
      isCancelled = true;
      subscription?.unsubscribe();
    };
  }, [loadProfileData, supabase]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    setUser(null);
    setProfile(null);
    setDoctorApp(null);
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfileData(user);
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