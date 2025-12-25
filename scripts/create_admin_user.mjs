import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
const name = process.argv[4] || "Admin";

if (!email || !password) {
  console.error("Usage: node scripts/create_admin_user.mjs <email> <password> [name]");
  process.exit(1);
}

const main = async () => {
  const hashed = hashPasswordScrypt(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hashed,
      role: "ADMIN",
      lastLogin: null,
    },
    create: {
      email,
      name,
      password: hashed,
      role: "ADMIN",
      clerkId: null,
      organizationId: null,
    },
    select: { id: true, email: true, role: true },
  });

  // ทำให้ clerkId ใช้งานได้แบบเดิม (ตามโค้ดคุณใน sign-up)
  await prisma.user.update({
    where: { id: user.id },
    data: { clerkId: user.id },
  });

  console.log("OK:", user);
};

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
