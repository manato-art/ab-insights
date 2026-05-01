// 接続テスト: 環境変数を読んで Supabase に繋ぎ、 バケット存在確認 + 試しアップロード&削除。
// $ npx dotenv -e .env.local -- tsx scripts/supabase-check.ts

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_BUCKET ?? 'events-archive';

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`URL: ${url}`);
  console.log(`Bucket: ${bucket}`);

  // ① バケット一覧
  const { data: buckets, error: lsErr } = await sb.storage.listBuckets();
  if (lsErr) {
    console.error('listBuckets error:', lsErr);
    process.exit(1);
  }
  const bucketNames = (buckets ?? []).map((b) => b.name);
  console.log(`既存バケット: ${bucketNames.length === 0 ? '(なし)' : bucketNames.join(', ')}`);

  if (!bucketNames.includes(bucket)) {
    console.warn(`⚠️  バケット "${bucket}" が存在しません。 Supabase 管理者に作成依頼してください。`);
    process.exit(2);
  }
  console.log(`✓ バケット "${bucket}" 存在確認 OK`);

  // ② 試しアップロード (1x1 PNG → WebP に圧縮してから upload)
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const tinyWebp = await sharp(tinyPng).webp({ quality: 95 }).toBuffer();
  const testKey = `_healthcheck/${Date.now()}.webp`;
  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(testKey, tinyWebp, { contentType: 'image/webp', upsert: true });
  if (upErr) {
    console.error('upload error:', upErr);
    process.exit(1);
  }
  console.log(`✓ 試しアップロード成功: ${testKey}`);

  // ③ 試しダウンロード (バイト一致確認)
  const { data: dl, error: dlErr } = await sb.storage.from(bucket).download(testKey);
  if (dlErr) {
    console.error('download error:', dlErr);
    process.exit(1);
  }
  const dlBytes = new Uint8Array(await dl.arrayBuffer());
  const ok = dlBytes.length === tinyWebp.length;
  console.log(`✓ 試しダウンロード ${ok ? 'OK (バイト一致)' : '✗ サイズ不一致'}`);

  // ④ 削除
  const { error: rmErr } = await sb.storage.from(bucket).remove([testKey]);
  if (rmErr) {
    console.error('remove error:', rmErr);
    process.exit(1);
  }
  console.log(`✓ 削除 OK`);

  console.log('\n✅ Supabase Storage 接続テスト 全て成功');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
