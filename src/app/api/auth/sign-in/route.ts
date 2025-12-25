// src/app/api/auth/sign-in/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "sakura_session";
const SESSION_TTL_DAYS = 30;

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function base64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseRedirectUrlFromReferer(referer: string | null) {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return u.searchParams.get("redirect_url");
  } catch {
    return null;
  }
}

function verifyPassword(stored: string, provided: string) {
  // scrypt$<salt_b64>$<hash_b64>
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = crypto.scryptSync(provided, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  }

  // bcrypt ($2...) if available
  if (stored.startsWith("$2")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bcrypt = require("bcryptjs");
      return bcrypt.compareSync(provided, stored);
    } catch {
      return stored === provided;
    }
  }

  // plaintext fallback
  return stored === provided;
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

    const contentType = req.headers.get("content-type") || "";
    const redirectFromReferer = parseRedirectUrlFromReferer(
      req.headers.get("referer")
    );

    let email = "";
    let password = "";
    let redirectUrl: string | null = null;

    if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const form = await req.formData();
      email = String(form.get("email") || "").trim().toLowerCase();
      password = String(form.get("password") || "");
      redirectUrl = (String(form.get("redirect_url") || "") || null) as
        | string
        | null;
    } else {
      const body = (await req.json().catch(() => null)) as any;
      email = String(body?.email || "").trim().toLowerCase();
      password = String(body?.password || "");
      redirectUrl = (String(body?.redirect_url || "") || null) as
        | string
        | null;
    }

    const finalRedirect = redirectUrl || redirectFromReferer || "/";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing email or password" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (!user || !user.password) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!verifyPassword(user.password, password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = base64url(crypto.randomBytes(32));
    const tokenHash = sha256(token);
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await sessionDelegate.create({
      data: {
        userId: user.id,
        sessionTokenHash: tokenHash,
        expiresAt,
      },
    });

    const base = process.env.APP_URL ?? new URL(req.url).origin;
    const res = NextResponse.redirect(new URL(finalRedirect, base));
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });

    return res;
  } catch (error) {
    console.error("sign-in error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
