import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const publicRoutes = [
  "/login",
  "/register",
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/register",
  "/api/system-settings",
  "/api/webhooks/line",
  "/api/webhooks",
  "/api/line/webhook",
  "/api/line",
  "/api/health",
];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isPublic = publicRoutes.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublic) return NextResponse.next();

  if (!req.auth?.user) {
    const signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("redirect_url", pathname + search);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
