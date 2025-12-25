import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "sakura_session";

const PUBLIC_ROUTE_PATTERNS: RegExp[] = [
  /^\/sign-in(.*)$/,
  /^\/sign-up(.*)$/,

  // ✅ allow auth endpoints (สำคัญมาก ไม่งั้น form POST จะโดน redirect ก่อนถึง handler)
  /^\/api\/auth(.*)$/,

  // ✅ public: ให้หน้า sign-in เรียก settings ได้โดยไม่โดน redirect
  /^\/api\/system-settings(.*)$/,

  // ✅ allow LINE webhooks
  /^\/api\/webhooks\/line(.*)$/,
  /^\/api\/webhooks\/(.*)$/,
  /^\/api\/line\/webhook(.*)$/,
  /^\/api\/line\/(.*)$/,

  // healthcheck
  /^\/api\/health(.*)$/,

  // static public
  /^\/favicon\.ico$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export default function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Public routes ผ่านได้เลย
  if (isPublicRoute(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value || null;

  // ✅ ถ้าไม่ login
  if (!token) {
    // ✅ ถ้าเป็น API ให้คืน 401 ไม่ redirect (สำคัญมากสำหรับ frontend fetch)
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // page route -> redirect ไปหน้า sign-in ตามเดิม
    const returnBack = pathname + req.nextUrl.search;
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("redirect_url", returnBack);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
