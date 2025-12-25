// src/lib/auth.ts
import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE_NAME = "sakura_session";
export const SESSION_TTL_DAYS = 30;

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

type SessionDelegateMeta = {
  delegate: any;
  hasRevokedAt: boolean;
  modelName?: string;
};

function getSessionDelegateMeta(): SessionDelegateMeta | null {
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
    const hasRevokedAt = fields.some((f: any) => f?.name === "revokedAt");

    if (hasToken && hasExpires && hasUserId && m?.name) {
      const delegateName = m.name.charAt(0).toLowerCase() + m.name.slice(1);
      const delegate = p[delegateName];
      if (delegate?.create && delegate?.findFirst && delegate?.updateMany) {
        return { delegate, hasRevokedAt, modelName: m.name };
      }
    }
  }

  const fallback =
    p.session ?? p.sessions ?? p.userSession ?? p.userSessions ?? null;

  if (fallback?.create && fallback?.findFirst && fallback?.updateMany) {
    // ไม่รู้ meta ของ revokedAt ใน fallback → assume มี revokedAt ได้/ไม่ได้ก็ได้
    return { delegate: fallback, hasRevokedAt: true };
  }

  return null;
}

async function getCookieStore() {
  // Next 15: cookies() => Promise<ReadonlyRequestCookies>
  // Next 14: cookies() => ReadonlyRequestCookies (await ก็ยังใช้ได้)
  return await cookies();
}

export type AuthSession = {
  userId: string;
  expiresAt: Date;
};

export async function readSessionToken(): Promise<string | null> {
  const store = await getCookieStore();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function createSession(userId: string) {
  const meta = getSessionDelegateMeta();
  if (!meta) {
    throw new Error("Session model not found in Prisma Client.");
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await meta.delegate.create({
    data: {
      userId,
      sessionTokenHash: tokenHash,
      expiresAt,
    },
  });

  return { token, tokenHash, expiresAt };
}

export async function revokeSessionByToken(token: string) {
  const meta = getSessionDelegateMeta();
  if (!meta) return;

  const tokenHash = sha256(token);

  const where: any = { sessionTokenHash: tokenHash };
  if (meta.hasRevokedAt) where.revokedAt = null;

  await meta.delegate.updateMany({
    where,
    data: meta.hasRevokedAt ? { revokedAt: new Date() } : {},
  });
}

export async function getSession(): Promise<AuthSession | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const meta = getSessionDelegateMeta();
  if (!meta) return null;

  const tokenHash = sha256(token);

  const where: any = {
    sessionTokenHash: tokenHash,
    expiresAt: { gt: new Date() },
  };
  if (meta.hasRevokedAt) where.revokedAt = null;

  const s = await meta.delegate.findFirst({
    where,
    select: { userId: true, expiresAt: true },
  });

  if (!s?.userId) return null;
  return { userId: String(s.userId), expiresAt: new Date(s.expiresAt) };
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  return user ?? null;
}

// ใช้กับ NextResponse.cookies.set({...})
export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}
