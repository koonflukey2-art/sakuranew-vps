import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";

/**
 * GET /api/products/types
 * Returns all product types with comprehensive statistics:
 * - productType number
 * - name
 * - currentStock
 * - costPrice, sellingPrice
 * - totalRevenue (from orders)
 * - totalOrders
 * - totalQuantitySold
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getOrganizationId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Get all products for this organization
    const products = await prisma.product.findMany({
      where: { organizationId: orgId },
      orderBy: { productType: "asc" },
    });

    // Get all orders grouped by product type
    const orders = await prisma.order.findMany({
      where: { organizationId: orgId },
      select: {
        productType: true,
        quantity: true,
        amount: true,
      },
    });

    // Calculate statistics per product type
    const productTypes = products.map((product) => {
      const productOrders = orders.filter(
        (o) => o.productType === product.productType
      );

      const totalRevenue = productOrders.reduce((sum, o) => sum + o.amount, 0);
      const totalOrders = productOrders.length;
      const totalQuantitySold = productOrders.reduce(
        (sum, o) => sum + o.quantity,
        0
      );

      return {
        productType: product.productType,
        name: product.name,
        currentStock: product.quantity,
        costPrice: product.costPrice,
        sellingPrice: product.sellPrice,
        totalRevenue,
        totalOrders,
        totalQuantitySold,
      };
    });

    return NextResponse.json(productTypes);
  } catch (error) {
    console.error("Failed to fetch product types:", error);
    return NextResponse.json(
      { error: "Failed to fetch product types" },
      { status: 500 }
    );
  }
}
