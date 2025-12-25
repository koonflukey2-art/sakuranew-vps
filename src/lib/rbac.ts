// src/lib/rbac.ts
// ❗️ไฟล์นี้ใช้ฝั่ง Server เท่านั้น อย่านำไปใช้ใน Client Component
// สำหรับฝั่ง client ให้ใช้: "@/lib/rbac-core"

import { getCurrentUser } from "@/lib/auth";

/**
 * User Role Types
 * ADMIN: Full access to all features
 * STOCK: Access to stock management and basic features
 * EMPLOYEE: Limited access to basic features only
 */
export type UserRole = "ADMIN" | "STOCK" | "EMPLOYEE";

/**
 * Role Permissions Interface
 * Defines what each role can access
 */
export interface RolePermissions {
  canAccessDashboard: boolean;
  canAccessStock: boolean;
  canAccessBudget: boolean;
  canAccessBudgetRequests: boolean;
  canAccessAnalytics: boolean;
  canAccessAI: boolean;
  canAccessSettings: boolean;
  canAccessAutomation: boolean;
  canAccessWorkflows: boolean;
  canAccessAds: boolean;
  canAccessReports: boolean;
  canAccessProfit: boolean;
  canAccessMetrics: boolean;
  canAccessUsers: boolean;
  canAccessNotifications: boolean;
}

/**
 * Get user role from database
 * Returns the role of the currently authenticated user
 */
export async function getUserRole(): Promise<UserRole> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn("No authenticated user found, defaulting to EMPLOYEE role");
      return "EMPLOYEE";
    }

    return (user.role as UserRole) || "EMPLOYEE";
  } catch (error) {
    console.error("Error getting user role:", error);
    return "EMPLOYEE";
  }
}

/**
 * Get role permissions based on user role
 *
 * EMPLOYEE (พนักงาน) can access:
 * - Dashboard
 * - Stock Management
 * - Budget Requests
 * - Analytics
 * - AI Features (Chat, Assistant, Dashboard)
 *
 * ADMIN can access everything
 */
export function getRolePermissions(role: UserRole): RolePermissions {
  if (role === "ADMIN") {
    // Admin has full access to everything
    return {
      canAccessDashboard: true,
      canAccessStock: true,
      canAccessBudget: true,
      canAccessBudgetRequests: true,
      canAccessAnalytics: true,
      canAccessAI: true,
      canAccessSettings: true,
      canAccessAutomation: true,
      canAccessWorkflows: true,
      canAccessAds: true,
      canAccessReports: true,
      canAccessProfit: true,
      canAccessMetrics: true,
      canAccessUsers: true,
      canAccessNotifications: true,
    };
  }

  if (role === "STOCK") {
    // Stock role has access to stock management and most features
    return {
      canAccessDashboard: true,
      canAccessStock: true,
      canAccessBudget: true,
      canAccessBudgetRequests: true,
      canAccessAnalytics: true,
      canAccessAI: true,
      canAccessSettings: false, // No settings access
      canAccessAutomation: false, // No automation
      canAccessWorkflows: false, // No workflows
      canAccessAds: true,
      canAccessReports: true,
      canAccessProfit: true,
      canAccessMetrics: false,
      canAccessUsers: false, // No user management
      canAccessNotifications: true,
    };
  }

  // Employee has limited access (default role)
  return {
    canAccessDashboard: true,
    canAccessStock: true,
    canAccessBudget: false, // No budget access
    canAccessBudgetRequests: true, // Can request budgets
    canAccessAnalytics: true,
    canAccessAI: true, // Can use AI features
    canAccessSettings: false, // No settings
    canAccessAutomation: false, // No automation
    canAccessWorkflows: false, // No workflows
    canAccessAds: false, // No ads management
    canAccessReports: false, // No reports
    canAccessProfit: false, // No profit calculator
    canAccessMetrics: false, // No metrics
    canAccessUsers: false, // No user management
    canAccessNotifications: true, // Can see notifications
  };
}

/**
 * Check if user can access a specific route
 * @param routePath - The route path to check (e.g., "/dashboard", "/settings")
 * @returns boolean - Whether the user has permission
 */
export async function canAccessRoute(routePath: string): Promise<boolean> {
  const role = await getUserRole();
  const permissions = getRolePermissions(role);

  // Map routes to permissions
  const routePermissionMap: Record<string, keyof RolePermissions> = {
    "/": "canAccessDashboard",
    "/stock": "canAccessStock",
    "/budget": "canAccessBudget",
    "/budget-requests": "canAccessBudgetRequests",
    "/analytics": "canAccessAnalytics",
    "/ai-chat": "canAccessAI",
    "/ai-assistant": "canAccessAI",
    "/ai-dashboard": "canAccessAI",
    "/settings": "canAccessSettings",
    "/automation": "canAccessAutomation",
    "/workflows": "canAccessWorkflows",
    "/ads": "canAccessAds",
    "/reports": "canAccessReports",
    "/profit": "canAccessProfit",
    "/metrics": "canAccessMetrics",
    "/users": "canAccessUsers",
    "/notifications": "canAccessNotifications",
  };

  const permissionKey = routePermissionMap[routePath];

  if (!permissionKey) {
    console.warn(`No permission mapping found for route: ${routePath}`);
    return false;
  }

  return permissions[permissionKey];
}

/**
 * Check if a user has permission for a specific action
 * @param role - User role
 * @param permission - Permission to check
 * @returns boolean
 */
export function hasPermission(
  role: UserRole,
  permission: keyof RolePermissions
): boolean {
  const permissions = getRolePermissions(role);
  return permissions[permission];
}

/**
 * Get user role display name in Thai
 */
export function getRoleDisplayName(role: UserRole): string {
  const roleNames: Record<UserRole, string> = {
    ADMIN: "ผู้ดูแลระบบ",
    STOCK: "พนักงานสต๊อก",
    EMPLOYEE: "พนักงาน",
  };
  return roleNames[role] || "ไม่ระบุ";
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole();
  return role === "ADMIN";
}

/**
 * Check if user is admin or stock manager
 */
export async function canManageStock(): Promise<boolean> {
  const role = await getUserRole();
  return role === "ADMIN" || role === "STOCK";
}
