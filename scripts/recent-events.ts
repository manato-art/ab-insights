import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL_UNPOOLED!,
  }),
});

async function main() {
  const rows = await prisma.event.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      endpoint: true,
      abSystemUserName: true,
      imageCount: true,
      createdAt: true,
    },
  });
  const now = Date.now();
  console.log(`現在 (JST): ${new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)}`);
  for (const r of rows) {
    const jst = new Date(r.createdAt.getTime() + 9 * 60 * 60 * 1000);
    const ageMin = Math.floor((now - r.createdAt.getTime()) / 60000);
    console.log(
      `#${r.id} | ${jst.toISOString().slice(0, 19).replace('T', ' ')} JST (${ageMin} 分前) | ${r.endpoint} | ${r.abSystemUserName ?? '—'} | ${r.imageCount} 枚`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
