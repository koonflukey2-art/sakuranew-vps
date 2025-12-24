// src/app/api/system-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

export const runtime = "nodejs";

type Payload = {
  // cut-off
  dailyCutOffHour?: number | null;
  dailyCutOffMinute?: number | null;

  // Stock LINE
  lineNotifyToken?: string | null;
  lineChannelAccessToken?: string | null;
  lineChannelSecret?: string | null;
  lineWebhookUrl?: string | null;
  lineTargetId?: string | null;

  // Ads LINE
  adsLineNotifyToken?: string | null;
  adsLineChannelAccessToken?: string | null;
  adsLineChannelSecret?: string | null;
  adsLineWebhookUrl?: string | null;

  // notify/admin
  adminEmails?: string | null;
  notifyOnOrder?: boolean | null;
  notifyOnLowStock?: boolean | null;
  notifyDailySummary?: boolean | null;
};

// return: undefined = not provided, null = clear, string = set
function pickOptionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : null;
}

function pickOptionalInt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function pickOptionalBool(v: unknown): boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  return undefined;
}

export async function GET(_req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getOrganizationId();
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 403 });

    const settings = await prisma.systemSettings.findUnique({
      where: { organizationId: orgId },
      select: {
        organizationId: true,

        dailyCutOffHour: true,
        dailyCutOffMinute: true,

        // Stock LINE
        lineNotifyToken: true,
        lineChannelAccessToken: true,
        lineChannelSecret: true,
        lineWebhookUrl: true,
        lineTargetId: true,

        // Ads LINE
        adsLineNotifyToken: true,
        adsLineChannelAccessToken: true,
        adsLineChannelSecret: true,
        adsLineWebhookUrl: true,

        // admin/notify
        adminEmails: true,
        notifyOnOrder: true,
        notifyOnLowStock: true,
        notifyDailySummary: true,
      },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("Error fetching system settings:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getOrganizationId();
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Payload;

    // cut-off
    const dailyCutOffHour = pickOptionalInt(body.dailyCutOffHour);
    const dailyCutOffMinute = pickOptionalInt(body.dailyCutOffMinute);

    // Stock LINE
    const lineNotifyToken = pickOptionalString(body.lineNotifyToken);
    const lineChannelAccessToken = pickOptionalString(body.lineChannelAccessToken);
    const lineChannelSecret = pickOptionalString(body.lineChannelSecret);
    const lineWebhookUrl = pickOptionalString(body.lineWebhookUrl);
    const lineTargetId = pickOptionalString(body.lineTargetId);

    // Ads LINE
    const adsLineNotifyToken = pickOptionalString(body.adsLineNotifyToken);
    const adsLineChannelAccessToken = pickOptionalString(body.adsLineChannelAccessToken);
    const adsLineChannelSecret = pickOptionalString(body.adsLineChannelSecret);
    const adsLineWebhookUrl = pickOptionalString(body.adsLineWebhookUrl);

    // admin/notify
    const adminEmails = pickOptionalString(body.adminEmails);
    const notifyOnOrder = pickOptionalBool(body.notifyOnOrder);
    const notifyOnLowStock = pickOptionalBool(body.notifyOnLowStock);
    const notifyDailySummary = pickOptionalBool(body.notifyDailySummary);

    // ✅ IMPORTANT: อย่า overwrite token ถ้า client "ไม่ส่งมา"
    const createData: any = {
      organizationId: orgId,
    };

    const updateData: any = {};

    // cut-off
    if (dailyCutOffHour !== undefined) updateData.dailyCutOffHour = dailyCutOffHour;
    if (dailyCutOffMinute !== undefined) updateData.dailyCutOffMinute = dailyCutOffMinute;

    // Stock LINE
    if (lineNotifyToken !== undefined) updateData.lineNotifyToken = lineNotifyToken;
    if (lineChannelAccessToken !== undefined)
      updateData.lineChannelAccessToken = lineChannelAccessToken;
    if (lineChannelSecret !== undefined) updateData.lineChannelSecret = lineChannelSecret;
    if (lineWebhookUrl !== undefined) updateData.lineWebhookUrl = lineWebhookUrl;
    if (lineTargetId !== undefined) updateData.lineTargetId = lineTargetId;

    // Ads LINE
    if (adsLineNotifyToken !== undefined) updateData.adsLineNotifyToken = adsLineNotifyToken;
    if (adsLineChannelAccessToken !== undefined)
      updateData.adsLineChannelAccessToken = adsLineChannelAccessToken;
    if (adsLineChannelSecret !== undefined) updateData.adsLineChannelSecret = adsLineChannelSecret;
    if (adsLineWebhookUrl !== undefined) updateData.adsLineWebhookUrl = adsLineWebhookUrl;

    // admin/notify
    if (adminEmails !== undefined) updateData.adminEmails = adminEmails;
    if (notifyOnOrder !== undefined) updateData.notifyOnOrder = notifyOnOrder;
    if (notifyOnLowStock !== undefined) updateData.notifyOnLowStock = notifyOnLowStock;
    if (notifyDailySummary !== undefined) updateData.notifyDailySummary = notifyDailySummary;

    // create: ใส่ค่าเริ่มต้นจาก updateData ด้วย
    Object.assign(createData, updateData);

    const saved = await prisma.systemSettings.upsert({
      where: { organizationId: orgId },
      create: createData,
      update: updateData,
    });

    return NextResponse.json(saved);
  } catch (error: any) {
    console.error("Error saving system settings:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save settings" },
      { status: 500 }
    );
  }
}
