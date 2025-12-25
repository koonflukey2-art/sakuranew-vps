import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function POST(request: Request) {
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

    const body = await request.json();
    const { campaignId, insights } = body;

    // Get AI Provider
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

    const prompt = `วิเคราะห์ผลการทำงานของแคมเปญโฆษณา Facebook:

ข้อมูล:
- Impressions: ${insights.impressions || 0}
- Clicks: ${insights.clicks || 0}
- Spend: ${insights.spend || 0} THB
- CTR: ${insights.ctr || 0}%
- CPC: ${insights.cpc || 0} THB
- CPM: ${insights.cpm || 0} THB
- Reach: ${insights.reach || 0}
- Conversions: ${insights.actions?.find((a: any) => a.action_type === "purchase")?.value || 0}

กรุณาให้:
1. การวิเคราะห์ผลการทำงาน
2. จุดที่ทำได้ดี
3. จุดที่ต้องปรับปรุง
4. คำแนะนำเฉพาะเจาะจง 3-5 ข้อ
5. คะแนนประสิทธิภาพ (0-100)

ตอบเป็น JSON:
{
  "analysis": "...",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "score": 0-100
}`;

    let analysis: any = null;

    // Analyze with Gemini
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
        throw new Error("Failed to analyze with Gemini");
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }

    if (analysis) {
      // Save recommendation
      await prisma.facebookAdInsight.updateMany({
        where: {
          campaignId,
          userId: user.id,
        },
        data: {
          aiRecommendation: JSON.stringify(analysis.recommendations),
          optimizationScore: analysis.score,
        },
      });
    }

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error("AI analysis error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
}
