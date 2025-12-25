import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

// NOTE: ทำให้เรียบง่าย ใช้การ ping endpoint เบื้องต้นพอ
async function testFacebook(apiKey: string | null, accessToken: string | null) {
  const token = accessToken || apiKey;
  if (!token) {
    return { success: false, message: "Missing token" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/me?access_token=${token}`
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Invalid Facebook token");
    }

    const data = await res.json();
    return { success: true, message: `Connected as ${data.name || "Facebook User"}` };
  } catch (e: any) {
    return { success: false, message: e.message || "Connection failed" };
  }
}

async function testTikTok(apiKey: string | null, accessToken: string | null) {
  const token = accessToken || apiKey;
  if (!token) {
    return { success: false, message: "Missing token" };
  }

  try {
    const res = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/user/info/",
      {
        headers: {
          "Access-Token": token,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      throw new Error("Invalid TikTok credentials");
    }
    return { success: true, message: "Successfully connected to TikTok Business API" };
  } catch (e: any) {
    return { success: false, message: e.message || "Connection failed" };
  }
}

async function testLazada(apiKey: string | null) {
  if (!apiKey) {
    return { success: false, message: "Missing Lazada API key" };
  }

  // NOTE: ใส่เป็น placeholder test เบื้องต้น (จริง ๆ ต้องใช้ signature + app key/secret)
  try {
    return {
      success: true,
      message: "Lazada API key saved (mock test - configure real check later)",
    };
  } catch (e: any) {
    return { success: false, message: e.message || "Connection failed" };
  }
}

async function testShopee(apiKey: string | null) {
  if (!apiKey) {
    return { success: false, message: "Missing Shopee API key" };
  }

  // NOTE: Shopee requires partner ID + key + signature
  try {
    return {
      success: true,
      message: "Shopee API key saved (mock test - configure real check later)",
    };
  } catch (e: any) {
    return { success: false, message: e.message || "Connection failed" };
  }
}

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
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Credential ID required" },
        { status: 400 }
      );
    }

    const credential = await prisma.platformCredential.findUnique({
      where: { id, userId: user.id },
    });

    if (!credential) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      );
    }

    const apiKey = credential.apiKey ? decrypt(credential.apiKey) : null;
    const apiSecret = credential.apiSecret ? decrypt(credential.apiSecret) : null;
    const accessToken = credential.accessToken ? decrypt(credential.accessToken) : null;
    const refreshToken = credential.refreshToken ? decrypt(credential.refreshToken) : null;

    let result;

    switch (credential.platform) {
      case "FACEBOOK_ADS":
        result = await testFacebook(apiKey, accessToken);
        break;
      case "TIKTOK_ADS":
        result = await testTikTok(apiKey, accessToken);
        break;
      case "LAZADA":
        result = await testLazada(apiKey);
        break;
      case "SHOPEE":
        result = await testShopee(apiKey);
        break;
      default:
        return NextResponse.json(
          { error: "Unsupported platform" },
          { status: 400 }
        );
    }

    await prisma.platformCredential.update({
      where: { id: credential.id },
      data: {
        isValid: result.success,
        lastTested: new Date(),
        testMessage: result.message,
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Platform credential test error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to test credential" },
      { status: 500 }
    );
  }
}
