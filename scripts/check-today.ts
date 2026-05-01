// 今日 (JST) の生成枚数の整合性チェック
// 本番 Neon と Supabase Storage を比較

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
});
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  // 今日 (2026-05-01 JST) の範囲 (UTC)
  const now = new Date();
  const j = new Date(now.getTime() + 9 * 60 * 60 * 1000); // JST
  const y = j.getUTCFullYear();
  const m = j.getUTCMonth();
  const d = j.getUTCDate();
  const gte = new Date(Date.UTC(y, m, d) - 9 * 60 * 60 * 1000);
  const lt = new Date(Date.UTC(y, m, d + 1) - 9 * 60 * 60 * 1000);
  const todayStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  console.log(`📅 今日 (JST): ${todayStr}`);
  console.log(`   範囲(UTC): ${gte.toISOString()} 〜 ${lt.toISOString()}\n`);

  // Event (現役) 集計
  const [evCnt, evImgSum, evDl, evImgRows, evWithKey] = await Promise.all([
    prisma.event.count({ where: { createdAt: { gte, lt } } }),
    prisma.event.aggregate({
      where: { createdAt: { gte, lt } },
      _sum: { imageCount: true },
    }),
    prisma.event.count({
      where: { createdAt: { gte, lt }, downloaded: true },
    }),
    prisma.eventImage.count({
      where: { event: { createdAt: { gte, lt } } },
    }),
    prisma.eventImage.count({
      where: {
        event: { createdAt: { gte, lt } },
        fullStorageKey: { not: null },
      },
    }),
  ]);

  // ArchivedEvent (今日分は通常 0)
  const [arCnt, arImgSum, arImgRows, arWithKey] = await Promise.all([
    prisma.archivedEvent.count({ where: { createdAt: { gte, lt } } }),
    prisma.archivedEvent.aggregate({
      where: { createdAt: { gte, lt } },
      _sum: { imageCount: true },
    }),
    prisma.archivedEventImage.count({
      where: { event: { createdAt: { gte, lt } } },
    }),
    prisma.archivedEventImage.count({
      where: {
        event: { createdAt: { gte, lt } },
        fullStorageKey: { not: null },
      },
    }),
  ]);

  // ユーザー別工程一覧
  const userBreakdown = await prisma.event.groupBy({
    by: ['abSystemUserId'],
    where: { createdAt: { gte, lt } },
    _count: { _all: true },
    _sum: { imageCount: true },
  });

  // Storage の今日のフォルダ
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  const { data: folders } = await sb.storage
    .from('events-archive')
    .list(ym, { limit: 1000 });
  const todayFolderPrefix = `${todayStr.slice(0, 10).replace(/-/g, '').slice(0, 8)}`;
  // 工程フォルダ名は「e{id}_user_YYYYMMDD_HHmm」 なので 今日の YYYYMMDD でフィルタ
  const todayDateStamp = `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  const todayFolders = (folders ?? []).filter((f) =>
    f.name.includes(`_${todayDateStamp}_`),
  );
  let storageWebp = 0;
  let storageTxt = 0;
  for (const folder of todayFolders) {
    const { data: files } = await sb.storage
      .from('events-archive')
      .list(`${ym}/${folder.name}`, { limit: 1000 });
    for (const f of files ?? []) {
      if (f.name.endsWith('.webp')) storageWebp++;
      else if (f.name.endsWith('.txt')) storageTxt++;
    }
  }

  console.log('===== 本番 Neon DB =====');
  console.log('Event (現役):');
  console.log(`  工程数              : ${evCnt}`);
  console.log(`  imageCount 合計     : ${evImgSum._sum.imageCount ?? 0}`);
  console.log(`  EventImage 行数     : ${evImgRows}`);
  console.log(`  fullStorageKey あり : ${evWithKey}`);
  console.log(`  DL 済工程           : ${evDl}`);
  if (arCnt > 0) {
    console.log('ArchivedEvent (今日アーカイブ済):');
    console.log(`  工程数              : ${arCnt}`);
    console.log(`  imageCount 合計     : ${arImgSum._sum.imageCount ?? 0}`);
    console.log(`  ArchivedEventImage  : ${arImgRows}`);
    console.log(`  fullStorageKey あり : ${arWithKey}`);
  }
  const totalCnt = evCnt + arCnt;
  const totalSum = (evImgSum._sum.imageCount ?? 0) + (arImgSum._sum.imageCount ?? 0);
  const totalImgRows = evImgRows + arImgRows;
  const totalKeys = evWithKey + arWithKey;
  console.log('Combined:');
  console.log(`  総工程数            : ${totalCnt}`);
  console.log(`  総 imageCount       : ${totalSum}`);
  console.log(`  総 Image 行数       : ${totalImgRows}`);
  console.log(`  Storage に保存済    : ${totalKeys}`);

  console.log('\n===== Supabase Storage (今日のフォルダ) =====');
  console.log(`  工程フォルダ数      : ${todayFolders.length}`);
  console.log(`  .webp ファイル数    : ${storageWebp}`);
  console.log(`  .txt ファイル数     : ${storageTxt}`);

  console.log('\n===== 整合性チェック =====');
  const checks: { name: string; expected: number; actual: number; ok: boolean }[] = [
    {
      name: 'imageCount 合計 vs EventImage 行数',
      expected: totalSum,
      actual: totalImgRows,
      ok: totalSum === totalImgRows,
    },
    {
      name: '工程数 vs Storage 工程フォルダ数',
      expected: totalCnt,
      actual: todayFolders.length,
      ok: totalCnt === todayFolders.length,
    },
    {
      name: '工程数 vs .txt ファイル数',
      expected: totalCnt,
      actual: storageTxt,
      ok: totalCnt === storageTxt,
    },
    {
      name: 'Image 行数 vs .webp ファイル数',
      expected: totalImgRows,
      actual: storageWebp,
      ok: totalImgRows === storageWebp,
    },
    {
      name: 'fullStorageKey あり vs .webp ファイル数',
      expected: totalKeys,
      actual: storageWebp,
      ok: totalKeys === storageWebp,
    },
  ];
  for (const c of checks) {
    console.log(
      `  ${c.ok ? '✅' : '⚠️ '} ${c.name}: 期待=${c.expected} / 実際=${c.actual}`,
    );
  }

  console.log('\n===== ユーザー別 (今日) =====');
  for (const u of userBreakdown) {
    console.log(
      `  ${u.abSystemUserId}: 工程=${u._count._all} / 画像=${u._sum.imageCount ?? 0}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
