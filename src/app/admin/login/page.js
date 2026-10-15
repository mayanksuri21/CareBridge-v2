"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Card";
import { ShieldAlert, HeartPulse, Mail, Lock, AlertCircle, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Enforce strict server-side table check for administrator privilege
        const { data: adminRecord, error: adminErr } = await supabase
          .from("administrators")
          .select("user_id")
          .eq("user_id", data.user.id)
          .single();

        if (adminRecord && !adminErr) {
          router.push("/admin/dashboard");
        } else {
          // If authenticated but not in administrators table, revoke and reject
          await supabase.auth.signOut();
          setErrorMsg("Access Denied: This account does not possess administrator privileges.");
        }
      }
    } catch (err) {
      setErrorMsg(err.message || "Admin authorization failure.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 group mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-emerald to-emerald-500 flex items-center justify-center text-white shadow-md">
            <HeartPulse className="w-5 h-5" />
          </div>
          <span className="text-2xl font-black tracking-tight text-white">
            Care<span className="text-brand-emerald">Bridge</span>
          </span>
        </Link>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-950/60 text-rose-300 border border-rose-800">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            Restricted System Access
          </span>
        </div>
        <h2 className="mt-3 text-2xl font-black text-white">
          Medical Administrator Portal
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Authorized personnel only. Public account registration is disabled.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-800/90 py-8 px-6 shadow-2xl rounded-3xl border border-slate-700 sm:px-10 space-y-6">
          {errorMsg && (
            <div className="rounded-xl bg-rose-900/40 border border-rose-700 p-4 flex items-start gap-3 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/60 text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-emerald" />
              Role Security Notice
            </div>
            <p>
              Administrative privileges are enforced via server-side database validation against the protected <code className="text-emerald-400">administrators</code> table.
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="admin@carebridge.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald text-white placeholder-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald text-white placeholder-slate-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              className="w-full mt-2 font-bold shadow-md bg-emerald-600 hover:bg-emerald-500 text-white border-0"
            >
              {loading ? "Authenticating..." : "Sign In to Admin Portal"}
            </Button>
          </form>

          <div className="text-center pt-2 border-t border-slate-700/60 text-xs text-slate-400">
            <Link href="/" className="hover:text-emerald-400 transition-colors">
              ← Return to Public Homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
