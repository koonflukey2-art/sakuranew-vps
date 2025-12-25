import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json([], { status: 200 });
    }

    const promotions = await prisma.promotion.findMany({
      where: { organizationId: orgId },
      include: {
        product: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(promotions);
  } catch (error) {
    console.error("Failed to fetch promotions:", error);
    return NextResponse.json(
      { error: "Failed to fetch" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();

    const promotion = await prisma.promotion.create({
      data: {
        organizationId: orgId,
        productId: body.productId,
        name: body.name,
        description: body.description,
        buyQuantity: parseInt(body.buyQuantity, 10),
        freeQuantity: parseInt(body.freeQuantity, 10),
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(promotion);
  } catch (error) {
    console.error("Failed to create promotion:", error);
    return NextResponse.json(
      { error: "Failed to create" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const promotion = await prisma.promotion.update({
      where: { id: body.id },
      data: {
        name: body.name,
        description: body.description,
        buyQuantity: parseInt(body.buyQuantity, 10),
        freeQuantity: parseInt(body.freeQuantity, 10),
        isActive: body.isActive,
      },
    });

    return NextResponse.json(promotion);
  } catch (error) {
    console.error("Failed to update promotion:", error);
    return NextResponse.json(
      { error: "Failed to update" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await prisma.promotion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete promotion:", error);
    return NextResponse.json(
      { error: "Failed to delete" },
      { status: 500 }
    );
  }
}
