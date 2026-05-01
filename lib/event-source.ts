// Event (現役) と ArchivedEvent (アーカイブ) を透過的に扱うヘルパ。
// ダッシュボード / 工程履歴 / CSV / 印刷ビューから利用する。
//
// 設計方針:
//   - 二箇所同じスキーマだが Prisma model が別なので、 ここで「Combined」 形に正規化する。
//   - 件数 / 集計は Event と ArchivedEvent の両方に同じ where を投げて加算する。
//   - findMany は Event と ArchivedEvent を両方取得して JS で createdAt desc にマージし、 ページング。
//   - 画像 (image, aiEdits) を含む場合、 Combined Event にも画像枚数だけは含む。 詳細 include は別取得。

import 'server-only';
import { prisma } from './db';

export type CombinedWhere = {
  genre?: string | null;
  endpoint?: string;
  abSystemUserId?: string;
  abSystemUserName?: { contains: string; mode: 'insensitive' };
  createdAt?: { gte?: Date; lt?: Date };
  downloaded?: boolean;
  horizontallyExpanded?: boolean;
  aiEdited?: boolean;
};

/** Event / ArchivedEvent それぞれの count 合計 */
export async function combinedCount(where: CombinedWhere): Promise<number> {
  const [a, b] = await Promise.all([
    prisma.event.count({ where }),
    prisma.archivedEvent.count({ where }),
  ]);
  return a + b;
}

/** imageCount の合計 (Event ∪ ArchivedEvent) */
export async function combinedImageSum(where: CombinedWhere): Promise<number> {
  const [a, b] = await Promise.all([
    prisma.event.aggregate({ where, _sum: { imageCount: true } }),
    prisma.archivedEvent.aggregate({ where, _sum: { imageCount: true } }),
  ]);
  return (a._sum.imageCount ?? 0) + (b._sum.imageCount ?? 0);
}

/** count + imageSum を一発で取る */
export async function combinedCountAndImages(
  where: CombinedWhere,
): Promise<{ count: number; images: number }> {
  const [aCount, bCount, aSum, bSum] = await Promise.all([
    prisma.event.count({ where }),
    prisma.archivedEvent.count({ where }),
    prisma.event.aggregate({ where, _sum: { imageCount: true } }),
    prisma.archivedEvent.aggregate({ where, _sum: { imageCount: true } }),
  ]);
  return {
    count: aCount + bCount,
    images: (aSum._sum.imageCount ?? 0) + (bSum._sum.imageCount ?? 0),
  };
}

/** ジャンルごとの工程数・画像枚数 */
export type CombinedGenreRow = {
  genre: string | null;
  total: number;
  images: number;
};

export async function combinedGenreGroups(
  where: CombinedWhere,
): Promise<CombinedGenreRow[]> {
  const [a, b] = await Promise.all([
    prisma.event.groupBy({
      by: ['genre'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
    prisma.archivedEvent.groupBy({
      by: ['genre'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
  ]);
  const map = new Map<string | null, CombinedGenreRow>();
  for (const r of [...a, ...b]) {
    const key = r.genre ?? null;
    const cur = map.get(key) ?? { genre: key, total: 0, images: 0 };
    cur.total += r._count._all;
    cur.images += r._sum.imageCount ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((x, y) => y.total - x.total);
}

/** エンドポイントごと */
export type CombinedEndpointRow = {
  endpoint: string;
  total: number;
  images: number;
};

export async function combinedEndpointGroups(
  where: CombinedWhere,
): Promise<CombinedEndpointRow[]> {
  const [a, b] = await Promise.all([
    prisma.event.groupBy({
      by: ['endpoint'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
    prisma.archivedEvent.groupBy({
      by: ['endpoint'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
  ]);
  const map = new Map<string, CombinedEndpointRow>();
  for (const r of [...a, ...b]) {
    const cur = map.get(r.endpoint) ?? {
      endpoint: r.endpoint,
      total: 0,
      images: 0,
    };
    cur.total += r._count._all;
    cur.images += r._sum.imageCount ?? 0;
    map.set(r.endpoint, cur);
  }
  return Array.from(map.values()).sort((x, y) => y.total - x.total);
}

/** ユーザーごと (groupBy) */
export type CombinedUserGroup = {
  abSystemUserId: string;
  total: number;
  images: number;
};

export async function combinedUserGroups(
  where: CombinedWhere,
): Promise<CombinedUserGroup[]> {
  const [a, b] = await Promise.all([
    prisma.event.groupBy({
      by: ['abSystemUserId'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
    prisma.archivedEvent.groupBy({
      by: ['abSystemUserId'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
    }),
  ]);
  const map = new Map<string, CombinedUserGroup>();
  for (const r of [...a, ...b]) {
    const cur = map.get(r.abSystemUserId) ?? {
      abSystemUserId: r.abSystemUserId,
      total: 0,
      images: 0,
    };
    cur.total += r._count._all;
    cur.images += r._sum.imageCount ?? 0;
    map.set(r.abSystemUserId, cur);
  }
  return Array.from(map.values()).sort((x, y) => y.total - x.total);
}

/** 加重平均: avg と件数を Event / ArchivedEvent から取って合算 */
export async function combinedAvgHit(where: CombinedWhere): Promise<number | null> {
  const [a, b] = await Promise.all([
    prisma.event.aggregate({ where, _avg: { hitScore: true }, _count: { hitScore: true } }),
    prisma.archivedEvent.aggregate({ where, _avg: { hitScore: true }, _count: { hitScore: true } }),
  ]);
  const aN = a._count.hitScore ?? 0;
  const bN = b._count.hitScore ?? 0;
  const aAvg = a._avg.hitScore;
  const bAvg = b._avg.hitScore;
  const sum = (aAvg ?? 0) * aN + (bAvg ?? 0) * bN;
  const total = aN + bN;
  return total === 0 ? null : sum / total;
}

/** Combined: 同一ユーザーの最新 non-null name を引く (期間外も含めた全履歴から) */
export async function combinedLatestUserName(
  abSystemUserId: string,
): Promise<string | null> {
  const [a, b] = await Promise.all([
    prisma.event.findFirst({
      where: { abSystemUserId, abSystemUserName: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { abSystemUserName: true, createdAt: true },
    }),
    prisma.archivedEvent.findFirst({
      where: { abSystemUserId, abSystemUserName: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { abSystemUserName: true, createdAt: true },
    }),
  ]);
  if (!a && !b) return null;
  if (!a) return b!.abSystemUserName;
  if (!b) return a.abSystemUserName;
  return a.createdAt >= b.createdAt ? a.abSystemUserName : b.abSystemUserName;
}

/** CSV / 印刷ビュー用: 詳細フィールド込みで Combined 全件取得 (createdAt desc) */
export type CombinedEventDetail = {
  source: 'current' | 'archived';
  id: number;
  displayId: number;
  createdAt: Date;
  abSystemUserId: string;
  abSystemUserName: string | null;
  endpoint: string;
  genre: string | null;
  subGenre: string | null;
  appealType: string | null;
  appealText: string | null;
  imageCount: number;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  regeneratedCount: number;
  hitScore: number | null;
  rating: number | null;
};

export async function combinedFindManyDetail(
  where: CombinedWhere,
): Promise<CombinedEventDetail[]> {
  const SELECT = {
    id: true,
    createdAt: true,
    abSystemUserId: true,
    abSystemUserName: true,
    endpoint: true,
    genre: true,
    subGenre: true,
    appealType: true,
    appealText: true,
    imageCount: true,
    downloaded: true,
    horizontallyExpanded: true,
    aiEdited: true,
    regeneratedCount: true,
    hitScore: true,
    rating: true,
  } as const;
  const [a, b] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    }),
    prisma.archivedEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { ...SELECT, originalEventId: true },
    }),
  ]);
  const merged: CombinedEventDetail[] = [
    ...a.map((r) => ({ source: 'current' as const, displayId: r.id, ...r })),
    ...b.map((r) => ({
      source: 'archived' as const,
      id: r.id,
      displayId: r.originalEventId,
      createdAt: r.createdAt,
      abSystemUserId: r.abSystemUserId,
      abSystemUserName: r.abSystemUserName,
      endpoint: r.endpoint,
      genre: r.genre,
      subGenre: r.subGenre,
      appealType: r.appealType,
      appealText: r.appealText,
      imageCount: r.imageCount,
      downloaded: r.downloaded,
      horizontallyExpanded: r.horizontallyExpanded,
      aiEdited: r.aiEdited,
      regeneratedCount: r.regeneratedCount,
      hitScore: r.hitScore,
      rating: r.rating,
    })),
  ];
  merged.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  return merged;
}

/** 日別集計用: createdAt と imageCount / signal を全件取得 (画像本体は不要なので軽量) */
export async function combinedFindForDailyBreakdown(where: CombinedWhere): Promise<
  {
    createdAt: Date;
    imageCount: number;
    downloaded: boolean;
    horizontallyExpanded: boolean;
    aiEdited: boolean;
  }[]
> {
  const SELECT = {
    createdAt: true,
    imageCount: true,
    downloaded: true,
    horizontallyExpanded: true,
    aiEdited: true,
  } as const;
  const [a, b] = await Promise.all([
    prisma.event.findMany({ where, select: SELECT }),
    prisma.archivedEvent.findMany({ where, select: SELECT }),
  ]);
  return [...a, ...b];
}

/**
 * Combined Event の最小フィールド (リスト表示用)。
 * source で「current」 (Event) か 「archived」 (ArchivedEvent) を判別できるようにしておく。
 */
export type CombinedEventLite = {
  source: 'current' | 'archived';
  id: number; // Combined 表示用 (current は Event.id、 archived は ArchivedEvent.id)
  /** archived の場合 originalEventId、 current は同じ id */
  displayId: number;
  abSystemUserId: string;
  abSystemUserName: string | null;
  endpoint: string;
  createdAt: Date;
  genre: string | null;
  appealType: string | null;
  appealText: string | null;
  imageCount: number;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  hitScore: number | null;
};

/**
 * Event ∪ ArchivedEvent を取得し createdAt desc でマージ → skip/take で切る。
 * 大量取得を防ぐため limit (= skip + take) で各テーブルに上限をかける。
 */
export async function combinedFindManyLite(args: {
  where: CombinedWhere;
  skip: number;
  take: number;
}): Promise<CombinedEventLite[]> {
  const { where, skip, take } = args;
  const limit = skip + take;

  const SELECT = {
    id: true,
    abSystemUserId: true,
    abSystemUserName: true,
    endpoint: true,
    createdAt: true,
    genre: true,
    appealType: true,
    appealText: true,
    imageCount: true,
    downloaded: true,
    horizontallyExpanded: true,
    aiEdited: true,
    hitScore: true,
  } as const;

  const [a, b] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: SELECT,
    }),
    prisma.archivedEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { ...SELECT, originalEventId: true },
    }),
  ]);

  const merged: CombinedEventLite[] = [
    ...a.map((r) => ({ source: 'current' as const, displayId: r.id, ...r })),
    ...b.map((r) => ({
      source: 'archived' as const,
      displayId: r.originalEventId,
      id: r.id,
      abSystemUserId: r.abSystemUserId,
      abSystemUserName: r.abSystemUserName,
      endpoint: r.endpoint,
      createdAt: r.createdAt,
      genre: r.genre,
      appealType: r.appealType,
      appealText: r.appealText,
      imageCount: r.imageCount,
      downloaded: r.downloaded,
      horizontallyExpanded: r.horizontallyExpanded,
      aiEdited: r.aiEdited,
      hitScore: r.hitScore,
    })),
  ];

  merged.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  return merged.slice(skip, skip + take);
}
