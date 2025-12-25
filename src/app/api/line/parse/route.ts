import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { parseLineMessage } from "@/lib/line-parser";

export async function POST(request: Request) {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Parse message
    const parsed = parseLineMessage(message);

    if (!parsed || !parsed.amount || !parsed.productType) {
      return NextResponse.json(
        { error: "ไม่สามารถแปลงข้อความได้ กรุณาตรวจสอบรูปแบบ" },
        { status: 400 }
      );
    }

    // Find or create customer
    let customer;
    if (parsed.phone) {
      customer = await prisma.customer.findFirst({
        where: {
          phone: parsed.phone,
          organizationId: orgId,
        },
      });

      if (!customer && parsed.customerName) {
        customer = await prisma.customer.create({
          data: {
            name: parsed.customerName,
            phone: parsed.phone,
            address: parsed.address || "",
            organizationId: orgId,
          },
        });
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลลูกค้า กรุณาระบุเบอร์โทร" },
        { status: 400 }
      );
    }

    // Create order
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        amount: parsed.amount,
        quantity: parsed.quantity || 1,
        productType: parsed.productType,
        productName: parsed.productName,
        rawMessage: message,
        organizationId: orgId,
        status: "CONFIRMED",
      },
      include: {
        customer: true,
      },
    });

    return NextResponse.json({
      success: true,
      order,
      parsed,
    });
  } catch (error: any) {
    console.error("Error parsing LINE message:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse message" },
      { status: 500 }
    );
  }
}
