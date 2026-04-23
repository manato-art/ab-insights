// Prisma Client シングルトン(lazy init)
// - Prisma 7 の prisma-client generator は driver adapter 必須。
// - Neon Postgres は @prisma/adapter-pg + pg で接続(Vercel Node ランタイム)。
// - 初回アクセスまでインスタンス化を遅延 → Vercel build 時に DATABASE_URL 未設定でもクラッシュしない。
// - Proxy の get() はメソッドを bind してから返す。未 bind だと
//   $transaction 等で `this` が壊れて P2028 "Transaction not found" が起きる。
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Neon の pooled URL (pgbouncer 経由) は Prisma のトランザクションと相性が悪いため
  // unpooled URL(直接接続)を優先する。ローカルで UNPOOLED が無い場合は DATABASE_URL にフォールバック。
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
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
  // 本番含めシングルトン化(毎リクエスト新規生成だとコネクションが乱立する)
  globalForPrisma.prisma = instance;
  return instance;
}

// 既存コードの `import { prisma }` 互換のため Proxy 経由で公開。
// ただし関数(メソッド)を返す際は必ず bind して本体インスタンスを `this` に固定する。
// これをしないと `prisma.$transaction(...)` の内部で this が Proxy になり、
// 以降のプロパティアクセスが毎回 Proxy 経由 → Prisma が内部でハンドルを追跡できず
// "Transaction not found" (P2028) を引き起こす。
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getPrisma();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
