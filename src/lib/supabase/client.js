import { createBrowserClient } from "@supabase/ssr";

let client = null;

/**
 * Returns a Supabase client for client-side components and hooks.
 * Uses a browser singleton so all components, contexts, and listeners
 * share the exact same session state and event emitter.
 * Uses public variables; never exposes service role key.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-anon-key";

  if (typeof window === "undefined") {
    return createBrowserClient(supabaseUrl, supabaseKey);
  }

  if (!client) {
    client = createBrowserClient(supabaseUrl, supabaseKey);
  }

  return client;
}
