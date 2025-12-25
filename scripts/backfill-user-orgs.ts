import { prisma } from "../src/lib/prisma";
import { createOrganizationForUser } from "../src/lib/organization";

async function main() {
  const users = await prisma.user.findMany({
    where: { organizationId: null },
    select: { id: true, email: true },
  });

  if (users.length === 0) {
    console.log("✅ No users without organization");
    return;
  }

  for (const user of users) {
    console.log(`🔄 Creating organization for ${user.email}`);
    await createOrganizationForUser(user.id);
  }

  console.log(`✅ Backfilled ${users.length} users`);
}

main()
  .catch((error) => {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
