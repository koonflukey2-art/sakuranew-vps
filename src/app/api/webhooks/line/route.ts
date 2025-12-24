// src/app/api/webhooks/line/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import {
  parseLineOrderMessage,
  replyLineMessage,
  sendLineNotify,
} from "@/lib/line-integration";
import {
  getDailySequence,
  resetDailySequenceIfNeeded,
} from "@/lib/daily-counter";

export const runtime = "nodejs";

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyLineSig(rawBody: string, channelSecret: string, signature: string) {
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  return safeEqual(hash, signature);
}

function logTargetFromEvent(event: any) {
  const src = event?.source;
  if (!src) return;

  if (src.type === "group" && src.groupId) console.log("LINE target(groupId) =", src.groupId);
  if (src.type === "room" && src.roomId) console.log("LINE target(roomId)  =", src.roomId);
  if (src.type === "user" && src.userId) console.log("LINE target(userId)  =", src.userId);

  console.log("LINE source =", JSON.stringify(src));
}

export async function POST(request: NextRequest) {
  let body = "";

  try {
    body = await request.text();

    const signature = request.headers.get("x-line-signature") || "";
    const skipSig = process.env.LINE_SKIP_SIGNATURE === "true";

    if (!signature && !skipSig) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const settings = await prisma.systemSettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const channelSecret =
      (settings as any)?.adsLineChannelSecret ??
      (settings as any)?.lineChannelSecret ??
      (settings as any)?.channelSecret ??
      null;

    const channelAccessToken =
      (settings as any)?.adsLineChannelAccessToken ??
      (settings as any)?.lineChannelAccessToken ??
      (settings as any)?.channelAccessToken ??
      null;

    const organizationId = (settings as any)?.organizationId ?? null;

    if (!channelSecret || !channelAccessToken) {
      console.error("LINE not configured (secret/accessToken missing in systemSettings)");
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (!organizationId) {
      console.error("LINE settings missing organizationId");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!skipSig) {
      const valid = verifyLineSig(body, channelSecret, signature);
      if (!valid) {
        console.error("Invalid LINE signature");
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    }

    const data = JSON.parse(body);
    const events = Array.isArray(data?.events) ? data.events : [];

    for (const event of events) {
      console.log("LINE EVENT =", JSON.stringify(event));
      logTargetFromEvent(event);
    }

    for (const event of events) {
      if (event?.type !== "message") continue;
      if (event?.message?.type !== "text") continue;

      const messageText: string = event.message.text || "";
      const replyToken: string = event.replyToken;

      const orderData = parseLineOrderMessage(messageText);
      if (!orderData) {
        await replyLineMessage(
          replyToken,
          channelAccessToken,
          "รูปแบบไม่ถูกต้อง\nใช้: [ประเภทสินค้า] [จำนวน] [ราคา]\nตัวอย่าง: 1 5 100"
        );
        continue;
      }

      const product = await prisma.product.findFirst({
        where: { organizationId, productType: orderData.productType },
      });

      if (!product) {
        await replyLineMessage(
          replyToken,
          channelAccessToken,
          `❌ ไม่พบสินค้าประเภท ${orderData.productType}\n\n` +
            `กรุณาสร้างสินค้าประเภทนี้ในระบบก่อน\n` +
            `หรือตรวจสอบหมายเลขประเภทสินค้า`
        );
        continue;
      }

      if (product.quantity < orderData.quantity) {
        await replyLineMessage(
          replyToken,
          channelAccessToken,
          `❌ สต็อกไม่พอ!\n\n` +
            `สินค้า: ${product.name}\n` +
            `สต็อกคงเหลือ: ${product.quantity} ชิ้น\n` +
            `ต้องการ: ${orderData.quantity} ชิ้น`
        );
        continue;
      }

      const remainingQty = product.quantity - orderData.quantity;

      await resetDailySequenceIfNeeded(organizationId);
      const dailySequence = await getDailySequence(organizationId);

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const orderNumber = `ORD-${dateStr}-${String(dailySequence).padStart(3, "0")}`;

      let customer = await prisma.customer.findFirst({
        where: { organizationId, phone: "LINE_DEFAULT" },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            organizationId,
            name: "ลูกค้า LINE",
            phone: "LINE_DEFAULT",
            address: "จาก LINE",
          },
        });
      }

      const unitPrice =
        orderData.quantity > 0 ? orderData.amount / orderData.quantity : 0;

      const order = await prisma.order.create({
        data: {
          organizationId,
          orderNumber,
          dailySequence,
          productType: orderData.productType,
          productName: product.name,
          quantity: orderData.quantity,
          amount: orderData.amount,
          unitPrice,
          source: "LINE",
          status: "PENDING",
          customerId: customer.id,
          orderDate: new Date(),
        },
      });

      await prisma.product.update({
        where: { id: product.id },
        data: { quantity: { decrement: orderData.quantity } },
      });

      await replyLineMessage(
        replyToken,
        channelAccessToken,
        `✅ รับออเดอร์แล้ว!\n\n` +
          `📋 รายการที่ ${dailySequence} (วันนี้)\n` +
          `เลขที่: ${order.orderNumber}\n` +
          `สินค้า: ${product.name}\n` +
          `ประเภท: ${orderData.productType}\n` +
          `จำนวน: ${orderData.quantity} ชิ้น\n` +
          `ราคา: ฿${orderData.amount.toLocaleString()}\n` +
          `คงเหลือหลังตัด: ${remainingQty} ชิ้น`
      );

      const notifyToken =
        (settings as any)?.adsLineNotifyToken ??
        (settings as any)?.lineNotifyToken ??
        null;

      const notifyOnOrder = !!(settings as any)?.notifyOnOrder;
      const notifyOnLowStock = !!(settings as any)?.notifyOnLowStock;

      if (notifyOnOrder && notifyToken) {
        await sendLineNotify(
          notifyToken,
          `🔔 ออเดอร์ใหม่ - รายการที่ ${dailySequence}\n\n` +
            `เลขที่: ${order.orderNumber}\n` +
            `สินค้า: ${product.name}\n` +
            `ประเภท: ${orderData.productType}\n` +
            `จำนวน: ${orderData.quantity} ชิ้น\n` +
            `ราคา: ฿${orderData.amount.toLocaleString()}`
        );
      }

      if (remainingQty < product.minStockLevel && notifyOnLowStock && notifyToken) {
        await sendLineNotify(
          notifyToken,
          `⚠️ สต็อกต่ำ!\nสินค้า: ${product.name}\nเหลือ: ${remainingQty} ชิ้น`
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("LINE webhook error:", e);
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "LINE webhook ready" });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
