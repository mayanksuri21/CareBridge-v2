import { NextResponse } from "next/server";
import { createClientServer } from "../../../lib/supabase/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    const supabase = createClientServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Fetch user profile to determine trusted redirection target
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Query database for admin or doctor application status
        const { data: adminRecord } = await supabase
          .from("administrators")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (adminRecord) {
          return NextResponse.redirect(`${origin}/admin/dashboard`);
        }

        const { data: doctorApp } = await supabase
          .from("doctor_applications")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (doctorApp) {
          if (doctorApp.status === "approved") {
            return NextResponse.redirect(`${origin}/doctor/dashboard`);
          } else {
            return NextResponse.redirect(`${origin}/doctor/application-status`);
          }
        }

        // Default authenticated user route is patient dashboard
        return NextResponse.redirect(`${origin}/patient/dashboard`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login with error parameter if code exchange fails
  return NextResponse.redirect(`${origin}/patient/login?error=oauth_failed`);
}
