// Prisma Client シングルトン(lazy init)
// - Prisma 7 の prisma-client generator は driver adapter 必須。
// - Neon Postgres は @prisma/adapter-pg + pg で接続(Vercel Node ランタイム)。
// - 初回アクセスまでインスタンス化を遅延 → Vercel build 時に DATABASE_URL 未設定でもクラッシュしない。
// - Proxy でラップしない(NextAuth 等の adapter 判定を壊さないため getter で公開)。
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('[db] DATABASE_URL is not set. Vercel+Neon を設定するか .env に Postgres 接続文字列を記述してください');
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const instance = createPrismaClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = instance;
  }
  return instance;
}

// 既存コードの `import { prisma }` 互換のため getter でラップ。
// プロパティアクセス時に初めて Client を生成する。
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getPrisma(), prop);
  },
});
