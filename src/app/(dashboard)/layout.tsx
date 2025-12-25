"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { NotificationBell } from "@/components/notification-bell";
import { FloatingAssistant } from "@/components/FloatingAssistant";
import { AccountMenu } from "@/components/account-menu";
import { WelcomeMessage } from "@/components/welcome-message";
import { ThemeProvider } from "@/contexts/theme-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check alerts every 5 minutes
  useEffect(() => {
    const checkAlerts = async () => {
      await fetch("/api/notifications/check-alerts", { method: "POST" });
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ThemeProvider>
        <div className="flex min-h-screen bg-gradient-dark text-white light:bg-white light:text-black overflow-hidden">
        <WelcomeMessage />

        {/* Sidebar */}
        <Sidebar />

        {/* Main area - adjust margin based on sidebar */}
        <div className="flex-1 flex flex-col min-w-0 lg:ml-64 transition-all">
          <header className="px-4 py-4 md:px-8 md:py-6 border-b border-white/5 bg-black/20 backdrop-blur light:bg-white/80 light:border-black/10 lg:pl-8 pl-16">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <span className="text-2xl">🌸</span>
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                    Sakura Biotech
                  </h2>
                  <p className="text-xs text-gray-400 hidden sm:block light:text-gray-600">
                    Co. Ltd
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <AccountMenu />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-gradient-dark light:bg-gradient-to-br light:from-gray-50 light:to-gray-100">
            <div className="p-4 md:p-8 space-y-4">{children}</div>
          </main>
        </div>

        <FloatingAssistant />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
