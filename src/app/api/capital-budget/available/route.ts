import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/organization";

/**
 * GET /api/capital-budget/available
 * Returns available budget information
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();

    // Get all capital budgets for the organization
    const budgets = await prisma.capitalBudget.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });

    // Calculate totals
    const totalAmount = budgets.reduce((sum, b) => sum + b.amount, 0);
    const available = budgets.reduce((sum, b) => sum + b.remaining, 0);
    const used = totalAmount - available;

    // Get the most recent budget for threshold info
    const latestBudget = budgets[0] || null;

    return NextResponse.json({
      totalAmount,
      available,
      used,
      budgetCount: budgets.length,
      minThreshold: latestBudget?.minThreshold || 5000,
      isLow: available <= (latestBudget?.minThreshold || 5000),
    });
  } catch (error) {
    console.error("Failed to get available budget:", error);
    return NextResponse.json(
      { error: "Failed to get budget" },
      { status: 500 }
    );
  }
}
