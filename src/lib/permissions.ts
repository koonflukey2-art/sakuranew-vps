import { prisma } from "@/lib/db";

export async function checkPermission(
  userId: string,
  requiredRole: "ADMIN" | "STOCK" | "EMPLOYEE"
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) return false;

    const roleHierarchy: Record<string, number> = {
      ADMIN: 3,
      STOCK: 2,
      EMPLOYEE: 1,
    };

    const userRoleLevel = roleHierarchy[user.role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    return userRoleLevel >= requiredRoleLevel;
  } catch (error) {
    console.error("Permission check error:", error);
    return false;
  }
}
