"use client";

import { useEffect, useMemo, useState } from "react";

type CompatUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  imageUrl?: string | null;
};

type UseUserResult = {
  user: CompatUser | null;
  isLoaded: boolean;
};

function splitName(fullName: string | null | undefined) {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function useUser(): UseUserResult {
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<CompatUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setUser(null);
            setIsLoaded(true);
          }
          return;
        }

        const data = await res.json();
        // /api/me expected shape: { id, clerkId, email, name, role }
        const name: string | null = data?.name ?? null;
        const email: string | null = data?.email ?? null;

        const { firstName, lastName } = splitName(name);

        const compat: CompatUser = {
          id: String(data?.clerkId ?? data?.id ?? ""),
          fullName: name,
          firstName,
          lastName,
          primaryEmailAddress: email ? { emailAddress: email } : null,
          imageUrl: null,
        };

        if (!cancelled) {
          setUser(compat.id ? compat : null);
          setIsLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsLoaded(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ user, isLoaded }), [user, isLoaded]);
}

export function useClerk(): { signOut: () => Promise<void> } {
  return {
    signOut: async () => {
      try {
        await fetch("/api/auth/sign-out", { method: "POST" });
      } catch {
        // ignore
      } finally {
        window.location.href = "/sign-in";
      }
    },
  };
}
