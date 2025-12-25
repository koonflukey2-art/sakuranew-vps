import { NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // ถ้าโปรเจกต์คุณใช้ "@/lib/prisma" ก็เปลี่ยนเป็นอันนั้นได้
import { getCurrentUser } from "@/lib/auth";

// GET /api/budgets
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user || !user.organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const budgets = await prisma.budget.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(budgets);
  } catch (error) {
    console.error("Failed to fetch budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

// POST /api/budgets
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const budget = await prisma.budget.create({
      data: {
        amount: body.amount,
        purpose: body.purpose,
        spent: body.spent || 0,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        organizationId: user.organizationId, // ✅ ใช้ org แทน user
      },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("Failed to create budget:", error);
    return NextResponse.json(
      { error: "Failed to create budget" },
      { status: 500 }
    );
  }
}

// PUT /api/budgets
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const budget = await prisma.budget.update({
      where: { id: body.id },
      data: {
        purpose: body.purpose,
        amount: body.amount,
        spent: body.spent,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
      },
    });

    return NextResponse.json(budget);
  } catch (error) {
    console.error("Failed to update budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}

// DELETE /api/budgets?id=...
export async function DELETE(request: Request) {
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

    await prisma.budget.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete budget:", error);
    return NextResponse.json(
      { error: "Failed to delete budget" },
      { status: 500 }
    );
  }
}
