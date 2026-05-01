// 4 月分の ArchivedEventImage の 64x64 サムネを Supabase Storage に backfill する 1 回限りスクリプト。
// 本番 Neon に接続 + 本番 Supabase Storage にアップロード。
// 冪等 (既にあるキーは上書き)。 fullStorageKey が null の image だけが対象。
//
// 実行:
//   $ vercel env pull .env.production --environment=production --yes
//   $ npx dotenv -e .env.production -- tsx scripts/backfill-april-thumbnails.ts
//   (.env.production は実行後に削除推奨)

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'events-archive';

if (!DATABASE_URL) {
  console.error('DATABASE_URL が未設定');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// ヘルパ (event-archive.ts のロジックを再現。 sharp は不要 = 既に WebP なので)
// ============================================================
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstYearMonthFolder(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`;
}

function jstFileStamp(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return (
    `${j.getUTCFullYear()}${String(j.getUTCMonth() + 1).padStart(2, '0')}${String(j.getUTCDate()).padStart(2, '0')}` +
    `_${String(j.getUTCHours()).padStart(2, '0')}${String(j.getUTCMinutes()).padStart(2, '0')}`
  );
}

function jstDateTimeSec(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return (
    `${j.getUTCFullYear()}/${String(j.getUTCMonth() + 1).padStart(2, '0')}/${String(j.getUTCDate()).padStart(2, '0')}` +
    ` ${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}:${String(j.getUTCSeconds()).padStart(2, '0')}`
  );
}

function sanitizeForFilename(s: string, max = 80): string {
  const out = s
    .normalize('NFC')
    .replace(/[^A-Za-z0-9_\-.@]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out.length === 0) return 'unknown';
  return out.length > max ? out.slice(0, max) : out;
}

function buildStorageKey(opts: {
  abSystemUserId: string;
  abSystemUserName: string | null;
  createdAt: Date;
  imageIndex: number;
  eventId: number;
}): string {
  const userPart = sanitizeForFilename(
    opts.abSystemUserName ?? opts.abSystemUserId,
    40,
  );
  const datePart = jstFileStamp(opts.createdAt);
  const folder = jstYearMonthFolder(opts.createdAt);
  const eventFolder = `e${opts.eventId}_${userPart}_${datePart}`;
  return `${folder}/${eventFolder}/${opts.imageIndex}.webp`;
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('🔍 4 月分の ArchivedEvent (画像本体未保存) を取得中...');

  const apr1Utc = new Date(Date.UTC(2026, 2, 31, 15, 0, 0)); // = 2026-04-01 00:00 JST
  const may1Utc = new Date(Date.UTC(2026, 3, 30, 15, 0, 0)); // = 2026-05-01 00:00 JST

  const events = await prisma.archivedEvent.findMany({
    where: { createdAt: { gte: apr1Utc, lt: may1Utc } },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`  対象: ${events.length} 工程`);
  const totalImages = events.reduce((s, e) => s + e.images.length, 0);
  const haveThumb = events.reduce(
    (s, e) => s + e.images.filter((i) => i.thumbnail).length,
    0,
  );
  console.log(`  画像レコード合計: ${totalImages} 件 / うちサムネ有り: ${haveThumb} 件`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const ev of events) {
    // event 単位の metadata
    const baseMeta: Record<string, string> = {
      eventId: String(ev.originalEventId),
      abSystemUserId: ev.abSystemUserId,
      endpoint: ev.endpoint,
      createdAtJst: jstDateTimeSec(ev.createdAt),
      backfilled: '1',
    };
    if (ev.abSystemUserName) baseMeta.userName = ev.abSystemUserName;
    if (ev.genre) baseMeta.genre = ev.genre;
    if (ev.subGenre) baseMeta.subGenre = ev.subGenre;
    if (ev.gender) baseMeta.gender = ev.gender;
    if (ev.ageGroup) baseMeta.ageGroup = ev.ageGroup;
    if (ev.platform) baseMeta.platform = ev.platform;
    if (ev.appealType) baseMeta.appealType = ev.appealType;
    if (ev.appealText) baseMeta.appealText = ev.appealText.slice(0, 500);
    if (ev.campaignGoal) baseMeta.campaignGoal = ev.campaignGoal;
    if (ev.cvPointType) baseMeta.cvPointType = ev.cvPointType;
    if (ev.landingPageUrl) baseMeta.landingPageUrl = ev.landingPageUrl;
    if (ev.model) baseMeta.model = ev.model;

    for (const img of ev.images) {
      if (!img.thumbnail) {
        skipped++;
        continue;
      }
      // 既に保存済 (前回 backfill 走った)ならスキップ
      if (img.fullStorageKey) {
        skipped++;
        continue;
      }

      const storageKey = buildStorageKey({
        abSystemUserId: ev.abSystemUserId,
        abSystemUserName: ev.abSystemUserName,
        createdAt: ev.createdAt,
        imageIndex: img.imageIndex,
        eventId: ev.originalEventId,
      });

      const metadata = {
        ...baseMeta,
        imageIndex: String(img.imageIndex),
      };

      // Buffer で渡す (WebP として)
      const buf = Buffer.from(img.thumbnail);
      const { error } = await sb.storage.from(BUCKET).upload(storageKey, buf, {
        contentType: 'image/webp',
        upsert: true,
        metadata,
      });
      if (error) {
        console.warn(
          `  ✗ event=${ev.originalEventId} image=${img.imageIndex}: ${error.message}`,
        );
        failed++;
        continue;
      }
      // DB の fullStorageKey を更新
      await prisma.archivedEventImage.update({
        where: { id: img.id },
        data: { fullStorageKey: storageKey },
      });
      uploaded++;
      if (uploaded % 50 === 0) {
        console.log(`  ... ${uploaded} 枚アップロード済`);
      }
    }
  }

  console.log('\n✅ backfill 完了');
  console.log(`  アップロード成功: ${uploaded} 枚`);
  console.log(`  スキップ (サムネ無 or 既存): ${skipped} 枚`);
  console.log(`  失敗: ${failed} 枚`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
