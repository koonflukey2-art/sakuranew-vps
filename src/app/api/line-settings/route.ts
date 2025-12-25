import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const settings = await prisma.lINESettings.findUnique({
      where: { organizationId: orgId },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error fetching LINE settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch LINE settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const {
      channelAccessToken,
      channelSecret,
      webhookUrl,
      isActive,
    }: {
      channelAccessToken?: string;
      channelSecret?: string;
      webhookUrl?: string;
      isActive?: boolean;
    } = await request.json();

    const settings = await prisma.lINESettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        channelAccessToken: channelAccessToken || null,
        channelSecret: channelSecret || null,
        webhookUrl: webhookUrl || null,
        isActive: !!isActive,
      },
      update: {
        channelAccessToken: channelAccessToken || null,
        channelSecret: channelSecret || null,
        webhookUrl: webhookUrl || null,
        isActive: !!isActive,
      },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error saving LINE settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save LINE settings" },
      { status: 500 }
    );
  }
}
