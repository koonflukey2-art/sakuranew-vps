import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/profit-targets - Fetch profit targets
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const productType = searchParams.get("productType");
    const activeOnly = searchParams.get("active") === "true";

    const where: any = { organizationId: orgId };

    if (productType) {
      where.productType = parseInt(productType);
    }

    if (activeOnly) {
      where.isActive = true;
    }

    const targets = await prisma.profitTarget.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(targets);
  } catch (error: any) {
    console.error("GET /api/profit-targets error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch profit targets" },
      { status: 500 }
    );
  }
}

// POST /api/profit-targets - Create profit target (ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ADMIN permission
    const hasPermission = await checkPermission(user.id, "ADMIN");
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Only ADMIN can create profit targets" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { productType, targetMargin, minMargin, alertThreshold, isActive } = body;

    // Validation
    if (!targetMargin || targetMargin < 0 || targetMargin > 100) {
      return NextResponse.json(
        { error: "Target margin must be between 0-100%" },
        { status: 400 }
      );
    }

    if (!minMargin || minMargin < 0 || minMargin > 100) {
      return NextResponse.json(
        { error: "Minimum margin must be between 0-100%" },
        { status: 400 }
      );
    }

    if (!alertThreshold || alertThreshold < 0 || alertThreshold > 100) {
      return NextResponse.json(
        { error: "Alert threshold must be between 0-100%" },
        { status: 400 }
      );
    }

    if (minMargin > targetMargin) {
      return NextResponse.json(
        { error: "Minimum margin cannot be higher than target margin" },
        { status: 400 }
      );
    }

    const target = await prisma.profitTarget.create({
      data: {
        organizationId: orgId,
        productType: productType ? parseInt(productType) : null,
        targetMargin: parseFloat(targetMargin),
        minMargin: parseFloat(minMargin),
        alertThreshold: parseFloat(alertThreshold),
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json(target);
  } catch (error: any) {
    console.error("POST /api/profit-targets error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create profit target" },
      { status: 500 }
    );
  }
}

// PUT /api/profit-targets - Update profit target (ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPermission = await checkPermission(user.id, "ADMIN");
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Only ADMIN can update profit targets" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { id, targetMargin, minMargin, alertThreshold, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: "Target ID required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.profitTarget.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }

    const target = await prisma.profitTarget.update({
      where: { id },
      data: {
        targetMargin: targetMargin !== undefined ? parseFloat(targetMargin) : undefined,
        minMargin: minMargin !== undefined ? parseFloat(minMargin) : undefined,
        alertThreshold: alertThreshold !== undefined ? parseFloat(alertThreshold) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
    });

    return NextResponse.json(target);
  } catch (error: any) {
    console.error("PUT /api/profit-targets error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update profit target" },
      { status: 500 }
    );
  }
}

// DELETE /api/profit-targets - Delete profit target (ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPermission = await checkPermission(user.id, "ADMIN");
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Only ADMIN can delete profit targets" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Target ID required" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.profitTarget.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }

    await prisma.profitTarget.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/profit-targets error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete profit target" },
      { status: 500 }
    );
  }
}
