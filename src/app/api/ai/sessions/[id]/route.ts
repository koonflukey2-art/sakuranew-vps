// src/app/api/ai/sessions/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    // ดึง user ปัจจุบัน
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ใช้ params.id แทน context.params (ตัวเดิมที่พัง)
    const session = await prisma.chatSession.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: session.id,
      title: session.title,
      provider: session.provider,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
    });
  } catch (error) {
    console.error("Get session messages error:", error);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}
