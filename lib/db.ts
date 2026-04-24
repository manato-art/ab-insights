// Prisma Client シングルトン(lazy init)
// - Prisma 7 の prisma-client generator は driver adapter 必須。
// - Neon Postgres は @prisma/adapter-pg + pg で接続(Vercel Node ランタイム)。
// - 初回アクセスまでインスタンス化を遅延 → Vercel build 時に DATABASE_URL 未設定でもクラッシュしない。
// - Proxy の get() はメソッドを bind してから返す。未 bind だと
//   $transaction 等で `this` が壊れて P2028 "Transaction not found" が起きる。
import { PrismaClient } from '@/app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // まず DATABASE_URL を見る。file:... なら SQLite 確定(ローカル開発用)。
  // Postgres の場合だけ、トランザクション対応のため UNPOOLED を優先する。
  const primary = process.env.DATABASE_URL;
  if (primary && primary.startsWith('file:')) {
    const filePath = primary.replace(/^file:/, '');
    const adapter = new PrismaBetterSqlite3({ url: 'file:' + filePath });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  const urlRaw = process.env.DATABASE_URL_UNPOOLED || primary;
  if (!urlRaw) {
    throw new Error('[db] DATABASE_URL is not set. Vercel+Neon を設定するか .env に Postgres 接続文字列を記述してください');
  }

  const adapter = new PrismaPg({ connectionString: urlRaw });
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
