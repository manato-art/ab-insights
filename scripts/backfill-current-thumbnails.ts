// 現役 Event テーブル (= 当月分以降) のサムネ画像を Supabase Storage に backfill。
// Webhook 経由の Storage upload が動いていない期間があった場合の救済用。
// 環境変数 BACKFILL_MONTH=YYYY-MM (デフォルトは当月) で対象月指定可。
//
// $ npx dotenv -e .env.backfill -- tsx scripts/backfill-current-thumbnails.ts
// (.env.backfill は DATABASE_URL_UNPOOLED + SUPABASE_* を含む)

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'events-archive';

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 必須');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

function monthRangeUtc(month: string): { gte: Date; lt: Date } {
  // month: "YYYY-MM"
  const [y, m] = month.split('-').map(Number);
  // JST の 1日 0:00 と 翌月 1日 0:00 を UTC で表現
  const gte = new Date(Date.UTC(y, m - 1, 1) - JST_OFFSET_MS);
  const lt = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
  return { gte, lt };
}

async function main() {
  const targetMonth =
    process.env.BACKFILL_MONTH ??
    (() => {
      const now = new Date(Date.now() + JST_OFFSET_MS);
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
  const range = monthRangeUtc(targetMonth);

  console.log(`📦 backfill 対象: ${targetMonth} (Event テーブル)`);
  console.log(`   範囲(UTC): ${range.gte.toISOString()} 〜 ${range.lt.toISOString()}`);

  const events = await prisma.event.findMany({
    where: { createdAt: { gte: range.gte, lt: range.lt } },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const totalImages = events.reduce((s, e) => s + e.images.length, 0);
  console.log(`   対象工程: ${events.length} / 画像レコード合計: ${totalImages}`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const ev of events) {
    for (const img of ev.images) {
      if (img.fullStorageKey) {
        skipped++;
        continue;
      }
      if (!img.thumbnail) {
        skipped++;
        continue;
      }
      const storageKey = buildStorageKey({
        abSystemUserId: ev.abSystemUserId,
        abSystemUserName: ev.abSystemUserName,
        createdAt: ev.createdAt,
        imageIndex: img.imageIndex,
        eventId: ev.id,
      });
      const buf = Buffer.from(img.thumbnail);
      const { error } = await sb.storage.from(BUCKET).upload(storageKey, buf, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (error) {
        console.warn(
          `  ✗ event=${ev.id} image=${img.imageIndex}: ${error.message}`,
        );
        failed++;
        continue;
      }
      await prisma.eventImage.update({
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
  console.log(`  スキップ (既存 or サムネ無): ${skipped} 枚`);
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
