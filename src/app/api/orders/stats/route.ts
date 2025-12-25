import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { calculateTotalProfit } from "@/lib/profit-calculator";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * ทำ window ของ "วันไทย" (UTC+7) แต่คืนค่าเป็นเวลา UTC สำหรับ query DB
 */
function bkkDayStartUtc(base = new Date()) {
  const utcMs = base.getTime() + base.getTimezoneOffset() * 60000;
  const bkk = new Date(utcMs + 7 * 3600 * 1000);
  bkk.setHours(0, 0, 0, 0);
  return new Date(bkk.getTime() - 7 * 3600 * 1000);
}

function formatBkkLabel(dayStartUtc: Date) {
  const bkk = new Date(dayStartUtc.getTime() + 7 * 3600 * 1000);
  return bkk.toLocaleDateString("th-TH", { day: "2-digit", month: "short" });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({
        today: { revenue: 0, orders: 0, profit: 0, expense: 0, byType: {} },
        week: {
          revenue: 0,
          orders: 0,
          profit: 0,
          expense: 0,
          byType: {},
          daily: [],
        },
        budget: { total: 0, used: 0, remaining: 0 },
      });
    }

    // ✅ ใช้วันไทย (UTC+7)
    const todayStartUtc = bkkDayStartUtc(new Date());
    const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 3600 * 1000);

    // รวม 7 วัน (รวมวันนี้) -> ย้อนหลัง 6 วันจากวันนี้
    const weekStartUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 3600 * 1000);

    // ดึงชื่อประเภทจาก DB (แม่นกว่า getProductTypeName)
    const typeRows = await prisma.productType.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { typeNumber: true, typeName: true },
      orderBy: { typeNumber: "asc" },
    });

    const typeMap = new Map<number, string>();
    for (const t of typeRows) {
      typeMap.set(t.typeNumber, t.typeName || `ประเภท ${t.typeNumber}`);
    }

    const resolveTypeName = (n: number | null | undefined) => {
      if (!n) return "ไม่ระบุ";
      return typeMap.get(n) || `ประเภท ${n}`;
    };

    // Today orders
    const todayOrders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        status: "COMPLETED", // ✅ ถ้าไม่อยากกรอง status ให้ลบบรรทัดนี้ออก
        orderDate: {
          gte: todayStartUtc,
          lt: tomorrowStartUtc,
        },
      },
      select: {
        productType: true,
        quantity: true,
        amount: true,
        orderDate: true,
      },
    });

    // Last 7 days orders
    const weekOrders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        status: "COMPLETED", // ✅ ถ้าไม่อยากกรอง status ให้ลบบรรทัดนี้ออก
        orderDate: {
          gte: weekStartUtc,
          lt: tomorrowStartUtc,
        },
      },
      select: {
        productType: true,
        quantity: true,
        amount: true,
        orderDate: true,
      },
    });

    // ✅ Profit/expense ใช้ calculateTotalProfit (รองรับโปรโมชั่นตามที่คุณแก้ไว้)
    const calculateStats = async (
      orders: Array<{ productType: number | null; quantity: number; amount: number }>
    ) => {
      const profitCalc = await calculateTotalProfit(
        orders.map((o) => ({
          productType: o.productType ?? null,
          quantity: o.quantity,
          amount: o.amount,
        })),
        orgId
      );

      return {
        revenue: profitCalc.revenue,
        expense: profitCalc.cost,
        profit: profitCalc.profit,
        margin: profitCalc.margin,
        orders: orders.length,
      };
    };

    const todayStats = await calculateStats(todayOrders);
    const weekStats = await calculateStats(weekOrders);

    // Daily breakdown chart (7 วัน)
    const dailyStats: Array<{ date: string; revenue: number; expense: number; profit: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const dayStartUtc = new Date(todayStartUtc.getTime() - i * 24 * 3600 * 1000);
      const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 3600 * 1000);

      const dayOrders = weekOrders.filter(
        (o) => o.orderDate >= dayStartUtc && o.orderDate < dayEndUtc
      );

      const dayStats = await calculateStats(dayOrders);

      dailyStats.push({
        date: formatBkkLabel(dayStartUtc),
        revenue: dayStats.revenue,
        expense: dayStats.expense,
        profit: dayStats.profit,
      });
    }

    // Group by product type (วันนี้/สัปดาห์)
    const todayByType: Record<string, { count: number; revenue: number }> = {};
    const weekByType: Record<string, { count: number; revenue: number }> = {};

    for (const order of todayOrders) {
      const typeName = resolveTypeName(order.productType);
      if (!todayByType[typeName]) todayByType[typeName] = { count: 0, revenue: 0 };
      todayByType[typeName].count += order.quantity;
      todayByType[typeName].revenue += order.amount;
    }

    for (const order of weekOrders) {
      const typeName = resolveTypeName(order.productType);
      if (!weekByType[typeName]) weekByType[typeName] = { count: 0, revenue: 0 };
      weekByType[typeName].count += order.quantity;
      weekByType[typeName].revenue += order.amount;
    }

    const budget = await prisma.capitalBudget.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      today: {
        revenue: todayStats.revenue,
        orders: todayStats.orders,
        profit: todayStats.profit,
        expense: todayStats.expense,
        margin: todayStats.margin,
        byType: todayByType,
      },
      week: {
        revenue: weekStats.revenue,
        orders: weekStats.orders,
        profit: weekStats.profit,
        expense: weekStats.expense,
        margin: weekStats.margin,
        byType: weekByType,
        daily: dailyStats,
      },
      budget: {
        total: budget?.amount || 0,
        used: budget ? budget.amount - budget.remaining : 0,
        remaining: budget?.remaining || 0,
      },
    });
  } catch (error: any) {
    console.error("GET /api/orders/stats error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
