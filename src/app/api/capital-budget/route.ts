// src/app/api/capital-budget/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrganizationId } from "@/lib/organization";

// GET /api/capital-budget  -> ดึงงบทั้งหมด (ไว้โชว์ในหน้า CapitalBudgetPage)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const budgets = await prisma.budget.findMany({
      where: { organizationId: orgId },
      include: {
        items: true, // relation BudgetItem[]
      },
      orderBy: { createdAt: "desc" },
    });

    // map ให้ shape ตรง interface Budget ในหน้า client
    const result = budgets.map((b) => ({
      id: b.id,
      name: b.name ?? "",
      description: b.description ?? "",
      totalAmount: b.totalAmount,
      remaining: b.remaining,
      createdAt: b.createdAt.toISOString(),
      items: b.items.map((it) => ({
        id: it.id,
        name: it.name,
        amount: it.amount,
        quantity: it.quantity,
        notes: it.notes ?? "",
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch budgets:", error);
    return NextResponse.json(
      { error: "Failed to fetch budgets" },
      { status: 500 }
    );
  }
}

// POST /api/capital-budget  -> ใช้ตอนกด "บันทึกงบประมาณ" จากหน้า CapitalBudgetPage
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const name: string = body.name ?? "งบประมาณ";
    const description: string = body.description ?? "";
    const items: Array<{
      name: string;
      amount: number;
      quantity: number;
      notes?: string;
    }> = body.items ?? [];

    const validItems = items.filter(
      (item) => item.name?.trim() && Number(item.amount) > 0
    );

    if (validItems.length === 0) {
      return NextResponse.json(
        { error: "ต้องมีรายการค่าใช้จ่ายอย่างน้อย 1 รายการ" },
        { status: 400 }
      );
    }

    // ถ้า body ส่ง totalAmount มา ใช้อันนั้นก่อน ไม่งั้น sum จาก items
    const totalAmountFromBody = Number(body.totalAmount) || 0;
    const totalAmountFromItems = validItems.reduce(
      (sum, it) => sum + Number(it.amount) * (Number(it.quantity) || 1),
      0
    );
    const totalAmount =
      totalAmountFromBody > 0 ? totalAmountFromBody : totalAmountFromItems;

    const budget = await prisma.budget.create({
      data: {
        organizationId: orgId,
        name,
        description,
        totalAmount,
        remaining: totalAmount, // เริ่มเหลือเท่ากับยอดรวม
        items: {
          create: validItems.map((item) => ({
            name: item.name,
            amount: Number(item.amount),
            quantity: Number(item.quantity) || 1,
            notes: item.notes ?? "",
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json(
      {
        id: budget.id,
        name: budget.name ?? "",
        description: budget.description ?? "",
        totalAmount: budget.totalAmount,
        remaining: budget.remaining,
        createdAt: budget.createdAt.toISOString(),
        items: budget.items.map((it) => ({
          id: it.id,
          name: it.name,
          amount: it.amount,
          quantity: it.quantity,
          notes: it.notes ?? "",
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create capital budget:", error);
    return NextResponse.json(
      { error: "Failed to create capital budget" },
      { status: 500 }
    );
  }
}
