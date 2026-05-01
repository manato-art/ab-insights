// ユーザー管理ページ用 read-only ヘルパー (server-side only)
// - 月境界 (JST 1日0時 〜 翌月1日0時) の Date レンジ
// - UserProfile + デフォルト上限の解決
// - quota 集計
//
// 注意: ab-system には一切戻さない。すべて ab-insights 側だけで完結する。

import 'server-only';
import { prisma } from '@/lib/db';

export const DEFAULT_MONTHLY_QUOTA_KEY = 'default_monthly_image_quota';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type MonthRange = {
  /** 当月 1 日 JST 0:00 を表す UTC Date */
  start: Date;
  /** 翌月 1 日 JST 0:00 を表す UTC Date (排他上限) */
  next: Date;
  /** YYYY-MM (JST) */
  ymKey: string;
  /** 表示用ラベル "2026年5月" */
  label: string;
};

/** 与えられた瞬間が属する月 (JST) のレンジを返す。 */
export function jstMonthRange(now: Date = new Date()): MonthRange {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
  const next = new Date(Date.UTC(y, m + 1, 1) - JST_OFFSET_MS);
  const ymKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  const label = `${y}年${m + 1}月`;
  return { start, next, ymKey, label };
}

/** N ヶ月前の月レンジを返す。0 = 今月。 */
export function jstMonthRangeOffset(monthsAgo: number, now: Date = new Date()): MonthRange {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() - monthsAgo;
  const start = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
  const next = new Date(Date.UTC(y, m + 1, 1) - JST_OFFSET_MS);
  const startJst = new Date(start.getTime() + JST_OFFSET_MS);
  const yy = startJst.getUTCFullYear();
  const mm = startJst.getUTCMonth() + 1;
  return {
    start,
    next,
    ymKey: `${yy}-${String(mm).padStart(2, '0')}`,
    label: `${yy}年${mm}月`,
  };
}

/** デフォルト月上限。Setting テーブルに無ければ null (= 上限なし) */
export async function getDefaultMonthlyImageQuota(): Promise<number | null> {
  const s = await prisma.setting.findUnique({
    where: { key: DEFAULT_MONTHLY_QUOTA_KEY },
  });
  if (!s) return null;
  const n = Number(s.value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export type ResolvedQuota = {
  /** 適用される上限。null なら上限なし */
  effective: number | null;
  /** 個別設定が入っているか (= UserProfile.monthlyImageQuota が non-null) */
  isOverride: boolean;
};

/** UserProfile.monthlyImageQuota と Setting デフォルトを解決して effective を返す */
export function resolveQuota(
  profileQuota: number | null | undefined,
  defaultQuota: number | null,
): ResolvedQuota {
  if (profileQuota != null) return { effective: profileQuota, isOverride: true };
  return { effective: defaultQuota, isOverride: false };
}

export type QuotaStatus = {
  effective: number | null;
  isOverride: boolean;
  used: number;
  remaining: number | null; // null = 上限なし
  ratio: number | null; // 0..1+
  tier: 'none' | 'ok' | 'warn' | 'danger' | 'over';
};

/**
 * 当月使用枚数と上限から表示用の状態を計算。
 * - tier:
 *   - none  : 上限未設定
 *   - ok    : <70%
 *   - warn  : 70〜90%
 *   - danger: 90〜100%
 *   - over  : >=100%
 */
export function computeQuotaStatus(
  used: number,
  resolved: ResolvedQuota,
): QuotaStatus {
  const { effective, isOverride } = resolved;
  if (effective == null || effective === 0) {
    return {
      effective,
      isOverride,
      used,
      remaining: null,
      ratio: null,
      tier: 'none',
    };
  }
  const ratio = used / effective;
  const remaining = Math.max(0, effective - used);
  let tier: QuotaStatus['tier'];
  if (ratio >= 1) tier = 'over';
  else if (ratio >= 0.9) tier = 'danger';
  else if (ratio >= 0.7) tier = 'warn';
  else tier = 'ok';
  return { effective, isOverride, used, remaining, ratio, tier };
}
