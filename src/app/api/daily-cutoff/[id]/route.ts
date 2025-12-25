// src/app/api/daily-cutoff/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const organizationId = await getOrganizationId();
    if (!organizationId) {
      return new NextResponse("No organization", { status: 400 });
    }

    const id = params.id;

    // เช็คก่อนว่า summary นี้เป็นของ org เราจริงไหม
    const existing = await prisma.dailySummary.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return new NextResponse("Not found", { status: 404 });
    }

    await prisma.dailySummary.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/daily-cutoff/[id] error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
