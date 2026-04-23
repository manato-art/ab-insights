// Prisma Client シングルトン
// - Prisma 7 は driver adapter が必須。ローカル SQLite は better-sqlite3 adapter を使う。
// - Vercel (Postgres) に切り替える時は @prisma/adapter-pg 等に差替え。
// - dev 中のホットリロードで接続が増殖しないよう globalThis にキャッシュ。
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  // 'file:' プレフィクスを取り除く (better-sqlite3 は生ファイルパスを要求)
  const filePath = url.replace(/^file:/, '');
  const adapter = new PrismaBetterSqlite3({ url: filePath });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
