// 工程一覧 / エクスポート / 印刷ビュー で共通使用する where 構築 + フィルタ説明文。
// page.tsx, /api/export/events.csv, /events/print から共通参照する。

import {
  parsePeriod,
  parseDateRange,
  resolveRangeFilter,
  type Period,
  type DateRange,
} from '@/lib/period';

export type EventsSearchParams = {
  page?: string;
  perPage?: string;
  genre?: string;
  endpoint?: string;
  user?: string;
  userId?: string;
  period?: string;
  from?: string;
  to?: string;
  downloaded?: string;
  horizontallyExpanded?: string;
};

export type EventsWhere = {
  genre?: string;
  endpoint?: string;
  abSystemUserId?: string;
  abSystemUserName?: { contains: string; mode: 'insensitive' };
  createdAt?: { gte?: Date; lt?: Date };
  downloaded?: boolean;
  horizontallyExpanded?: boolean;
};

export type ResolvedFilter = {
  where: EventsWhere;
  period: Period;
  range: DateRange;
  rangeFilter: { gte?: Date; lt?: Date } | null;
};

/** events 系 page / route で共通利用する where 構築 */
export function buildEventsFilter(sp: EventsSearchParams): ResolvedFilter {
  const period = parsePeriod(sp.period);
  const range = parseDateRange(sp.from, sp.to);
  const rangeFilter = resolveRangeFilter(period, range);

  const where: EventsWhere = {};
  if (sp.genre) where.genre = sp.genre;
  if (sp.endpoint) where.endpoint = sp.endpoint;
  if (sp.user)
    where.abSystemUserName = { contains: sp.user, mode: 'insensitive' };
  if (sp.userId) where.abSystemUserId = sp.userId;
  if (rangeFilter) where.createdAt = rangeFilter;
  if (sp.downloaded === '1') where.downloaded = true;
  if (sp.downloaded === '0') where.downloaded = false;
  if (sp.horizontallyExpanded === '1') where.horizontallyExpanded = true;
  if (sp.horizontallyExpanded === '0') where.horizontallyExpanded = false;

  return { where, period, range, rangeFilter };
}

const PERIOD_LABEL: Record<Exclude<Period, null>, string> = {
  today: '本日',
  week: '今週',
  month: '今月',
};

/** エクスポートヘッダや印刷ビューに載せる「期間」の人間可読文字列 */
export function describeRangeLabel(filter: ResolvedFilter): string {
  if (filter.range.fromStr || filter.range.toStr) {
    const left = filter.range.fromStr || '指定なし';
    const right = filter.range.toStr || '指定なし';
    return `${left} 〜 ${right} (JST)`;
  }
  if (filter.period) {
    return `${PERIOD_LABEL[filter.period]} (JST)`;
  }
  return '全期間';
}

/** その他の条件 (ジャンル / 種別 / ユーザー / DL / 横展開) を説明する */
export function describeOtherConditions(sp: EventsSearchParams): string[] {
  const lines: string[] = [];
  if (sp.genre) lines.push(`ジャンル: ${sp.genre}`);
  if (sp.endpoint) lines.push(`作業種別: ${sp.endpoint}`);
  if (sp.user) lines.push(`ユーザー名 like: ${sp.user}`);
  if (sp.userId) lines.push(`ユーザーID: ${sp.userId}`);
  if (sp.downloaded === '1') lines.push('DL: あり');
  if (sp.downloaded === '0') lines.push('DL: なし');
  if (sp.horizontallyExpanded === '1') lines.push('横展開: あり');
  if (sp.horizontallyExpanded === '0') lines.push('横展開: なし');
  return lines;
}
