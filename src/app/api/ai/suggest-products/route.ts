import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { category, trend, budget } = body;

    const aiProvider = await prisma.aIProvider.findFirst({
      where: { userId: user.id, isDefault: true, isValid: true },
    });

    if (!aiProvider) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 }
      );
    }

    const apiKey = decrypt(aiProvider.apiKey);

    const prompt = `แนะนำสินค้าสำหรับร้านค้าออนไลน์:

หมวดหมู่: ${category || "ทั่วไป"}
เทรนด์: ${trend || "ไม่ระบุ"}
งบประมาณ: ${budget || "ไม่ระบุ"} บาท

กรุณาแนะนำสินค้า 5 รายการที่:
1. เหมาะกับตลาด
2. มีแนวโน้มขายดี
3. กำไรเหมาะสม
4. แข่งขันได้

ตอบเป็น JSON Array:
[
  {
    "name": "ชื่อสินค้า",
    "category": "หมวดหมู่",
    "description": "รายละเอียด",
    "estimatedCost": 0,
    "estimatedPrice": 0,
    "profitMargin": 0,
    "demandScore": 0-100,
    "competitionLevel": "LOW/MEDIUM/HIGH",
    "reason": "เหตุผลที่แนะนำ"
  }
]`;

    let suggestions: any[] = [];

    if (aiProvider.provider === "GEMINI") {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate suggestions");
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    }

    // Save suggestions
    for (const suggestion of suggestions) {
      await prisma.aIProductSuggestion.create({
        data: {
          userId: user.id,
          productName: suggestion.name,
          category: suggestion.category,
          description: JSON.stringify(suggestion),
          aiProvider: aiProvider.provider,
          confidence: (suggestion.demandScore || 50) / 100,
        },
      });
    }

    return NextResponse.json(suggestions);
  } catch (error: any) {
    console.error("AI product suggestion error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}
