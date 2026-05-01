// 画像本体を Supabase Storage に保存するヘルパ。
// - 受け取った原寸画像 (PNG/JPEG/WebP base64) を sharp で WebP (lossy q95) に圧縮
// - ファイル名: {userName|userId}_{YYYYMMDD_HHmm}_{genre|none}_{imageIndex}.webp
// - JST 基準で日付組み立て
// - upload 失敗は warn ログで握りつぶす (DB 書き込みは成功させたいため)

import 'server-only';
import sharp from 'sharp';
import { getSupabase, SUPABASE_BUCKET, isSupabaseEnabled } from './supabase';
import { JST_TIMEZONE } from './format';

const FILE_DATETIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** YYYYMMDD_HHmm を JST で生成 */
function jstFileStamp(d: Date): string {
  // en-CA で formatToParts → YYYY-MM-DD, HH:mm を組み立て
  const parts = FILE_DATETIME.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}_${map.hour}${map.minute}`;
}

/** YYYY-MM (JST) のフォルダ名を返す */
function jstYearMonthFolder(d: Date): string {
  const parts = FILE_DATETIME.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}`;
}

/**
 * Storage キーに使える形に sanitize:
 * - Supabase Storage のキーは サーバー側で URL デコードして検証されるため、 percent-encoded
 *   文字も結局 "Invalid key" で弾かれる。 → ASCII 安全文字のみに絞る。
 * - 非 ASCII (日本語等) と path 制御文字は **削除** する。 復元したい情報は upload 時の
 *   metadata で別途保存する。
 * - 過度に長い場合は切る
 */
export function sanitizeForFilename(s: string, max = 80): string {
  const out = s
    .normalize('NFC')
    // メールアドレス由来の `@` は残す (ASCII で Storage 的にも許可)
    .replace(/[^A-Za-z0-9_\-.@]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  if (out.length === 0) return 'unknown';
  return out.length > max ? out.slice(0, max) : out;
}

/**
 * 1 工程ぶんの画像本体保存用キー組み立て。
 * Supabase Storage の制約で ASCII 限定 (日本語不可)。
 *
 * 構造: `YYYY-MM/e{eventId}_{userName_or_id}_{YYYYMMDD_HHmm}/{imageIndex}.webp`
 *
 *   2026-05/e123_kaneya@cypherone.co.jp_20260501_1904/0.webp
 *   2026-05/e123_kaneya@cypherone.co.jp_20260501_1904/1.webp
 *
 * ・ 同一工程の画像が同じフォルダ内に並ぶ (どの工程でどの画像ができたか一目)
 * ・ 元の日本語フィールド (genre 等) は upload 時の metadata に保存
 *   → Supabase Dashboard で各画像をクリックすると詳細欄で確認可能
 */
export function buildStorageKey(opts: {
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

/** base64 string (data: URL プレフィクスは事前に除去想定) → Buffer */
export function base64ToBuffer(s: string): Buffer {
  const cleaned = s.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

/** WebP lossy q95 に圧縮 (視覚的可逆 = 元と区別できないがファイル小さい) */
export async function toWebpQ95(input: Buffer): Promise<Buffer> {
  return sharp(input).webp({ quality: 95, effort: 4 }).toBuffer();
}

/**
 * Storage key に対する一時的な signed URL を発行する。
 * 期限 (秒) はデフォルト 1 時間。 admin 画面でダウンロードボタンに使う想定。
 */
export async function createSignedDownloadUrl(
  storageKey: string,
  expiresInSec = 3600,
): Promise<string | null> {
  if (!isSupabaseEnabled()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(storageKey, expiresInSec);
  if (error) {
    console.warn(
      `[event-archive] signed URL 発行失敗 key=${storageKey}:`,
      error.message,
    );
    return null;
  }
  return data?.signedUrl ?? null;
}

export type UploadOneResult = {
  imageIndex: number;
  storageKey: string | null;
  error: string | null;
};

/**
 * 工程の全情報を読みやすいテキストにフォーマット。 meta.txt として Storage に置く。
 * Supabase Dashboard でクリック → プレビューで読める。
 */
export function buildMetaText(ev: {
  originalEventId?: number | null; // ArchivedEvent の場合
  id?: number; // Event の場合
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
}): string {
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
  const dt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ev.createdAt);

  const eventId = ev.originalEventId ?? ev.id ?? '?';
  const dash = (v: string | null | undefined) => v ?? '—';

  return [
    '═══════════════════════════════════════',
    '   ab-insights 工程情報',
    '═══════════════════════════════════════',
    '',
    `工程ID        : ${eventId}`,
    `日時 (JST)    : ${dt}`,
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
    `訴求文        :`,
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

/**
 * 工程フォルダ内の meta.txt のキーを返す
 */
export function buildMetaKey(opts: {
  abSystemUserId: string;
  abSystemUserName: string | null;
  createdAt: Date;
  eventId: number;
}): string {
  const userPart = sanitizeForFilename(
    opts.abSystemUserName ?? opts.abSystemUserId,
    40,
  );
  const datePart = jstFileStamp(opts.createdAt);
  const folder = jstYearMonthFolder(opts.createdAt);
  return `${folder}/e${opts.eventId}_${userPart}_${datePart}/meta.txt`;
}

/**
 * 工程フォルダの meta.txt を upload。
 */
export async function uploadMetaTextFile(opts: {
  storageKey: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'supabase not configured' };
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'supabase client init failed' };
  try {
    const buf = Buffer.from(opts.text, 'utf-8');
    const { error } = await sb.storage
      .from(SUPABASE_BUCKET)
      .upload(opts.storageKey, buf, {
        contentType: 'text/plain',
        upsert: true,
      });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 1 枚アップロード (失敗しても throw せず、エラー文字列を返す)。
 * Supabase 未設定なら storageKey:null で skip。
 *
 * Storage object metadata に元の userName / genre / eventId を保存し、
 * Supabase Dashboard でファイル詳細を見るとき日本語名が確認できるようにする。
 */
export async function uploadOneImageToArchive(opts: {
  fullBase64: string;
  storageKey: string;
  metadata?: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseEnabled()) {
    return { ok: false, error: 'supabase not configured' };
  }
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'supabase client init failed' };

  try {
    const original = base64ToBuffer(opts.fullBase64);
    if (original.length === 0) return { ok: false, error: 'empty buffer' };

    const webp = await toWebpQ95(original);

    const { error } = await sb.storage
      .from(SUPABASE_BUCKET)
      .upload(opts.storageKey, webp, {
        contentType: 'image/webp',
        upsert: true,
        metadata: opts.metadata,
      });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
