import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getOrganizationId(): Promise<string> {
  // Get from session or default org - implement based on your auth setup
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    select: { organizationId: true },
  });

  return dbUser?.organizationId || "default-org";
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");

    const campaigns = await prisma.adCampaign.findMany({
      where: {
        organizationId: orgId,
        ...(platform && { platform: platform as any }),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Failed to fetch campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    const body = await request.json();

    const campaign = await prisma.adCampaign.create({
      data: {
        organizationId: orgId,
        campaignName: body.campaignName,
        platform: body.platform || "FACEBOOK",
        startDate: new Date(body.startDate),
        budget: parseFloat(body.budget),
        remaining: parseFloat(body.budget),
        status: "ACTIVE",
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Failed to create campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
