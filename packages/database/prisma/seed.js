// ponytail: plain JS seed — avoids ts-node + tsconfig.base.json dependency in Docker
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const email = process.env.SEED_OWNER_EMAIL ?? 'owner@hermes.local';
const password = process.env.SEED_OWNER_PASSWORD ?? 'changeme123';

if (!process.env.SEED_OWNER_PASSWORD) {
  console.warn('⚠️  SEED_OWNER_PASSWORD not set — using default "changeme123". Never do this in production.');
}

bcrypt.hash(password, 10)
  .then(hash => prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: 'Owner', email, passwordHash: hash, role: 'owner' },
  }))
  .then(u => { console.log(`Seeded owner: ${u.email}`); })
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
