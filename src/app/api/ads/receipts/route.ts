import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true },
    });

    if (!dbUser?.organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = dbUser.organizationId;

    const receipts = await prisma.adReceipt.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        receiptNumber: true,
        platform: true,
        amount: true,
        paidAt: true,
        receiptUrl: true,
        qrCodeData: true,
        isProcessed: true,
        campaign: { select: { campaignName: true } },
      },
    });

    const agg = await prisma.adReceipt.aggregate({
      where: { organizationId: orgId },
      _sum: { amount: true },
    });

    const totalAmount = Number(agg._sum.amount ?? 0);
    const totalProfit = 0;

    return NextResponse.json(
      { receipts, totalAmount, totalProfit },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[RECEIPTS][GET] error:", e?.message || e, e?.stack);
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true },
    });

    if (!dbUser?.organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const orgId = dbUser.organizationId;

    // Get ID from query string
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Delete receipt (ensure it belongs to user's organization)
    await prisma.adReceipt.delete({
      where: {
        id,
        organizationId: orgId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[RECEIPTS][DELETE] error:", error);

    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Receipt not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error?.message || "Failed to delete receipt" },
      { status: 500 }
    );
  }
}
