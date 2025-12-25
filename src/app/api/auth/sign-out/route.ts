// src/app/api/auth/sign-out/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "sakura_session";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ✅ เวอร์ชันแก้จริง (แทนทั้งก้อน)
function getSessionDelegate() {
  const p: any = prisma as any;

  const dm = p._runtimeDataModel?.models ?? p._dmmf?.datamodel?.models ?? null;

  const models: any[] = Array.isArray(dm)
    ? dm
    : dm && typeof dm === "object"
      ? Object.values(dm)
      : [];

  for (const m of models) {
    const fields = m?.fields || [];
    const hasToken = fields.some((f: any) => f?.name === "sessionTokenHash");
    const hasExpires = fields.some((f: any) => f?.name === "expiresAt");
    const hasUserId = fields.some((f: any) => f?.name === "userId");

    if (hasToken && hasExpires && hasUserId && m?.name) {
      const delegateName = m.name.charAt(0).toLowerCase() + m.name.slice(1);
      const delegate = p[delegateName];
      if (delegate?.create && delegate?.findFirst && delegate?.updateMany) {
        return delegate;
      }
    }
  }

  return p.session ?? p.sessions ?? p.userSession ?? p.userSessions ?? null;
}

export async function POST(req: Request) {
  try {
    const sessionDelegate = getSessionDelegate();
    if (!sessionDelegate) {
      console.error(
        "Session model not found in Prisma Client. Check schema model name (session vs sessions)."
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const cookieHeader = req.headers.get("cookie") || "";
    const m = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    const token = m?.[1] ? decodeURIComponent(m[1]) : null;

    if (token) {
      const tokenHash = sha256(token);
      await sessionDelegate.updateMany({
        where: { sessionTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });

    return res;
  } catch (error) {
    console.error("sign-out error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
