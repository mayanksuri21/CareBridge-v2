import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns a Supabase client for Server Components, Route Handlers, and Server Actions.
 * Works synchronously so existing calls like `const supabase = createClientServer()` work without breaking.
 */
export function createClientServer() {
  const cookieStore = cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        // Next.js versions compatibility check
        if (typeof cookieStore.getAll === "function") {
          return cookieStore.getAll();
        }
        // Fallback if cookies() returned a Promise in Next 15+
        if (cookieStore && typeof cookieStore.then === "function") {
          return [];
        }
        return [];
      },
      setAll(cookiesToSet) {
        try {
          if (typeof cookieStore.set === "function") {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          }
        } catch {
          // Ignore in Server Component context
        }
      },
    },
  });
}