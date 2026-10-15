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
        // Ensure public.profiles row exists with OAuth metadata (if trigger was skipped)
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", user.id)
          .maybeSingle();

        const meta = user.user_metadata || {};
        const metaName =
          meta.full_name ||
          meta.name ||
          (meta.given_name ? `${meta.given_name} ${meta.family_name || ""}`.trim() : "") ||
          (user.email ? user.email.split("@")[0] : "");

        if (!existingProfile) {
          await supabase.from("profiles").insert({
            id: user.id,
            full_name: metaName || "Patient",
            email: user.email || "",
            role: "patient",
          });
        } else if (!existingProfile.full_name || existingProfile.full_name === "Patient") {
          // If profile exists but has an empty or placeholder name, seed from OAuth
          // without overwriting existing patient-entered names.
          if (metaName && metaName !== "Patient") {
            await supabase
              .from("profiles")
              .update({ full_name: metaName })
              .eq("id", user.id);
          }
        }

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
