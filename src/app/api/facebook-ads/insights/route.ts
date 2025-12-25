import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const campaignId = searchParams.get("campaignId");

    if (!adAccountId || !campaignId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const adAccount = await prisma.adAccount.findUnique({
      where: { id: adAccountId, userId: user.id },
    });

    if (!adAccount) {
      return NextResponse.json(
        { error: "Ad Account not found" },
        { status: 404 }
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

    // Fetch insights from Facebook
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${campaignId}/insights?fields=impressions,clicks,spend,reach,actions,ctr,cpc,cpm&access_token=${accessToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to fetch insights");
    }

    const data = await response.json();

    // Save to database for AI analysis
    if (data.data && data.data[0]) {
      const insight = data.data[0];
      const conversions = insight.actions?.find((a: any) => a.action_type === "purchase")?.value || 0;

      await prisma.facebookAdInsight.upsert({
        where: {
          adAccountId_campaignId_date: {
            adAccountId,
            campaignId,
            date: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        update: {
          impressions: parseInt(insight.impressions || "0"),
          clicks: parseInt(insight.clicks || "0"),
          spend: parseFloat(insight.spend || "0"),
          reach: parseInt(insight.reach || "0"),
          conversions: parseInt(conversions),
          ctr: parseFloat(insight.ctr || "0"),
          cpc: parseFloat(insight.cpc || "0"),
          cpm: parseFloat(insight.cpm || "0"),
          roas: 0,
        },
        create: {
          userId: user.id,
          adAccountId,
          campaignId,
          campaignName: searchParams.get("campaignName") || "Unknown",
          impressions: parseInt(insight.impressions || "0"),
          clicks: parseInt(insight.clicks || "0"),
          spend: parseFloat(insight.spend || "0"),
          reach: parseInt(insight.reach || "0"),
          conversions: parseInt(conversions),
          ctr: parseFloat(insight.ctr || "0"),
          cpc: parseFloat(insight.cpc || "0"),
          cpm: parseFloat(insight.cpm || "0"),
          roas: 0,
          date: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Facebook insights fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
