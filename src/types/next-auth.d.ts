import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "STOCK" | "EMPLOYEE";
      organizationId: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

