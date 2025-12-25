import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { join } from "path";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

function getUploadDir() {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!user.organizationId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const orgId = user.organizationId;

    const receipt = await prisma.adReceipt.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, receiptUrl: true },
    });
    if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.adReceipt.delete({ where: { id: receipt.id } });

    // ลบไฟล์ ถ้า receiptUrl เป็น /api/uploads/<filename>
    if (receipt.receiptUrl?.startsWith("/api/uploads/")) {
      const filename = receipt.receiptUrl.replace("/api/uploads/", "");
      const fullpath = join(getUploadDir(), filename);
      if (existsSync(fullpath)) await unlink(fullpath).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Delete receipt error:", e);
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
