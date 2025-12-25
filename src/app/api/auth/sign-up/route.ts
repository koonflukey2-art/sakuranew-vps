// src/app/api/auth/sign-up/route.ts
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

function hashPasswordScrypt(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
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

    let name: string | null = null;
    let email = "";
    let password = "";
    let redirectUrl: string | null = null;

    if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const form = await req.formData();
      name = String(form.get("name") || "") || null;
      email = String(form.get("email") || "").trim().toLowerCase();
      password = String(form.get("password") || "");
      redirectUrl = (String(form.get("redirect_url") || "") || null) as
        | string
        | null;
    } else {
      const body = (await req.json().catch(() => null)) as any;
      name = String(body?.name || "") || null;
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

    const exists = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    const created = await prisma.user.create({
      data: {
        email,
        name,
        password: hashPasswordScrypt(password),
      },
      select: { id: true },
    });

    // phase transition: keep clerkId usable as “subject”
    await prisma.user.update({
      where: { id: created.id },
      data: { clerkId: created.id },
      select: { id: true },
    });

    const token = base64url(crypto.randomBytes(32));
    const tokenHash = sha256(token);
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await sessionDelegate.create({
      data: {
        userId: created.id,
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
    console.error("sign-up error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
