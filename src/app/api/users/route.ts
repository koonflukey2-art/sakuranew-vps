// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/rbac";

/**
 * GET /api/users
 * Fetch all users (ADMIN only)
 */
export async function GET() {
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
        { error: "Forbidden - Only admins can view users" },
        { status: 403 }
      );
    }

    // Fetch all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { role: "asc" }, // ADMIN first, then STOCK, then EMPLOYEE
        { createdAt: "desc" }, // Newest first within each role
      ],
    });

    return NextResponse.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}