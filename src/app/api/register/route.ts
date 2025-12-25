import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email?.toString().trim().toLowerCase();
    const password = body?.password?.toString();
    const name = body?.name?.toString().trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกอีเมลและรหัสผ่าน" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "อีเมลนี้ถูกใช้งานแล้ว" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const slugBase = email.split("@")[0] || "default";
    const slug = `${slugBase.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    const organization = await prisma.organization.create({
      data: {
        name: `${slugBase}'s Company`,
        slug,
        description: "Default organization",
      },
    });

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: passwordHash,
        role: "EMPLOYEE",
        organizationId: organization.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถสมัครสมาชิกได้" },
      { status: 500 }
    );
  }
}

