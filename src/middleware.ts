// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",

  // ✅ public: ให้หน้า sign-in เรียก settings ได้โดยไม่โดน redirect ไป Clerk
  "/api/system-settings(.*)",

  // ✅ allow LINE webhooks
  "/api/webhooks/line(.*)",
  "/api/webhooks/(.*)",

  "/api/line/webhook(.*)",
  "/api/line/(.*)",

  "/api/health(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Public routes ผ่านได้เลย
  if (isPublicRoute(req)) return NextResponse.next();

  const a = await auth();

  if (!a.userId) {
    const returnBack = req.nextUrl.pathname + req.nextUrl.search;

    // ใช้ของ Clerk ถ้ามี
    if ("redirectToSignIn" in a && typeof a.redirectToSignIn === "function") {
      return a.redirectToSignIn({ returnBackUrl: returnBack });
    }

    // fallback ของเรา (ใช้ returnBack แบบ relative ไม่เอา req.url)
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("redirect_url", returnBack);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
