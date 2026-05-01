// 実 webhook 経由で full 画像 → Supabase Storage 保存をテスト。
// このスクリプトはローカル SQLite に直接 ApiToken を発行 → POST → 検証 → token 削除まで自動。
//
// $ npx dotenv -e .env.local -- tsx scripts/test-archive-webhook.ts

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const TARGET = process.env.TARGET_URL ?? 'http://localhost:3001/api/events';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'events-archive';

const adapter = new PrismaBetterSqlite3({ url: 'file:./prisma/local.db' });
const prisma = new PrismaClient({ adapter });

async function issueToken(): Promise<{ id: number; token: string }> {
  const token = 'abi_' + randomBytes(24).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const rec = await prisma.apiToken.create({
    data: { name: 'test-archive-webhook', tokenHash },
  });
  return { id: rec.id, token };
}

async function main() {
  // 1. 一時 ApiToken を発行
  const { id: tokenId, token: TOKEN } = await issueToken();
  console.log(`発行したテスト用トークン (id=${tokenId})`);

  try {
  // テスト画像: 100x100 の赤い PNG を作って base64 化
  const png = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 100, b: 100 },
    },
  })
    .png()
    .toBuffer();
  const fullBase64 = png.toString('base64');

  // 64x64 サムネ (現状仕様)
  const thumb = await sharp(png)
    .resize(64, 64)
    .webp({ quality: 80 })
    .toBuffer();
  const thumbBase64 = thumb.toString('base64');

  const payload = {
    abSystemUserId: 'test_user_archive',
    abSystemUserName: 'archive-test@example.com',
    endpoint: 'generate-images',
    model: 'gemini-3.1-flash-image-preview',
    genre: 'テストジャンル', // 日本語: ファイル名から省略され metadata に入る想定
    appealText: 'アーカイブ動作確認用',
    imageCount: 2,
    images: [
      {
        imageIndex: 0,
        thumbnail: thumbBase64,
        full: fullBase64,
        fullMimeType: 'image/png',
      },
      {
        imageIndex: 1,
        thumbnail: thumbBase64,
        full: fullBase64,
        fullMimeType: 'image/png',
      },
    ],
  };

  console.log(`POST ${TARGET}`);
  const res = await fetch(TARGET, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  console.log(`status: ${res.status}`);
  const json = (await res.json().catch(() => null)) as { eventId?: number } | null;
  console.log('response:', json);

  if (!json?.eventId) {
    console.error('eventId が返らなかったため Storage 検証スキップ');
    process.exit(1);
  }

  // Supabase に対象キーが存在するか listing で確認
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: list, error } = await sb.storage
    .from(BUCKET)
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) {
    console.error('Storage list error:', error);
    process.exit(1);
  }
  const ours = (list ?? []).filter((f) =>
    f.name.includes(`_e${json.eventId}_`),
  );
  console.log(`\nStorage に保存された画像 (eventId=${json.eventId}):`);
  for (const f of ours) {
    console.log(`  - ${f.name} (${f.metadata?.size ?? '?'} bytes)`);
  }

  if (ours.length === 2) {
    console.log('\n✅ アーカイブ webhook テスト 全て成功');

    // クリーンアップ: テストで作ったオブジェクトを削除
    await sb.storage.from(BUCKET).remove(ours.map((f) => f.name));
    console.log('test artifacts cleaned up (Storage)');
  } else {
    console.error(`\n✗ Storage に保存された画像は ${ours.length} 枚 (期待: 2)`);
    process.exitCode = 1;
  }
  } finally {
    // 一時 token は使用後 deactivate (DB から削除)
    await prisma.apiToken.delete({ where: { id: tokenId } }).catch(() => {});
    await prisma.$disconnect();
    console.log('test token cleaned up');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
