"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/hooks/use-toast";

export function WelcomeMessage() {
  const { data: session, status } = useSession();
  const { toast } = useToast();

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const hasShownWelcome = sessionStorage.getItem("hasShownWelcome");

      if (!hasShownWelcome) {
        setTimeout(() => {
          toast({
            title: "🎉 ยินดีต้อนรับเข้าสู่ระบบ",
            description: `สวัสดี ${session.user.name || ""}! ยินดีต้อนรับกลับมา`,
            className:
              "bg-gradient-to-br from-gray-900 to-black border-green-500/50 text-white shadow-xl",
            duration: 4000,
          });

          sessionStorage.setItem("hasShownWelcome", "true");
        }, 500);
      }
    }
  }, [session, status, toast]);

  return null;
}
