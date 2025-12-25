import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db"; // ใช้ lib/db ตามโปรเจกต์คุณ

export async function POST() {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 403 }
      );
    }

    const orgId = user.organizationId;

    // ==============================
    // ✅ 1) แจ้งเตือนสต็อกต่ำ
    // ==============================
    const products = await prisma.product.findMany({
      where: { organizationId: orgId },
    });

    const lowStockProducts = products.filter(
      (p) => p.quantity < p.minStockLevel
    );

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const product of lowStockProducts) {
      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: "LOW_STOCK",
          message: { contains: product.name },
          createdAt: {
            gte: twentyFourHoursAgo, // ภายใน 24 ชม. ล่าสุด
          },
        },
      });

      if (!existingNotif) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: "LOW_STOCK",
            title: "สต็อกต่ำ!",
            message: `${product.name} เหลือเพียง ${product.quantity} ชิ้น (ควรมี ${product.minStockLevel})`,
            link: "/stock",
          },
        });
      }
    }

    // ==============================
    // ✅ 2) แจ้งเตือนงบประมาณ (ใช้ CapitalBudget)
    // ==============================

    // ดึงงบลงทุนล่าสุดของ org นี้
    const capitalBudget = await prisma.capitalBudget.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });

    if (capitalBudget && capitalBudget.amount > 0) {
      const total = capitalBudget.amount;       // งบทั้งหมด
      const remaining = capitalBudget.remaining; // เหลือ
      const used = total - remaining;           // ใช้ไปแล้ว
      const usedRatio = used / total;           // เป็น %

      // ถ้าใช้ไปเกิน 90% แล้วค่อยแจ้งเตือน
      if (usedRatio >= 0.9) {
        const existingBudgetNotif = await prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: "BUDGET_ALERT",
            createdAt: {
              gte: twentyFourHoursAgo, // ไม่ให้เด้งถี่เกิน (แค่วันละครั้ง)
            },
          },
        });

        if (!existingBudgetNotif) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: "BUDGET_ALERT",
              title: "งบประมาณใกล้หมด!",
              message: `งบลงทุนใช้ไปแล้ว ${Math.round(
                usedRatio * 100
              )}% (ใช้ไป ${used.toFixed(0)} จาก ${total.toFixed(0)})`,
              // ปรับลิงก์ให้ตรงกับหน้าจริงของคุณ
              link: "/capital-budget",
            },
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Check alerts error:", error);
    return NextResponse.json(
      { error: "Failed to check alerts" },
      { status: 500 }
    );
  }
}
