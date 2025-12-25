import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { createHash } from "crypto";

import sharp from "sharp";
import jsQR from "jsqr";

export const runtime = "nodejs";

// --------------------- utils ---------------------
function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function guessExtFromMime(mime: string) {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

function getUploadDir() {
  // แนะนำ: ตั้ง env UPLOAD_DIR บน Render เช่น /opt/render/project/src/uploads
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
}

// --------------------- QR decode ---------------------
async function decodeQrFromImageBuffer(buffer: Buffer): Promise<string | null> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return code?.data ?? null;
}

async function safeDecodeQr(buffer: Buffer): Promise<string | null> {
  try {
    return await decodeQrFromImageBuffer(buffer);
  } catch {
    return null;
  }
}

/**
 * TLV parser: tag(2 chars) + length(2 digits) + value(length)
 */
function parseTlv2Len2(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;

  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(lenStr)) break;

    const len = Number(lenStr);
    const start = i + 4;
    const end = start + len;
    if (end > payload.length) break;

    out[tag] = payload.slice(start, end);
    i = end;
  }
  return out;
}

// --------------------- OCR worker singleton ---------------------
let workerPromise: Promise<any> | null = null;

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const mod: any = await import("tesseract.js");
      const w: any = await mod.createWorker();

      if (typeof w.loadLanguage === "function") await w.loadLanguage("eng");
      if (typeof w.initialize === "function") await w.initialize("eng");
      if (typeof w.reinitialize === "function") await w.reinitialize("eng");

      if (typeof w.setParameters === "function") {
        await w.setParameters({
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: "0123456789.,Amountบาทจำนวน:： ",
        });
      }

      return w;
    })();
  }
  return workerPromise;
}

// --------------------- OCR STRICT amount ---------------------
// ✅ ห้าม fallback เป็น integer (เลขอ้างอิงจะชนะ!)
function parseMoneyStrictDecimal(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{2})$/.test(cleaned)) return null; // ต้องมี .xx
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > 500_000) return null;
  return n;
}

function pickAmountFromTextStrict(text: string): number | null {
  const t = text.replace(/\s+/g, " ").trim();

  const m1 = t.match(/(?:จำนวน|Amount)\s*[:：]?\s*([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})/i);
  if (m1?.[1]) {
    const n = parseMoneyStrictDecimal(m1[1]);
    if (n !== null) return n;
  }

  const m2 = t.match(/([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})\s*(?:บาท|THB)/i);
  if (m2?.[1]) {
    const n = parseMoneyStrictDecimal(m2[1]);
    if (n !== null) return n;
  }

  const all = [...t.matchAll(/([0-9]{1,3}(?:,[0-9]{3})*\.\d{2})/g)]
    .map((x) => parseMoneyStrictDecimal(x[1]))
    .filter((n): n is number => n !== null);

  if (all.length) return Math.max(...all);
  return null;
}

async function extractAmountByOcrStrict(buffer: Buffer): Promise<number | null> {
  const img = sharp(buffer).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return null;

  // ตัด QR ขวาออก
  const crops = [
    { left: Math.floor(w * 0.10), top: Math.floor(h * 0.60), width: Math.floor(w * 0.70), height: Math.floor(h * 0.25) },
    { left: 0, top: Math.floor(h * 0.55), width: Math.floor(w * 0.78), height: Math.floor(h * 0.45) },
  ];

  for (let pass = 0; pass < crops.length; pass++) {
    const r = crops[pass];

    const cropBuf = await img
      .clone()
      .extract(r)
      .resize({ width: Math.max(1000, r.width * 2) })
      .grayscale()
      .normalize()
      .threshold(170)
      .png()
      .toBuffer();

    const worker = await getOcrWorker();
    const res = await worker.recognize(cropBuf);

    const rawText = String(res?.data?.text || "");
    const amount = pickAmountFromTextStrict(rawText);
    if (amount !== null) return amount;
  }

  return null;
}

// --------------------- extraction main ---------------------
async function extractAmountFromReceipt(
  buffer: Buffer,
  qrText: string | null
): Promise<{
  amount: number | null;
  amountDetected: boolean;
  method: "EMV_TAG_54" | "OCR_STRICT" | "NONE";
  reason?: string;
}> {
  // 1) Tag54 จาก EMV (ถ้ามี) มักเป็นยอดเงิน
  if (qrText) {
    const tlv = parseTlv2Len2(qrText);
    const amountStr = tlv["54"];
    if (amountStr) {
      const n = Number(amountStr);
      if (Number.isFinite(n) && n > 0 && n < 1_000_000) {
        return { amount: n, amountDetected: true, method: "EMV_TAG_54" };
      }
    }
  }

  // 2) OCR STRICT
  const ocr = await extractAmountByOcrStrict(buffer);
  if (ocr !== null) {
    return { amount: ocr, amountDetected: true, method: "OCR_STRICT" };
  }

  return {
    amount: null,
    amountDetected: false,
    method: "NONE",
    reason: "QR has no amount and OCR_STRICT could not read amount.",
  };
}

// --------------------- main handler ---------------------
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!user.organizationId) {
      return NextResponse.json({ error: "Organization not found for this user" }, { status: 404 });
    }
    const orgId = user.organizationId;

    const formData = await request.formData();
    const file = formData.get("receipt") as File | null;
    const platform = (formData.get("platform") as string) || "META_ADS";
    const campaignId = (formData.get("campaignId") as string) || null;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileHash = sha256Hex(buffer);
    const qrText = await safeDecodeQr(buffer);
    const qrHash = qrText ? sha256Hex(qrText) : null;

    const existing = await prisma.adReceipt.findFirst({
      where: {
        organizationId: orgId,
        OR: [{ fileHash }, ...(qrHash ? [{ qrHash }] : [])],
      },
      select: { id: true, receiptNumber: true, amount: true, receiptUrl: true, createdAt: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "DUPLICATE_RECEIPT", message: `สลิปนี้เคยอัพโหลดแล้ว (${existing.receiptNumber})`, existing },
        { status: 409 }
      );
    }

    // Save file to UPLOAD_DIR
    const uploadsDir = getUploadDir();
    if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

    const safeExt = extname(file.name) || guessExtFromMime(file.type);
    const filename = `receipt-${Date.now()}-${Math.floor(Math.random() * 1000)}${safeExt}`;
    const filepath = join(uploadsDir, filename);

    await writeFile(filepath, buffer);

    // ใช้ route เสิร์ฟไฟล์ (ไฟล์ #4)
    const receiptUrl = `/api/uploads/${filename}`;

    const result = await extractAmountFromReceipt(buffer, qrText);

    const receipt = await prisma.adReceipt.create({
      data: {
        organizationId: orgId,
        campaignId,
        receiptNumber: `RCP-${Date.now()}`,
        platform,
        paymentMethod: "QR_CODE",
        amount: result.amount ?? 0,
        currency: "THB",
        receiptUrl,
        qrCodeData: qrText,
        fileHash,
        qrHash,
        isProcessed: false,
        paidAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      receipt,
      amount: result.amount ?? 0,
      amountDetected: result.amountDetected,
      detectMethod: result.method,
      needsManualAmount: !result.amountDetected,
      reason: result.amountDetected ? undefined : result.reason,
    });
  } catch (error: any) {
    console.error("[UPLOAD] error:", error);
    return NextResponse.json({ error: error?.message || "Upload failed" }, { status: 500 });
  }
}
