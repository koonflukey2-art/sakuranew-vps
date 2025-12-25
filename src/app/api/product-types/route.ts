import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { getCurrentUser } from "@/lib/auth";

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

    const types = await prisma.productType.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { typeNumber: "asc" },
    });

    return NextResponse.json(types);
  } catch (error) {
    console.error("Failed to fetch product types:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
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

    const { typeNumber, typeName } = await request.json();

    const type = await prisma.productType.create({
      data: {
        organizationId: orgId,
        typeNumber: parseInt(typeNumber, 10),
        typeName,
      },
    });

    return NextResponse.json(type);
  } catch (error) {
    console.error("Failed to create product type:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, typeName } = await request.json();

    const type = await prisma.productType.update({
      where: { id },
      data: { typeName },
    });

    return NextResponse.json(type);
  } catch (error) {
    console.error("Failed to update product type:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
