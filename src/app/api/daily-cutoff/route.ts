import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { createDailySummaryForOrg } from "@/lib/dailyCutoff";
import {
  getLineSettings,
  pushLineMessage,
  sendLineNotify,
  formatDailySummary,
} from "@/lib/line-integration";

export const runtime = "nodejs";

function toThaiDateLabelBangkok(d: Date) {
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const bkk = new Date(utcMs + 7 * 3600 * 1000);

  const dd = String(bkk.getDate()).padStart(2, "0");
  const mm = String(bkk.getMonth() + 1).padStart(2, "0");
  const yyyy = bkk.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// 🔹 GET: ใช้โหลด summary ในหน้า /daily-summary
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const organizationId = await getOrganizationId();
    if (!organizationId) return new NextResponse("No organization", { status: 400 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const daysParam = searchParams.get("days");

    const where: any = { organizationId };

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);

      const startOfFrom = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
      const endOfTo = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());

      where.date = { gte: startOfFrom, lte: endOfTo };
    } else if (daysParam) {
      const days = Number(daysParam) || 7;
      const end = new Date();
      end.setHours(0, 0, 0, 0);

      const start = new Date(end);
      start.setDate(start.getDate() - (days - 1));

      where.date = { gte: start, lte: end };
    }

    const summaries = await prisma.dailySummary.findMany({
      where,
      orderBy: { date: "desc" },
    });

    const result = summaries.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      organizationId: s.organizationId,
      totalRevenue: s.totalRevenue,
      totalCost: s.totalCost,
      totalProfit: s.totalProfit,
      totalOrders: s.totalOrders,
      productsSold: (s.productsSold ?? []) as any,
      cutOffTime: s.cutOffTime ? s.cutOffTime.toISOString() : null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/daily-cutoff error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// 🔹 POST: ปุ่ม "ตัดยอดทันที" ในหน้าเว็บ
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    const organizationId = await getOrganizationId();
    if (!organizationId) return new NextResponse("No organization", { status: 400 });

    let targetDate: Date | undefined;
    try {
      const body = await req.json().catch(() => null);
      if (body?.date) targetDate = new Date(body.date);
    } catch {}

    const { summary, created } = await createDailySummaryForOrg(organizationId, targetDate);

    // ✅ ส่ง LINE ทันทีหลังตัดยอด
    const lineSettings = await getLineSettings(organizationId);

    const summaryDate = (summary?.date ? new Date(summary.date) : targetDate) ?? new Date();
    const dateLabel = toThaiDateLabelBangkok(summaryDate);

    const totalRevenue = Number(summary?.totalRevenue ?? 0);
    const totalCost = Number(summary?.totalCost ?? 0);
    const totalProfit = Number(summary?.totalProfit ?? (totalRevenue - totalCost));
    const orderCount = Number(summary?.totalOrders ?? 0);
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const message = formatDailySummary({
      dateLabel,
      orderCount,
      totalRevenue,
      totalCost,
      totalProfit,
      margin,
    });

    let sent = false;
    let via: "push" | "notify" | "none" = "none";

    // push (Messaging API) ก่อน
    if (lineSettings?.lineChannelAccessToken && (lineSettings as any)?.lineTargetId) {
      sent = await pushLineMessage(
        (lineSettings as any).lineTargetId,
        lineSettings.lineChannelAccessToken,
        message
      );
      via = "push";
    }

    // fallback notify
    if (!sent && lineSettings?.lineNotifyToken) {
      sent = await sendLineNotify(lineSettings.lineNotifyToken, message);
      if (sent) via = "notify";
    }

    console.log("✅ daily-cutoff send summary:", { sent, via, organizationId });

    return NextResponse.json(
      {
        ok: true,
        created,
        summary,
        line: { sent, via },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/daily-cutoff error:", err);
    return NextResponse.json(
      { error: "Failed to create daily summary" },
      { status: 500 }
    );
  }
}
