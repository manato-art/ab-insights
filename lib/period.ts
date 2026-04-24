// 期間フィルタ用ユーティリティ (JST 基準)
// - today: JST 今日の 00:00 開始
// - week:  JST 今週月曜の 00:00 開始
// - month: JST 今月 1 日の 00:00 開始
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
