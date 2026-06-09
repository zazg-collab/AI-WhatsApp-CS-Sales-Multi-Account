import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@hermes.local';
  const password = process.env.SEED_OWNER_PASSWORD ?? 'changeme123';
  const passwordHash = await bcrypt.hash(password, 10);

  const owner = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Owner',
      email,
      passwordHash,
      role: Role.owner,
    },
  });

  console.log(`Seeded owner user: ${owner.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
