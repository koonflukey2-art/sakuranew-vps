import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function getOrganizationId(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return user.organizationId;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    // Get campaigns
    const campaigns = await prisma.adCampaign.findMany({
      where: {
        organizationId: orgId,
        ...(platform && { platform: platform as any }),
      },
    });

    // Calculate summary
    const summary = {
      totalSpent: campaigns.reduce((sum, c) => sum + c.spent, 0),
      totalRevenue: campaigns.reduce((sum, c) => sum + c.revenue, 0),
      totalProfit: campaigns.reduce((sum, c) => sum + c.profit, 0),
      totalClicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
      totalImpressions: campaigns.reduce((sum, c) => sum + c.impressions, 0),
      totalConversions: campaigns.reduce((sum, c) => sum + c.conversions, 0),
      avgCPC: campaigns.length > 0
        ? campaigns.reduce((sum, c) => sum + c.cpc, 0) / campaigns.length
        : 0,
      avgCTR: campaigns.length > 0
        ? campaigns.reduce((sum, c) => sum + c.ctr, 0) / campaigns.length
        : 0,
      avgROAS: campaigns.length > 0
        ? campaigns.reduce((sum, c) => sum + c.roas, 0) / campaigns.length
        : 0,
    };

    // Generate chart data (last 7 days)
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      chartData.push({
        date: dateStr,
        revenue: Math.floor(Math.random() * 10000),
        spent: Math.floor(Math.random() * 5000),
        profit: Math.floor(Math.random() * 5000),
      });
    }

    return NextResponse.json({
      summary,
      chartData,
    });
  } catch (error) {
    console.error("Failed to fetch metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
