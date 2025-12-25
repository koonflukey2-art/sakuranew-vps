// src/app/api/orders/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

// ---------------------------
// ✅ OrderStatus helper (แก้ TS error)
// ---------------------------
const ORDER_STATUS_VALUES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
];

function parseOrderStatus(
  input: unknown,
  fallback: OrderStatus = "COMPLETED"
): OrderStatus {
  if (typeof input !== "string") return fallback;
  const upper = input.toUpperCase();
  return (ORDER_STATUS_VALUES as unknown as string[]).includes(upper)
    ? (upper as OrderStatus)
    : fallback;
}

function safeNumber(v: unknown, fallback = 0) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function isoOrNull(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * ✅ สร้าง phone placeholder แบบไม่ซ้ำ (กัน customer ปนกัน)
 */
function uniqueUnknownPhone() {
  return `UNKNOWN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// ---------------------------
// GET: list orders (filters)
// ---------------------------
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);

    const search = (searchParams.get("search") || "").trim();
    const statusRaw = (searchParams.get("status") || "").trim();
    const productTypeRaw = (searchParams.get("productType") || "").trim();

    // ✅ จากหน้า OrdersPage ส่ง from/to มาได้
    const from = isoOrNull(searchParams.get("from"));
    const to = isoOrNull(searchParams.get("to"));

    const where: any = { organizationId: orgId };

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    if (statusRaw) {
      where.status = parseOrderStatus(statusRaw, "COMPLETED");
    }

    if (productTypeRaw) {
      const pt = parseInt(productTypeRaw, 10);
      if (Number.isFinite(pt)) where.productType = pt;
    }

    if (from || to) {
      where.orderDate = {};
      if (from) where.orderDate.gte = from;
      if (to) where.orderDate.lte = to;
    }

    const orders = await prisma.order.findMany({
      where,
      include: { customer: true },
      orderBy: { orderDate: "desc" },
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

// ---------------------------
// POST: create order manually
// ---------------------------
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // customer
    const customerName = safeString(body.customerName, "").trim() || "ลูกค้าไม่ระบุชื่อ";
    const customerPhoneInput = safeString(body.customerPhone, "").trim();
    const customerPhone = customerPhoneInput ? customerPhoneInput.replace(/\D/g, "") : uniqueUnknownPhone();
    const customerAddress = safeString(body.customerAddress, "").trim();

    // order fields
    const productType = parseInt(String(body.productType ?? ""), 10);
    const productName = safeString(body.productName, "").trim() || null;

    const amount = safeNumber(body.amount, 0);
    const quantity = Math.max(1, Math.floor(safeNumber(body.quantity, 1)));

    if (!Number.isFinite(productType) || productType <= 0) {
      return NextResponse.json(
        { error: "productType is required (number > 0)" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount is required (number > 0)" },
        { status: 400 }
      );
    }

    const unitPrice =
      safeNumber(body.unitPrice, 0) > 0
        ? safeNumber(body.unitPrice, 0)
        : amount / quantity;

    const status: OrderStatus = parseOrderStatus(body.status, "COMPLETED");
    const notes = safeString(body.notes, "").trim() || null;
    const rawMessage = safeString(body.rawMessage, "").trim() || null;

    // ✅ เปิด/ปิดตัดสต็อก (default: true)
    const decrementStock =
      typeof body.decrementStock === "boolean" ? body.decrementStock : true;

    // 1) upsert/find customer
    let customer = await prisma.customer.findFirst({
      where: { organizationId: orgId, phone: customerPhone },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          organizationId: orgId,
          name: customerName,
          phone: customerPhone,
          address: customerAddress || null,
        },
      });
    } else {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          // อัพเดทชื่อ/ที่อยู่แบบไม่ทำลายของเดิม
          name: customer.name === "ลูกค้าไม่ระบุชื่อ" ? customerName : customer.name,
          address: customerAddress || customer.address,
        },
      });
    }

    // 2) resolve productType name from DB (optional)
    const pt = await prisma.productType.findFirst({
      where: { organizationId: orgId, typeNumber: productType, isActive: true },
      select: { typeName: true },
    });

    // 3) create order
    const order = await prisma.order.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,

        amount,
        quantity,
        unitPrice,
        productType,
        productName: productName ?? pt?.typeName ?? null,

        rawMessage,
        status,
        notes,
        orderDate: new Date(),
      },
      include: { customer: true },
    });

    // 4) decrement stock (เหมือน webhook)
    if (decrementStock) {
      const product = await prisma.product.findFirst({
        where: { organizationId: orgId, productType },
      });

      if (product) {
        await prisma.product.update({
          where: { id: product.id },
          data: { quantity: { decrement: quantity } },
        });
      }
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("POST /api/orders error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create order" },
      { status: 500 }
    );
  }
}

// ---------------------------
// PUT: update order (ADMIN only)
// ---------------------------
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only ADMIN can edit orders" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const id = safeString(body.id, "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const existing = await prisma.order.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const customerName = safeString(body.customerName, "").trim();
    const customerPhone = safeString(body.customerPhone, "").trim();
    const customerAddress = body.customerAddress;

    if (customerName || customerPhone || customerAddress !== undefined) {
      await prisma.customer.update({
        where: { id: existing.customerId },
        data: {
          ...(customerName && { name: customerName }),
          ...(customerPhone && { phone: customerPhone }),
          ...(customerAddress !== undefined && { address: customerAddress || null }),
        },
      });
    }

    const amount =
      body.amount !== undefined ? safeNumber(body.amount, existing.amount) : undefined;

    const statusRaw = body.status;
    const nextStatus: OrderStatus | undefined =
      statusRaw ? parseOrderStatus(statusRaw, existing.status as OrderStatus) : undefined;

    const notes = body.notes !== undefined ? safeString(body.notes, "").trim() : undefined;

    const order = await prisma.order.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount }),
        ...(nextStatus && { status: nextStatus }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: { customer: true },
    });

    return NextResponse.json(order);
  } catch (error: any) {
    console.error("PUT /api/orders error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update order" },
      { status: 500 }
    );
  }
}

// ---------------------------
// DELETE: delete order (ADMIN only)
// ---------------------------
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only ADMIN can delete orders" },
        { status: 403 }
      );
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get("id") || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Order ID required" }, { status: 400 });
    }

    const existing = await prisma.order.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await prisma.order.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/orders error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete order" },
      { status: 500 }
    );
  }
}
