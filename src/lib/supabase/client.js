import { createBrowserClient } from "@supabase/ssr";

/**
 * Returns a Supabase client for client-side components and hooks.
 * Uses public variables; never exposes service role key.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-anon-key";

  return createBrowserClient(supabaseUrl, supabaseKey);
}
