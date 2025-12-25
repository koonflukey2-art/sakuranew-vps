// src/lib/organization.ts
// ฟังก์ชันช่วยเหลือสำหรับจัดการ Organization

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * ดึง Organization ID ของ user ปัจจุบัน
 * ใช้ในทุก API route ที่ต้องการ filter ข้อมูลตาม organization
 */
export async function getOrganizationId(): Promise<string | null> {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) {
      console.warn("No authenticated user found");
      return null;
    }

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
      select: { organizationId: true },
    });

    if (!dbUser || !dbUser.organizationId) {
      console.warn(`User ${clerkUser.id} has no organization`);
      return null;
    }

    return dbUser.organizationId;
  } catch (error) {
    console.error("Error getting organization ID:", error);
    return null;
  }
}

/**
 * ดึงข้อมูล Organization เต็มของ user ปัจจุบัน
 */
export async function getOrganization() {
  try {
    const clerkUser = await getCurrentUser();
    if (!clerkUser) return null;

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
      include: { organization: true },
    });

    return dbUser?.organization || null;
  } catch (error) {
    console.error("Error getting organization:", error);
    return null;
  }
}

/**
 * เช็คว่า user มี organization หรือยัง
 */
export async function hasOrganization(): Promise<boolean> {
  const orgId = await getOrganizationId();
  return orgId !== null;
}

/**
 * ดึงรายชื่อสมาชิกทั้งหมดใน organization
 */
export async function getOrganizationMembers() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) return [];

    const members = await prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return members;
  } catch (error) {
    console.error("Error getting organization members:", error);
    return [];
  }
}

/**
 * สร้าง organization ใหม่สำหรับ user
 * @param userId - User ID ที่จะสร้าง organization ให้
 * @param orgName - ชื่อ organization (optional, จะสร้างจาก email ถ้าไม่ระบุ)
 */
export async function createOrganizationForUser(
  userId: string,
  orgName?: string
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // สร้างชื่อ organization จาก email ถ้าไม่ได้ระบุ
    const name = orgName || user.email.split("@")[0] + "'s Company";
    const slug =
      user.email
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-") +
      "-" +
      Date.now();

    // สร้าง organization
    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        description: "Default organization",
      },
    });

    // อัพเดท user ให้ link กับ organization
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });

    console.log(`✅ Created organization "${name}" for user ${user.email}`);

    return org;
  } catch (error) {
    console.error("Error creating organization:", error);
    throw error;
  }
}

/**
 * เช็คว่า user มีสิทธิ์เข้าถึงข้อมูลใน organization หรือไม่
 * @param resourceOrgId - Organization ID ของ resource ที่จะเข้าถึง
 */
export async function canAccessOrganization(
  resourceOrgId: string
): Promise<boolean> {
  const userOrgId = await getOrganizationId();
  return userOrgId === resourceOrgId;
}

/**
 * ดึงสถิติของ organization
 */
export async function getOrganizationStats() {
  try {
    const orgId = await getOrganizationId();
    if (!orgId) return null;

    const [memberCount, productCount, campaignCount, budgetCount] =
      await Promise.all([
        prisma.user.count({ where: { organizationId: orgId } }),
        prisma.product.count({ where: { organizationId: orgId } }),
        prisma.adCampaign.count({ where: { organizationId: orgId } }),
        prisma.budget.count({ where: { organizationId: orgId } }),
      ]);

    return {
      members: memberCount,
      products: productCount,
      campaigns: campaignCount,
      budgets: budgetCount,
    };
  } catch (error) {
    console.error("Error getting organization stats:", error);
    return null;
  }
}