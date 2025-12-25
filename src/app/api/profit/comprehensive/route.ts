import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { calculateComprehensiveProfit } from "@/lib/profit-calculator";

export const runtime = "nodejs";

/**
 * GET /api/profit/comprehensive
 * Calculate comprehensive profit including ads spend from receipts
 *
 * Query params:
 * - startDate: ISO date string (optional, defaults to today 00:00)
 * - endDate: ISO date string (optional, defaults to today 23:59)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : undefined;

    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : undefined;

    const profitData = await calculateComprehensiveProfit(
      orgId,
      startDate,
      endDate
    );

    return NextResponse.json(profitData);
  } catch (error: any) {
    console.error("Failed to calculate comprehensive profit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate profit" },
      { status: 500 }
    );
  }
}
