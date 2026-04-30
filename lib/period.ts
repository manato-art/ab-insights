// 期間フィルタ用ユーティリティ (JST 基準)
//
// 2 種類のフィルタを扱う:
//   1) period chip: 'today' | 'week' | 'month' (相対)
//   2) from / to の YYYY-MM-DD 指定 (絶対 / カレンダー選択)
//
// サーバは UTC 稼働のため、JST の暦日境界を UTC Date に変換して Prisma の createdAt 比較に使う。

export type Period = 'today' | 'week' | 'month' | null;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function parsePeriod(s: string | undefined | null): Period {
  if (s === 'today' || s === 'week' || s === 'month') return s;
  return null;
}

/**
 * 指定期間の開始日時 (UTC Date) を返す。period が null なら null。
 * 内部的に「UTC 時刻を +9h ずらした Date の UTC 系フィールド」= JST の壁掛け時計、として扱う。
 */
export function periodStartDate(period: Period, now: Date = new Date()): Date | null {
  if (!period) return null;

  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();

  if (period === 'today') {
    return new Date(Date.UTC(y, m, d) - JST_OFFSET_MS);
  }
  if (period === 'week') {
    // JST 曜日 (0=日, 1=月, ..., 6=土)。月曜基準で何日戻すか。
    const dow = jst.getUTCDay();
    const daysFromMon = dow === 0 ? 6 : dow - 1;
    return new Date(Date.UTC(y, m, d - daysFromMon) - JST_OFFSET_MS);
  }
  // month
  return new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
}

export const PERIOD_LABELS: Record<Exclude<Period, null>, string> = {
  today: '本日',
  week: '今週',
  month: '今月',
};

// ============================================================
// 任意の日付範囲 (from / to)
// ============================================================

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD (JST 暦日) を、その日の JST 0:00 に対応する UTC Date に変換。 */
export function jstDateStringToUtcStart(s: string): Date | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (
    !Number.isFinite(y) ||
    mo < 0 ||
    mo > 11 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }
  return new Date(Date.UTC(y, mo, d) - JST_OFFSET_MS);
}

export type DateRange = {
  /** JST のその日 00:00 (= UTC Date) 以上 */
  gte: Date | null;
  /** JST の翌日 00:00 (= UTC Date) 未満。 排他上限 */
  lt: Date | null;
  /** UI 表示用に正規化した文字列 (空なら "") */
  fromStr: string;
  toStr: string;
};

/**
 * `from`, `to` (YYYY-MM-DD / JST 暦日) を受け取り、Prisma 用の `gte` / `lt` を返す。
 * - to は「その日を含む」= JST 翌日 0:00 未満
 * - 不正な値は無視
 */
export function parseDateRange(
  from: string | undefined | null,
  to: string | undefined | null,
): DateRange {
  const fromTrim = (from ?? '').trim();
  const toTrim = (to ?? '').trim();

  const gte = fromTrim ? jstDateStringToUtcStart(fromTrim) : null;
  const toStart = toTrim ? jstDateStringToUtcStart(toTrim) : null;
  const lt = toStart ? new Date(toStart.getTime() + 24 * 60 * 60 * 1000) : null;

  return {
    gte,
    lt,
    fromStr: gte ? fromTrim : '',
    toStr: lt ? toTrim : '',
  };
}

/**
 * period chip と from/to の併用ルール:
 *  - from / to のいずれか有効 → そちらを優先 (period は無効化)
 *  - どちらも無ければ period を使う
 */
export function resolveRangeFilter(
  period: Period,
  range: DateRange,
): { gte?: Date; lt?: Date } | null {
  if (range.gte || range.lt) {
    const out: { gte?: Date; lt?: Date } = {};
    if (range.gte) out.gte = range.gte;
    if (range.lt) out.lt = range.lt;
    return out;
  }
  const start = periodStartDate(period);
  if (start) return { gte: start };
  return null;
}
