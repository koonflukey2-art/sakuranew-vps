// src/app/api/ai-settings/test/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const clerk = await getCurrentUser();
    if (!clerk) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: clerk.id },
      select: { organizationId: true },
    });

    if (!user || !user.organizationId) {
      return NextResponse.json(
        { success: false, message: "User or organization not found" },
        { status: 404 }
      );
    }

    // รองรับทั้ง ?id=... และ body.providerId
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("id");
    const body = await request.json().catch(() => ({} as any));
    const fromBody = body?.providerId ? String(body.providerId) : null;

    const providerId = fromQuery || fromBody;
    if (!providerId) {
      return NextResponse.json(
        { success: false, message: "Provider ID required" },
        { status: 400 }
      );
    }

    // ✅ ต้องเป็น provider ใน org เดียวกันเท่านั้น
    const aiProvider = await prisma.aIProvider.findFirst({
      where: { id: providerId, organizationId: user.organizationId },
    });

    if (!aiProvider) {
      return NextResponse.json(
        { success: false, message: "Provider not found" },
        { status: 404 }
      );
    }

    if (!aiProvider.apiKey) {
      return NextResponse.json(
        { success: false, message: "No API key/webhook saved" },
        { status: 400 }
      );
    }

    const apiKey = decrypt(aiProvider.apiKey);

    let isValid = false;
    let testMessage = "";

    try {
      if (aiProvider.provider === "GEMINI") {
        const r = await testGemini(apiKey);
        isValid = r.success;
        testMessage = r.message;
      } else if (aiProvider.provider === "OPENAI") {
        const r = await testOpenAI(apiKey);
        isValid = r.success;
        testMessage = r.message;
      } else if (aiProvider.provider === "N8N") {
        const r = await testN8N(apiKey);
        isValid = r.success;
        testMessage = r.message;
      } else {
        isValid = false;
        testMessage = "Unknown provider";
      }
    } catch (e: any) {
      isValid = false;
      testMessage = e?.message || "การทดสอบล้มเหลว";
    }

    await prisma.aIProvider.update({
      where: { id: aiProvider.id },
      data: {
        isValid,
        testMessage,
        lastTested: new Date(),
      },
    });

    return NextResponse.json({ success: isValid, message: testMessage });
  } catch (error: any) {
    console.error("POST /api/ai-settings/test error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to test" },
      { status: 500 }
    );
  }
}

// =========================
// Helper functions (เหมือนของคุณ)
// =========================

async function testGemini(apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { method: "GET" }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({} as any));
    const msg =
      error?.error?.message ||
      `${response.status} ${response.statusText || "Unknown error"}`;
    return {
      success: false,
      message: `❌ Gemini API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เรียกใช้ API: ${msg}`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as any;
  const models: string[] = Array.isArray(data?.models)
    ? data.models.map((m: any) => m?.name || "").filter(Boolean)
    : [];

  const sample =
    models.length > 0 ? ` ตัวอย่างโมเดล: ${models.slice(0, 3).join(", ")}` : "";

  return {
    success: true,
    message: `✅ Gemini API Key ใช้งานได้.${sample}`,
  };
}

async function testOpenAI(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.ok) {
    return { success: true, message: "✅ OpenAI API Key ใช้งานได้" };
  }

  const error = await response.json().catch(() => ({} as any));
  const msg =
    error?.error?.message ||
    `${response.status} ${response.statusText || "Unknown error"}`;
  return { success: false, message: `❌ OpenAI API Key ไม่ถูกต้อง: ${msg}` };
}

async function testN8N(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true, message: "Test connection" }),
  });

  if (response.ok) {
    return { success: true, message: "✅ n8n Webhook ใช้งานได้" };
  }

  return {
    success: false,
    message: "❌ n8n Webhook ไม่ถูกต้อง หรือ workflow ไม่ทำงาน",
  };
}
