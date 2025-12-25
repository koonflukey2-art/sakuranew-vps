"use client";

import { useEffect } from "react";
import { useUser } from "@/lib/auth/compat-client";
import { useToast } from "@/hooks/use-toast";

export function WelcomeMessage() {
  const { user, isLoaded } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoaded && user) {
      const hasShownWelcome = sessionStorage.getItem("hasShownWelcome");

      if (!hasShownWelcome) {
        // Wait a bit for page to load
        setTimeout(() => {
          toast({
            title: "🎉 ยินดีต้อนรับเข้าสู่ระบบ",
            description: `สวัสดี ${user.firstName || user.fullName || ""}! ยินดีต้อนรับกลับมา`,
            className: "bg-gradient-to-br from-gray-900 to-black border-green-500/50 text-white shadow-xl",
            duration: 4000,
          });

          sessionStorage.setItem("hasShownWelcome", "true");
        }, 500);
      }
    }
  }, [isLoaded, user, toast]);

  return null;
}
