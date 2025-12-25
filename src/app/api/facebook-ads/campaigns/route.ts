import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");

    if (!adAccountId) {
      return NextResponse.json(
        { error: "Ad Account ID required" },
        { status: 400 }
      );
    }

    // Get Ad Account with decrypted token
    const adAccount = await prisma.adAccount.findUnique({
      where: { id: adAccountId, userId: user.id },
    });

    if (!adAccount || adAccount.platform !== "FACEBOOK") {
      return NextResponse.json(
        { error: "Invalid Facebook Ad Account" },
        { status: 400 }
      );
    }

    // Try to get token from AdAccount first, then fallback to Platform Credentials
    let accessToken: string | null = null;

    if (adAccount.accessToken) {
      accessToken = decrypt(adAccount.accessToken);
    } else if (adAccount.apiKey) {
      accessToken = decrypt(adAccount.apiKey);
    } else {
      // Fallback to Platform Credentials
      const platformCred = await prisma.platformCredential.findUnique({
        where: {
          userId_platform: {
            userId: user.id,
            platform: "FACEBOOK_ADS",
          },
        },
      });

      if (platformCred?.accessToken || platformCred?.apiKey) {
        accessToken = platformCred.accessToken
          ? decrypt(platformCred.accessToken)
          : platformCred.apiKey
          ? decrypt(platformCred.apiKey)
          : null;
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "No Facebook Ads credentials configured" },
        { status: 400 }
      );
    }

    // Fetch campaigns from Facebook
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${adAccount.accountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time&access_token=${accessToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to fetch campaigns");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Facebook campaigns fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}
