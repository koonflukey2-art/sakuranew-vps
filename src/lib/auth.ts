import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type UserRole = "ADMIN" | "STOCK" | "EMPLOYEE";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  organizationId: string | null;
}

async function ensureUserOrganization(userId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });

  if (user?.organizationId) return user.organizationId;

  const slugBase = email.split("@")[0]?.toLowerCase() || "default";
  const slug = `${slugBase}-${Date.now()}`;

  const organization = await prisma.organization.create({
    data: {
      name: `${slugBase}'s Company`,
      slug,
      description: "Default organization",
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: organization.id },
  });

  return organization.id;
}

const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        if (!user.organizationId) {
          await ensureUserOrganization(user.id, user.email);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }: { session: any; user: any }) {
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, organizationId: true },
        });

        session.user.id = user.id;
        session.user.role = dbUser?.role || "EMPLOYEE";
        session.user.organizationId = dbUser?.organizationId ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      organizationId: user.organizationId,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}
