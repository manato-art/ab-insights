// 管理ダッシュボード (Server Component)
// - 学習収集トグル
// - 期間フィルタ (期間 chip + カレンダー範囲)
// - 統計カード (総イベント / 期間内 / DL率)
// - ジャンル別テーブル
// - 日別内訳テーブル (期間範囲内の日付ごとの件数とシグナル)
// - 直近イベント 5 件

import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLearningEnabled } from './settings-helpers';
import LearningToggle from './learning-toggle';
import {
  parsePeriod,
  parseDateRange,
  resolveRangeFilter,
  type Period,
  type DateRange,
} from '@/lib/period';
import {
  formatJstShortDateTime,
  jstDateInputValue,
  JST_TIMEZONE,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ダッシュボード — ab-insights' };

// ============================================================
// 型・ユーティリティ
// ============================================================

type GenreRow = {
  genre: string;
  total: number; // 工程数 (Event 件数)
  images: number; // 画像枚数 (imageCount 合計)
  downloaded: number;
  expanded: number;
  edited: number;
  avgHitScore: number | null;
};

type DailyRow = {
  day: string; // YYYY-MM-DD (JST)
  total: number; // 工程数 (Event 件数)
  images: number; // 画像枚数 (imageCount 合計)
  downloaded: number;
  expanded: number;
  edited: number;
};

type RangeFilter = { gte?: Date; lt?: Date } | null;

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const DAY_FORMATTER_JST = new Intl.DateTimeFormat('en-CA', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const WEEKDAY_FORMATTER_JST = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST_TIMEZONE,
  weekday: 'short',
});

function jstDayKey(d: Date): string {
  return DAY_FORMATTER_JST.format(d);
}

function formatJstDayLabel(dayKey: string): string {
  // dayKey は YYYY-MM-DD (JST)。曜日付きで `2026/04/30 (木)` のように表示。
  // JST 0:00 を UTC に直してフォーマッタに渡す。
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const utcMid = new Date(Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000);
  const wd = WEEKDAY_FORMATTER_JST.format(utcMid);
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${wd})`;
}

// ============================================================
// データ取得
// ============================================================

async function getDashboardData(rangeFilter: RangeFilter) {
  const where = rangeFilter ? { createdAt: rangeFilter } : {};

  const [
    totalEvents,
    totalImagesAgg,
    rangeEvents,
    rangeImagesAgg,
    downloadedTotal,
    genreGroups,
    recentEvents,
    learningEnabled,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.aggregate({ _sum: { imageCount: true } }),
    prisma.event.count({ where }),
    prisma.event.aggregate({ where, _sum: { imageCount: true } }),
    prisma.event.count({ where: { ...where, downloaded: true } }),
    prisma.event.groupBy({
      by: ['genre'],
      where,
      _count: { _all: true },
      _sum: { imageCount: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        endpoint: true,
        genre: true,
        createdAt: true,
        downloaded: true,
        imageCount: true,
      },
    }),
    getLearningEnabled(),
  ]);

  const totalImages = totalImagesAgg._sum.imageCount ?? 0;
  const rangeImages = rangeImagesAgg._sum.imageCount ?? 0;

  // ジャンル別の詳細(downloaded/expanded/edited/avgHit)は個別クエリで
  const genreRows: GenreRow[] = await Promise.all(
    genreGroups.map(async (g) => {
      const w = { ...where, genre: g.genre };
      const [downloaded, expanded, edited, avg] = await Promise.all([
        prisma.event.count({ where: { ...w, downloaded: true } }),
        prisma.event.count({ where: { ...w, horizontallyExpanded: true } }),
        prisma.event.count({ where: { ...w, aiEdited: true } }),
        prisma.event.aggregate({
          where: w,
          _avg: { hitScore: true },
        }),
      ]);
      return {
        genre: g.genre ?? '',
        total: g._count._all,
        images: g._sum.imageCount ?? 0,
        downloaded,
        expanded,
        edited,
        avgHitScore: avg._avg.hitScore,
      };
    }),
  );

  return {
    totalEvents,
    totalImages,
    rangeEvents,
    rangeImages,
    downloadedTotal,
    genreRows,
    recentEvents,
    learningEnabled,
  };
}

/**
 * 日別内訳。期間が指定されていなければ直近 30 日にフォールバック。
 * 件数が大量になる場合に備えて取得カラムは最小限。
 */
async function getDailyBreakdown(
  rangeFilter: RangeFilter,
  fallbackDays = 30,
): Promise<DailyRow[]> {
  let where: { createdAt?: { gte?: Date; lt?: Date } };
  if (rangeFilter) {
    where = { createdAt: rangeFilter };
  } else {
    const since = new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000);
    where = { createdAt: { gte: since } };
  }

  const events = await prisma.event.findMany({
    where,
    select: {
      createdAt: true,
      imageCount: true,
      downloaded: true,
      horizontallyExpanded: true,
      aiEdited: true,
    },
  });

  const map = new Map<string, DailyRow>();
  for (const e of events) {
    const day = jstDayKey(e.createdAt);
    const cur =
      map.get(day) ??
      ({
        day,
        total: 0,
        images: 0,
        downloaded: 0,
        expanded: 0,
        edited: 0,
      } satisfies DailyRow);
    cur.total++;
    cur.images += e.imageCount;
    if (e.downloaded) cur.downloaded++;
    if (e.horizontallyExpanded) cur.expanded++;
    if (e.aiEdited) cur.edited++;
    map.set(day, cur);
  }

  return Array.from(map.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
}

// ============================================================
// ページ
// ============================================================

const PERIOD_CHIPS: { value: string; label: string }[] = [
  { value: '', label: '全期間' },
  { value: 'today', label: '本日' },
  { value: 'week', label: '今週' },
  { value: 'month', label: '今月' },
];

const PERIOD_HINT: Record<string, string> = {
  today: '本日(JST 0:00〜)',
  week: '今週(月曜 0:00〜)',
  month: '今月(1日 0:00〜)',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const range = parseDateRange(sp.from, sp.to);
  const rangeFilter = resolveRangeFilter(period, range);
  const usingExplicitRange = Boolean(range.fromStr || range.toStr);

  const [
    {
      totalEvents,
      totalImages,
      rangeEvents,
      rangeImages,
      downloadedTotal,
      genreRows,
      recentEvents,
      learningEnabled,
    },
    dailyRows,
  ] = await Promise.all([
    getDashboardData(rangeFilter),
    getDailyBreakdown(rangeFilter),
  ]);

  const rangeDlRate = pct(downloadedTotal, rangeEvents);

  // 表示ラベル
  let periodLabel: string;
  if (usingExplicitRange) {
    const left = range.fromStr || '指定なし';
    const right = range.toStr || '指定なし';
    periodLabel = `${left} 〜 ${right} (JST)`;
  } else if (period) {
    periodLabel = PERIOD_HINT[period];
  } else {
    periodLabel = '全期間';
  }

  const dailyHint = usingExplicitRange
    ? '指定範囲の日別 工程数 / 画像枚数 / 行動シグナル (JST)'
    : period
      ? `${PERIOD_CHIPS.find((c) => c.value === period)?.label ?? ''}の日別 工程数 / 画像枚数 / 行動シグナル (JST)`
      : '直近 30 日の日別 工程数 / 画像枚数 / 行動シグナル (JST)';

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground mt-1">
          学習データの収集状況と生成画像の集計
        </p>
      </div>

      {/* 学習収集トグル */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>学習データ収集</CardTitle>
              <CardDescription>
                ab-system からの webhook を受信して生成画像を保存します。
                無効化すると生成画像は記録されません。
              </CardDescription>
            </div>
            <LearningToggle initialEnabled={learningEnabled} />
          </div>
        </CardHeader>
      </Card>

      {/* 期間フィルタ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">期間フィルタ</CardTitle>
          <CardDescription>
            プリセット or カレンダーで期間を指定 (JST 基準)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* chip 行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">プリセット:</span>
            {PERIOD_CHIPS.map((c) => (
              <Link
                key={c.value || 'all'}
                href={c.value ? `/?period=${c.value}` : '/'}
                className={`h-8 inline-flex items-center px-3 rounded-md text-xs border transition ${
                  !usingExplicitRange && (period ?? '') === c.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input hover:bg-accent'
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>

          {/* カレンダー範囲 */}
          <form action="/" method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">
                開始日
              </Label>
              <Input
                id="from"
                type="date"
                name="from"
                defaultValue={range.fromStr}
                max={
                  range.toStr || jstDateInputValue(new Date())
                }
                className="h-8 w-[170px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">
                終了日
              </Label>
              <Input
                id="to"
                type="date"
                name="to"
                defaultValue={range.toStr}
                min={range.fromStr || undefined}
                max={jstDateInputValue(new Date())}
                className="h-8 w-[170px]"
              />
            </div>
            <Button type="submit" size="sm">
              適用
            </Button>
            {usingExplicitRange && (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/">クリア</Link>
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground basis-full">
              開始/終了は<strong className="font-medium">その日を含む</strong>
              範囲です。範囲を指定するとプリセットは無効化されます。
            </p>
          </form>
        </CardContent>
      </Card>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DualStatCard
          label="累計 生成枚数 (全期間)"
          primary={{ value: totalImages.toLocaleString(), unit: '枚' }}
          secondary={`工程数: ${totalEvents.toLocaleString()} (= 工程一覧の合計)`}
          hint="1 工程で N 枚生成されると枚数は +N、工程数は +1"
        />
        <DualStatCard
          label={
            usingExplicitRange
              ? '範囲内 生成枚数'
              : period
                ? `${PERIOD_CHIPS.find((c) => c.value === period)?.label}の生成枚数`
                : '期間内 生成枚数'
          }
          primary={{ value: rangeImages.toLocaleString(), unit: '枚' }}
          secondary={`工程数: ${rangeEvents.toLocaleString()}`}
          hint={periodLabel}
        />
        <StatCard
          label="ダウンロード率 (工程ベース)"
          value={rangeDlRate}
          hint={`${downloadedTotal.toLocaleString()} / ${rangeEvents.toLocaleString()} 工程が DL 済 (${periodLabel})`}
        />
      </div>

      {/* 日別内訳 */}
      <Card>
        <CardHeader>
          <CardTitle>日別内訳</CardTitle>
          <CardDescription>{dailyHint}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {dailyRows.length === 0 ? (
            <EmptyState message="この期間にイベントはありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付 (JST)</TableHead>
                  <TableHead className="text-right">工程数</TableHead>
                  <TableHead className="text-right">画像枚数</TableHead>
                  <TableHead className="text-right">DL</TableHead>
                  <TableHead className="text-right">横展開</TableHead>
                  <TableHead className="text-right">AI編集</TableHead>
                  <TableHead className="text-right">DL率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className="font-mono text-xs">
                      {formatJstDayLabel(row.day)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.images.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.downloaded.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.expanded.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.edited.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.downloaded, row.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ジャンル別テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>ジャンル別サマリー</CardTitle>
          <CardDescription>ジャンル毎の工程数・画像枚数・各種レート</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {genreRows.length === 0 ? (
            <EmptyState message="データがまだありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ジャンル</TableHead>
                  <TableHead className="text-right">工程数</TableHead>
                  <TableHead className="text-right">画像枚数</TableHead>
                  <TableHead className="text-right">DL率</TableHead>
                  <TableHead className="text-right">横展開率</TableHead>
                  <TableHead className="text-right">AI編集率</TableHead>
                  <TableHead className="text-right">平均 刺さり度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {genreRows.map((row) => (
                  <TableRow key={row.genre || '__null__'}>
                    <TableCell className="font-medium">
                      {row.genre || (
                        <span className="text-muted-foreground">未分類</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.images.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.downloaded, row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.expanded, row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.edited, row.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.avgHitScore === null
                        ? '—'
                        : row.avgHitScore.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 直近生成画像 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の生成画像</CardTitle>
          <CardDescription>最新 5 件 (JST)</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {recentEvents.length === 0 ? (
            <EmptyState message="生成画像がまだありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>エンドポイント</TableHead>
                  <TableHead>ジャンル</TableHead>
                  <TableHead>日時</TableHead>
                  <TableHead className="text-right">DL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{ev.id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.endpoint}
                    </TableCell>
                    <TableCell>
                      {ev.genre ?? (
                        <span className="text-muted-foreground">未分類</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatJstShortDateTime(ev.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {ev.downloaded ? (
                        <Badge variant="default">DL済</Badge>
                      ) : (
                        <Badge variant="outline">未DL</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function DualStatCard({
  label,
  primary,
  secondary,
  hint,
}: {
  label: string;
  primary: { value: string; unit: string };
  secondary: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums pt-1">
          {primary.value}
          <span className="text-base font-normal text-muted-foreground ml-1.5">
            {primary.unit}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground tabular-nums pt-1">
          {secondary}
        </p>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums pt-1">
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
