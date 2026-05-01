// 既存の Event / ArchivedEvent に対して meta.txt を Storage に backfill する。
// 月指定 (BACKFILL_MONTH=YYYY-MM)。 upsert: true なので何度走らせても安全。
//
// $ npx dotenv -e .env.backfill -- tsx scripts/backfill-meta-text.ts

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'events-archive';

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('env が不足しています');
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

const ENDPOINT_LABEL: Record<string, string> = {
  'generate-images': '新規生成',
  'generate-similar-one': '横展開',
  'improve-images': '改善',
  'edit-region': 'AI部分修正',
};
const CAMPAIGN_GOAL_LABEL: Record<string, string> = {
  cv: 'CV (購入/申込)',
  awareness: '認知拡大',
  lead: 'リード獲得',
  retargeting: 'リターゲティング',
};
const CV_POINT_LABEL: Record<string, string> = {
  purchase: '購入',
  signup: '会員登録',
  call: '電話',
  download: '資料 DL',
  other: 'その他',
};

function fmtJst(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d);
}

type EventLike = {
  eventId: number;
  createdAt: Date;
  abSystemUserId: string;
  abSystemUserName: string | null;
  endpoint: string;
  model: string | null;
  genre: string | null;
  subGenre: string | null;
  gender: string | null;
  ageGroup: string | null;
  platform: string | null;
  appealType: string | null;
  appealText: string | null;
  additionalNote: string | null;
  campaignGoal: string | null;
  cvPointType: string | null;
  landingPageUrl: string | null;
  imageCount: number;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  hitScore: number | null;
  rating: number | null;
};

function buildMetaText(ev: EventLike): string {
  const dash = (v: string | null | undefined) => v ?? '—';
  return [
    '═══════════════════════════════════════',
    '   ab-insights 工程情報',
    '═══════════════════════════════════════',
    '',
    `工程ID        : ${ev.eventId}`,
    `日時 (JST)    : ${fmtJst(ev.createdAt)}`,
    `ユーザー名    : ${dash(ev.abSystemUserName)}`,
    `ユーザーID    : ${ev.abSystemUserId}`,
    `作業種別      : ${ENDPOINT_LABEL[ev.endpoint] ?? ev.endpoint} (${ev.endpoint})`,
    `モデル        : ${dash(ev.model)}`,
    '',
    '─── ターゲット ──────────────────────',
    `ジャンル        : ${dash(ev.genre)}`,
    `サブジャンル    : ${dash(ev.subGenre)}`,
    `性別            : ${dash(ev.gender)}`,
    `年齢層          : ${dash(ev.ageGroup)}`,
    `プラットフォーム: ${dash(ev.platform)}`,
    '',
    '─── キャンペーン ────────────────────',
    `目的          : ${ev.campaignGoal ? CAMPAIGN_GOAL_LABEL[ev.campaignGoal] ?? ev.campaignGoal : '—'}`,
    `CV ポイント   : ${ev.cvPointType ? CV_POINT_LABEL[ev.cvPointType] ?? ev.cvPointType : '—'}`,
    `LP URL        : ${dash(ev.landingPageUrl)}`,
    '',
    '─── 訴求 ────────────────────────────',
    `訴求タイプ    : ${dash(ev.appealType)}`,
    '訴求文        :',
    ev.appealText ? ev.appealText : '  —',
    '',
    ev.additionalNote ? `追加メモ      :\n${ev.additionalNote}\n` : '',
    '─── シグナル / 評価 ─────────────────',
    `画像枚数      : ${ev.imageCount}`,
    `DL            : ${ev.downloaded ? 'はい' : 'いいえ'}`,
    `横展開        : ${ev.horizontallyExpanded ? 'はい' : 'いいえ'}`,
    `AI編集        : ${ev.aiEdited ? 'はい' : 'いいえ'}`,
    `刺さり度      : ${ev.hitScore !== null ? ev.hitScore.toFixed(2) : '—'}`,
    `評価 (1-5)    : ${ev.rating ?? '—'}`,
  ].join('\n');
}

function buildMetaKey(ev: { abSystemUserId: string; abSystemUserName: string | null; createdAt: Date; eventId: number }): string {
  const userPart = sanitizeForFilename(ev.abSystemUserName ?? ev.abSystemUserId, 40);
  const datePart = jstFileStamp(ev.createdAt);
  const folder = jstYearMonthFolder(ev.createdAt);
  return `${folder}/e${ev.eventId}_${userPart}_${datePart}/meta.txt`;
}

async function uploadMeta(ev: EventLike): Promise<boolean> {
  const text = buildMetaText(ev);
  const key = buildMetaKey({
    abSystemUserId: ev.abSystemUserId,
    abSystemUserName: ev.abSystemUserName,
    createdAt: ev.createdAt,
    eventId: ev.eventId,
  });
  const buf = Buffer.from(text, 'utf-8');
  const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
    contentType: 'text/plain',
    upsert: true,
  });
  if (error) {
    console.warn(`✗ ${key}: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  const targetMonth =
    process.env.BACKFILL_MONTH ??
    (() => {
      const now = new Date(Date.now() + JST_OFFSET_MS);
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
  const [y, m] = targetMonth.split('-').map(Number);
  const gte = new Date(Date.UTC(y, m - 1, 1) - JST_OFFSET_MS);
  const lt = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);

  console.log(`📦 meta.txt backfill: ${targetMonth}`);

  const archived = await prisma.archivedEvent.findMany({
    where: { createdAt: { gte, lt } },
    orderBy: { createdAt: 'asc' },
  });
  const current = await prisma.event.findMany({
    where: { createdAt: { gte, lt } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`  ArchivedEvent: ${archived.length} / Event(現役): ${current.length}`);

  let ok = 0;
  let ng = 0;
  for (const ev of archived) {
    const success = await uploadMeta({
      eventId: ev.originalEventId,
      createdAt: ev.createdAt,
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      endpoint: ev.endpoint,
      model: ev.model,
      genre: ev.genre,
      subGenre: ev.subGenre,
      gender: ev.gender,
      ageGroup: ev.ageGroup,
      platform: ev.platform,
      appealType: ev.appealType,
      appealText: ev.appealText,
      additionalNote: ev.additionalNote,
      campaignGoal: ev.campaignGoal,
      cvPointType: ev.cvPointType,
      landingPageUrl: ev.landingPageUrl,
      imageCount: ev.imageCount,
      downloaded: ev.downloaded,
      horizontallyExpanded: ev.horizontallyExpanded,
      aiEdited: ev.aiEdited,
      hitScore: ev.hitScore,
      rating: ev.rating,
    });
    success ? ok++ : ng++;
    if (ok % 50 === 0 && ok > 0) console.log(`  ... ${ok} 件アップロード済`);
  }
  for (const ev of current) {
    const success = await uploadMeta({
      eventId: ev.id,
      createdAt: ev.createdAt,
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      endpoint: ev.endpoint,
      model: ev.model,
      genre: ev.genre,
      subGenre: ev.subGenre,
      gender: ev.gender,
      ageGroup: ev.ageGroup,
      platform: ev.platform,
      appealType: ev.appealType,
      appealText: ev.appealText,
      additionalNote: ev.additionalNote,
      campaignGoal: ev.campaignGoal,
      cvPointType: ev.cvPointType,
      landingPageUrl: ev.landingPageUrl,
      imageCount: ev.imageCount,
      downloaded: ev.downloaded,
      horizontallyExpanded: ev.horizontallyExpanded,
      aiEdited: ev.aiEdited,
      hitScore: ev.hitScore,
      rating: ev.rating,
    });
    success ? ok++ : ng++;
  }

  console.log(`\n✅ meta.txt backfill 完了: 成功=${ok} 失敗=${ng}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
