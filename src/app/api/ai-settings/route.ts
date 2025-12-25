// src/app/api/ai-settings/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

// GET - ดึง AI providers ทั้งหมด (ต่อ org)
export async function GET() {
  try {
    const clerk = await getCurrentUser();
    if (!clerk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: clerk.id },
      include: {
        organization: {
          include: { aiProviders: true },
        },
      },
    });

    if (!user || !user.organization) {
      return NextResponse.json(
        { error: "User or organization not found" },
        { status: 404 }
      );
    }

    const providers = user.organization.aiProviders.map((p) => ({
      id: p.id,
      provider: p.provider,
      modelName: p.modelName,
      isActive: p.isActive,
      isDefault: p.isDefault,
      isValid: p.isValid,
      lastTested: p.lastTested,
      hasApiKey: !!p.apiKey,
    }));

    return NextResponse.json(providers);
  } catch (error) {
    console.error("Get AI settings error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST - บันทึก/อัพเดท API Key (ต่อ org + provider)
export async function POST(request: Request) {
  try {
    const clerk = await getCurrentUser();
    if (!clerk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: clerk.id },
    });

    if (!user || !user.organizationId) {
      return NextResponse.json(
        { error: "User or organization not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { provider, apiKey, modelName } = body as {
      provider?: "GEMINI" | "OPENAI" | "N8N";
      apiKey?: string;
      modelName?: string;
    };

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider และ API Key จำเป็นต้องกรอก" },
        { status: 400 }
      );
    }

    const encryptedKey = encrypt(apiKey);

    const aiProvider = await prisma.aIProvider.upsert({
      where: {
        organizationId_provider: {
          organizationId: user.organizationId,
          provider,
        },
      },
      update: {
        apiKey: encryptedKey,
        modelName,
        isValid: false,
        lastTested: null,
        testMessage: null,
      },
      create: {
        organizationId: user.organizationId,
        provider,
        apiKey: encryptedKey,
        modelName,
      },
    });

    return NextResponse.json({
      id: aiProvider.id,
      provider: aiProvider.provider,
      message: "บันทึกสำเร็จ",
    });
  } catch (error) {
    console.error("Save AI settings error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// PUT - ทดสอบ API Key ของ provider หนึ่งตัว (ยังเก็บไว้ เผื่อมีที่อื่นเรียก)
export async function PUT(request: Request) {
  try {
    const clerk = await getCurrentUser();
    if (!clerk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("id");

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID required" },
        { status: 400 }
      );
    }

    const aiProvider = await prisma.aIProvider.findUnique({
      where: { id: providerId },
    });

    if (!aiProvider) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 }
      );
    }

    if (!aiProvider.apiKey) {
      return NextResponse.json(
        { error: "No API key saved" },
        { status: 400 }
      );
    }

    const apiKey = decrypt(aiProvider.apiKey);
    let isValid = false;
    let testMessage = "";

    try {
      if (aiProvider.provider === "GEMINI") {
        const result = await testGemini(apiKey);
        isValid = result.success;
        testMessage = result.message;
      } else if (aiProvider.provider === "OPENAI") {
        const result = await testOpenAI(apiKey);
        isValid = result.success;
        testMessage = result.message;
      } else if (aiProvider.provider === "N8N") {
        const result = await testN8N(apiKey);
        isValid = result.success;
        testMessage = result.message;
      } else {
        isValid = false;
        testMessage = "Unknown provider";
      }
    } catch (error: any) {
      isValid = false;
      testMessage = error?.message || "การทดสอบล้มเหลว";
    }

    await prisma.aIProvider.update({
      where: { id: providerId },
      data: {
        isValid,
        testMessage,
        lastTested: new Date(),
      },
    });

    return NextResponse.json({
      success: isValid,
      message: testMessage,
    });
  } catch (error) {
    console.error("Test AI provider error:", error);
    return NextResponse.json({ error: "Failed to test" }, { status: 500 });
  }
}

// DELETE - ลบ provider
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("id");

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID required" },
        { status: 400 }
      );
    }

    await prisma.aIProvider.delete({
      where: { id: providerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete provider error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

// =========================
// Helper functions
// =========================

async function testGemini(apiKey: string) {
  try {
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
  } catch (error: any) {
    return { success: false, message: `❌ ${error?.message || "Unknown error"}` };
  }
}

async function testOpenAI(apiKey: string) {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) {
      return { success: true, message: "✅ OpenAI API Key ใช้งานได้" };
    } else {
      const error = await response.json().catch(() => ({} as any));
      const msg =
        error?.error?.message ||
        `${response.status} ${response.statusText || "Unknown error"}`;
      return { success: false, message: `❌ OpenAI API Key ไม่ถูกต้อง: ${msg}` };
    }
  } catch (error: any) {
    return { success: false, message: `❌ ${error.message}` };
  }
}

async function testN8N(webhookUrl: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true, message: "Test connection" }),
    });

    if (response.ok) {
      return { success: true, message: "✅ n8n Webhook ใช้งานได้" };
    } else {
      return {
        success: false,
        message: "❌ n8n Webhook ไม่ถูกต้อง หรือ workflow ไม่ทำงาน",
      };
    }
  } catch (error: any) {
    return { success: false, message: `❌ ${error.message}` };
  }
}
