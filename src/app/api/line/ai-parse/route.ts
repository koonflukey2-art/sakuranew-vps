import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

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
      return NextResponse.json(
        { error: "กรุณาใส่ข้อความจาก LINE" },
        { status: 400 }
      );
    }

    const aiProvider = await prisma.aIProvider.findFirst({
      where: {
        organizationId: orgId,
        provider: "GEMINI",
        isActive: true,
      },
    });

    if (!aiProvider) {
      return NextResponse.json(
        { error: "กรุณาตั้งค่า AI Provider ในหน้า Settings" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(aiProvider.apiKey);
    const model = genAI.getGenerativeModel({
      model: aiProvider.modelName || "gemini-2.0-flash-exp",
    });

    const prompt = `แปลงข้อความออเดอร์จาก LINE เป็น JSON format:

ข้อความ:
${message}

ให้ตอบเป็น JSON เท่านั้น ไม่ต้องมี markdown หรือคำอธิบาย:
{
  "orderNumber": "หมายเลขออเดอร์",
  "customerName": "ชื่อลูกค้า",
  "phone": "เบอร์โทร 10 หลัก",
  "address": "ที่อยู่",
  "amount": จำนวนเงิน (ตัวเลข),
  "quantity": จำนวนสินค้า (ตัวเลข)
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const cleanText = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    return NextResponse.json({
      success: true,
      parsed,
    });
  } catch (error: any) {
    console.error("AI parse error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse with AI" },
      { status: 500 }
    );
  }
}
