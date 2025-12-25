import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/contexts/theme-context";
import { AppSessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Shearer (S1) Profit Pilot",
  description: "Profit & Metrics Planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-slate-950">
        <AppSessionProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </AppSessionProvider>
      </body>
    </html>
  );
}
