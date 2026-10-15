import { NextResponse } from "next/server";
import { updateSession } from "./src/lib/supabase/middleware";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Let public routes, static assets, and auth pages pass through directly
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/" ||
    pathname.startsWith("/patient/login") ||
    pathname.startsWith("/patient/signup") ||
    pathname.startsWith("/doctor/login") ||
    pathname.startsWith("/doctor/apply") ||
    pathname.startsWith("/doctor/application-status") ||
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/auth")
  ) {
    const { response } = await updateSession(request);
    return response;
  }

  // Refresh session cookies for SSR
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
