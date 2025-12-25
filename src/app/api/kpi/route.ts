import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

export const runtime = "nodejs";

// GET /api/kpi - Fetch KPIs
export async function GET(request: NextRequest) {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "daily";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = parseInt(searchParams.get("limit") || "30");

    const where: any = {
      organizationId: orgId,
      period,
    };

    if (from && to) {
      where.date = {
        gte: new Date(from),
        lte: new Date(to),
      };
    }

    const kpis = await prisma.kPI.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
    });

    return NextResponse.json(kpis);
  } catch (error: any) {
    console.error("GET /api/kpi error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch KPIs" },
      { status: 500 }
    );
  }
}

// POST /api/kpi - Calculate and create daily KPI
export async function POST(request: NextRequest) {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { period = "daily", date } = body;

    // Determine date range for calculation
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch orders for the period
    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        orderDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Fetch products for cost calculation
    const products = await prisma.product.findMany({
      where: { organizationId: orgId },
    });

    // Calculate metrics
    let totalRevenue = 0;
    let totalCost = 0;
    let productsSold = 0;

    orders.forEach((order) => {
      totalRevenue += order.amount;
      productsSold += order.quantity;

      // Find product cost
      const product = products.find((p) => p.productType === order.productType);
      if (product) {
        totalCost += product.costPrice * order.quantity;
      }
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Calculate cost efficiency (profit per cost)
    const costEfficiency = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    // Calculate stock turnover (simplified)
    const totalStockValue = products.reduce(
      (acc, p) => acc + p.costPrice * p.quantity,
      0
    );
    const stockTurnover = totalStockValue > 0 ? totalCost / totalStockValue : 0;

    // Check if KPI already exists for this date/period
    const existing = await prisma.kPI.findFirst({
      where: {
        organizationId: orgId,
        period,
        date: startOfDay,
      },
    });

    let kpi;
    if (existing) {
      // Update existing KPI
      kpi = await prisma.kPI.update({
        where: { id: existing.id },
        data: {
          totalRevenue,
          totalCost,
          totalProfit,
          profitMargin,
          productsSold,
          avgOrderValue,
          stockTurnover,
          costEfficiency,
        },
      });
    } else {
      // Create new KPI
      kpi = await prisma.kPI.create({
        data: {
          organizationId: orgId,
          period,
          date: startOfDay,
          totalRevenue,
          totalCost,
          totalProfit,
          profitMargin,
          productsSold,
          avgOrderValue,
          stockTurnover,
          costEfficiency,
        },
      });
    }

    return NextResponse.json(kpi);
  } catch (error: any) {
    console.error("POST /api/kpi error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create KPI" },
      { status: 500 }
    );
  }
}
