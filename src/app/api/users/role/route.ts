// src/app/api/users/role/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/rbac";
import type { UserRole } from "@/lib/rbac";

/**
 * PUT /api/users/role
 * Update a user's role (ADMIN only)
 */
export async function PUT(request: Request) {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      return NextResponse.json(
        { error: "Unauthorized - No user found" },
        { status: 401 }
      );
    }

    // Check if current user is admin
    const currentRole = await getUserRole();
    if (currentRole !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden - Only admins can change roles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, newRole } = body;

    if (!userId || !newRole) {
      return NextResponse.json(
        { error: "Missing userId or newRole" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: UserRole[] = ["ADMIN", "STOCK", "EMPLOYEE"];
    if (!validRoles.includes(newRole as UserRole)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN, STOCK, or EMPLOYEE" },
        { status: 400 }
      );
    }

    // Update user role
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Role updated to ${newRole}`,
      user: updated,
    });
  } catch (error: any) {
    console.error("Error updating user role:", error);
    
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}