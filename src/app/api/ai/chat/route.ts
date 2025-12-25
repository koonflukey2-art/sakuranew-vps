import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, provider, sessionId } = body;

    // ดึง config ของ provider
    const config = await prisma.aiConfig.findFirst({
      where: {
        userId: user.id,
        provider,
        isValid: true,
      },
    });

    if (!config) {
      return NextResponse.json(
        { error: `${provider} not configured or invalid` },
        { status: 400 }
      );
    }

    // ดึง session หรือสร้างใหม่
    let session;
    if (sessionId) {
      session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId: user.id,
          provider,
          title: message.substring(0, 50),
        },
        include: { messages: true },
      });
    }

    if (!session || session.userId !== user.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // บันทึกข้อความของ user
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "USER",
        content: message,
      },
    });

    // ดึงข้อมูลระบบสำหรับ context
    const systemContext = await getSystemContext(user.id);

    // ส่งไปยัง AI
    const apiKey = decrypt(config.apiKey);
    let aiResponse = "";

    if (provider === "GEMINI") {
      aiResponse = await callGemini(apiKey, message, session.messages, systemContext);
    } else if (provider === "OPENAI") {
      aiResponse = await callOpenAI(apiKey, message, session.messages, systemContext, config.modelName || undefined);
    } else if (provider === "N8N") {
      aiResponse = await callN8N(apiKey, message, systemContext);
    }

    // บันทึกข้อความจาก AI
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "ASSISTANT",
        content: aiResponse,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      message: assistantMessage,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}

// ดึงข้อมูลระบบแบบละเอียด สำหรับ RAG
async function getSystemContext(userId: string) {
  const [products, campaigns, budgets, notifications] = await Promise.all([
    prisma.product.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.adCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.budget.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.notification.findMany({
      where: { userId, isRead: false },
      take: 10,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  // คำนวณ statistics
  const totalProducts = products.length;
  const lowStockProducts = products.filter(p => p.quantity < p.minStockLevel);
  const outOfStockProducts = products.filter(p => p.quantity === 0);
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.quantity * p.costPrice), 0);
  const potentialRevenue = products.reduce((sum, p) => sum + (p.quantity * p.sellPrice), 0);
  const potentialProfit = potentialRevenue - totalInventoryValue;

  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
  const totalAdSpend = campaigns.reduce((sum, c) => sum + c.spent, 0);
  const totalAdBudget = campaigns.reduce((sum, c) => sum + c.budget, 0);
  const totalReach = campaigns.reduce((sum, c) => sum + c.reach, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const avgROI = campaigns.length > 0
    ? campaigns.reduce((sum, c) => sum + c.roi, 0) / campaigns.length
    : 0;

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalBudgetSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const budgetRemaining = totalBudget - totalBudgetSpent;

  // หา top performers
  const topSellingCategories = products.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + p.quantity;
    return acc;
  }, {} as Record<string, number>);

  const topCampaigns = campaigns
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 5)
    .map(c => ({
      name: c.campaignName,
      platform: c.platform,
      roi: c.roi,
      conversions: c.conversions
    }));

  return {
    // Raw data
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      quantity: p.quantity,
      minStockLevel: p.minStockLevel,
      costPrice: p.costPrice,
      sellPrice: p.sellPrice,
      profit: p.sellPrice - p.costPrice,
      totalValue: p.quantity * p.costPrice,
      potentialRevenue: p.quantity * p.sellPrice
    })),
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.campaignName,
      platform: c.platform,
      budget: c.budget,
      spent: c.spent,
      reach: c.reach,
      clicks: c.clicks,
      conversions: c.conversions,
      roi: c.roi,
      status: c.status,
      ctr: c.reach > 0 ? (c.clicks / c.reach * 100).toFixed(2) : 0,
      conversionRate: c.clicks > 0 ? (c.conversions / c.clicks * 100).toFixed(2) : 0
    })),
    budgets: budgets.map(b => ({
      id: b.id,
      purpose: b.purpose,
      amount: b.amount,
      spent: b.spent,
      remaining: b.amount - b.spent,
      percentUsed: ((b.spent / b.amount) * 100).toFixed(1),
      startDate: b.startDate,
      endDate: b.endDate
    })),

    // Statistics & Insights
    statistics: {
      inventory: {
        totalProducts,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        totalValue: totalInventoryValue,
        potentialRevenue,
        potentialProfit,
        averageProductValue: totalProducts > 0 ? totalInventoryValue / totalProducts : 0
      },
      advertising: {
        totalCampaigns: campaigns.length,
        activeCampaigns: activeCampaigns.length,
        totalSpent: totalAdSpend,
        totalBudget: totalAdBudget,
        budgetUtilization: totalAdBudget > 0 ? (totalAdSpend / totalAdBudget * 100).toFixed(1) : 0,
        totalReach,
        totalClicks,
        totalConversions,
        avgROI: avgROI.toFixed(2),
        avgCTR: totalReach > 0 ? (totalClicks / totalReach * 100).toFixed(2) : 0,
        avgConversionRate: totalClicks > 0 ? (totalConversions / totalClicks * 100).toFixed(2) : 0
      },
      budget: {
        totalBudget,
        totalSpent: totalBudgetSpent,
        remaining: budgetRemaining,
        percentUsed: totalBudget > 0 ? (totalBudgetSpent / totalBudget * 100).toFixed(1) : 0
      }
    },

    // Alerts & Recommendations
    alerts: {
      lowStock: lowStockProducts.map(p => ({
        name: p.name,
        current: p.quantity,
        minimum: p.minStockLevel,
        shortage: p.minStockLevel - p.quantity
      })),
      outOfStock: outOfStockProducts.map(p => p.name),
      overBudget: budgets.filter(b => b.spent > b.amount).map(b => ({
        purpose: b.purpose,
        budget: b.amount,
        spent: b.spent,
        overBy: b.spent - b.amount
      })),
      lowPerformingCampaigns: campaigns.filter(c => c.roi < 1).map(c => ({
        name: c.campaignName,
        platform: c.platform,
        roi: c.roi
      }))
    },

    // Top Performers
    topPerformers: {
      categories: topSellingCategories,
      campaigns: topCampaigns,
      profitableProducts: products
        .sort((a, b) => (b.sellPrice - b.costPrice) - (a.sellPrice - a.costPrice))
        .slice(0, 5)
        .map(p => ({
          name: p.name,
          profit: p.sellPrice - p.costPrice,
          margin: ((p.sellPrice - p.costPrice) / p.sellPrice * 100).toFixed(1)
        }))
    },

    // Recent notifications
    recentAlerts: notifications.map(n => n.message)
  };
}

// AI API calls
async function callGemini(
  apiKey: string,
  message: string,
  history: any[],
  context: any
): Promise<string> {
  const systemPrompt = `You are an expert e-commerce business analyst and advisor with access to real-time business data.

Your capabilities:
- Analyze inventory, sales, and marketing performance
- Provide data-driven recommendations
- Predict trends and suggest optimizations
- Answer questions about products, campaigns, and budgets
- Calculate and explain business metrics

Current Business Data:

INVENTORY OVERVIEW:
- Total Products: ${context.statistics.inventory.totalProducts}
- Low Stock Items: ${context.statistics.inventory.lowStockCount}
- Out of Stock: ${context.statistics.inventory.outOfStockCount}
- Total Inventory Value: ฿${context.statistics.inventory.totalValue.toLocaleString()}
- Potential Revenue: ฿${context.statistics.inventory.potentialRevenue.toLocaleString()}
- Potential Profit: ฿${context.statistics.inventory.potentialProfit.toLocaleString()}

ADVERTISING PERFORMANCE:
- Total Campaigns: ${context.statistics.advertising.totalCampaigns}
- Active Campaigns: ${context.statistics.advertising.activeCampaigns}
- Total Ad Spend: ฿${context.statistics.advertising.totalSpent.toLocaleString()}
- Average ROI: ${context.statistics.advertising.avgROI}x
- Total Reach: ${context.statistics.advertising.totalReach.toLocaleString()}
- Total Clicks: ${context.statistics.advertising.totalClicks.toLocaleString()}
- Total Conversions: ${context.statistics.advertising.totalConversions.toLocaleString()}
- Average CTR: ${context.statistics.advertising.avgCTR}%
- Average Conversion Rate: ${context.statistics.advertising.avgConversionRate}%

BUDGET STATUS:
- Total Budget: ฿${context.statistics.budget.totalBudget.toLocaleString()}
- Total Spent: ฿${context.statistics.budget.totalSpent.toLocaleString()}
- Remaining: ฿${context.statistics.budget.remaining.toLocaleString()}
- Budget Utilization: ${context.statistics.budget.percentUsed}%

PRODUCTS (Top 10):
${context.products.slice(0, 10).map((p: any) =>
  `- ${p.name} (${p.category}): ${p.quantity} units, ฿${p.sellPrice}, Profit/unit: ฿${p.profit}`
).join('\n')}

CAMPAIGNS:
${context.campaigns.slice(0, 10).map((c: any) =>
  `- ${c.name} (${c.platform}): ฿${c.spent}/฿${c.budget}, ROI: ${c.roi}x, Conversions: ${c.conversions}, Status: ${c.status}`
).join('\n')}

ALERTS & RECOMMENDATIONS:
${context.alerts.lowStock.length > 0 ? `
Low Stock Items (${context.alerts.lowStock.length}):
${context.alerts.lowStock.slice(0, 5).map((item: any) =>
  `- ${item.name}: ${item.current}/${item.minimum} (shortage: ${item.shortage})`
).join('\n')}
` : ''}

${context.alerts.lowPerformingCampaigns.length > 0 ? `
Low Performing Campaigns:
${context.alerts.lowPerformingCampaigns.map((c: any) =>
  `- ${c.name} (${c.platform}): ROI ${c.roi}x`
).join('\n')}
` : ''}

TOP PERFORMERS:
${context.topPerformers.campaigns.map((c: any) =>
  `- ${c.name}: ROI ${c.roi}x, ${c.conversions} conversions`
).join('\n')}

When answering:
1. Be specific with numbers and data
2. Provide actionable recommendations
3. Explain your reasoning
4. Use Thai language naturally
5. Format with bullet points for clarity
6. Suggest concrete next steps

Remember: You have access to ALL business data above. Use it to provide intelligent, data-driven answers.`;

  const contents = [
    { role: "user", parts: [{ text: systemPrompt }] },
    ...history.slice(-10).map((msg) => ({
      role: msg.role === "USER" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    }
  );

  const data = await response.json();
  return data.candidates[0]?.content?.parts[0]?.text || "ไม่สามารถตอบได้";
}

async function callOpenAI(
  apiKey: string,
  message: string,
  history: any[],
  context: any,
  modelName?: string
): Promise<string> {
  const systemPrompt = `You are an expert e-commerce business analyst with access to real-time data.

Business Data Summary:
- Inventory: ${context.statistics.inventory.totalProducts} products, ${context.statistics.inventory.lowStockCount} low stock
- Ad Performance: ${context.statistics.advertising.totalCampaigns} campaigns, ${context.statistics.advertising.avgROI}x avg ROI
- Budget: ฿${context.statistics.budget.totalBudget.toLocaleString()} total, ${context.statistics.budget.percentUsed}% used

Detailed Data:
${JSON.stringify(context, null, 2)}

Provide intelligent, data-driven answers in Thai. Be specific with numbers and actionable recommendations.`;

  // ใช้ model จากการตั้งค่า ถ้ามี, ถ้าไม่มีก็ใช้ gpt-4o-mini เป็นค่าเริ่มต้น
  const model = (modelName && modelName.trim()) || "gpt-4o-mini";

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((msg) => ({
      role: msg.role.toLowerCase(),
      content: msg.content,
    })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();
  return data.choices[0]?.message?.content || "ไม่สามารถตอบได้";
}

async function callN8N(webhookUrl: string, message: string, context: any): Promise<string> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
  });

  const data = await response.json();
  return data.response || data.message || "No response";
}
