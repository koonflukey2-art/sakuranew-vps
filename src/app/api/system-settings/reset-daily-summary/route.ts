// src/app/api/system-settings/reset-daily-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

export const runtime = "nodejs";

// เปิด/ปิด feature นี้ด้วย env เพื่อความปลอดภัย (แนะนำ)
const ENABLE_TEST_RESET = process.env.ENABLE_TEST_RESET === "true";

// ใช้สำหรับ mask token ใน response (ไม่ให้ frontend เห็นเต็ม ๆ)
function maskToken(token: string | null | undefined): string | null {
  if (!token || token.length < 10) return null;
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

export async function POST(_request: NextRequest) {
  try {
    if (!ENABLE_TEST_RESET) {
      // ถ้าไม่เปิดไว้ ให้เหมือน route ไม่มี (กันหลุด production)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ตรวจ role แอดมิน
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      select: { role: true },
    });

    if (!dbUser || dbUser.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only ADMIN can reset daily summary" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // รีเซ็ตสถานะ “ส่งแล้ววันนี้” เพื่อให้ cron ส่งได้ใหม่
    const settings = await prisma.systemSettings.upsert({
      where: { organizationId: orgId },
      update: { dailySummaryLastSentAt: null },
      create: {
        organizationId: orgId,
        dailyCutOffHour: 23,
        dailyCutOffMinute: 59,
        notifyOnOrder: true,
        notifyOnLowStock: true,
        notifyDailySummary: true,
        dailySummaryLastSentAt: null,
      },
    });

    const safeSettings = {
      ...settings,
      lineNotifyToken: maskToken(settings.lineNotifyToken),
      lineChannelAccessToken: maskToken(settings.lineChannelAccessToken),
      lineChannelSecret: maskToken(settings.lineChannelSecret),
      dailySummaryLastSentAt: settings.dailySummaryLastSentAt,
    };

    // ✅ คืนค่าแบบ JSON ปกติ
    return NextResponse.json(safeSettings);
  } catch (error: any) {
    console.error("POST reset-daily-summary error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset daily summary" },
      { status: 500 }
    );
  }
}
