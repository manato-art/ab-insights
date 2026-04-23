// GET /api/health
// 認証不要のヘルスチェック。DB 接続確認のみ行う。
// ab-system や uptime 監視から叩く用。
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
// 常に実行時の状態を返す (キャッシュさせない)
export const dynamic = 'force-dynamic';

export async function GET() {
  let dbConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (err) {
    console.error('[health] DB 接続確認に失敗:', err);
  }

  return NextResponse.json(
    {
      status: dbConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dbConnected,
    },
    { status: dbConnected ? 200 : 503 }
  );
}
