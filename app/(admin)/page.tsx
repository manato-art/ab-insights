// 管理ダッシュボード (Server Component) — Operations Console テーマ
// - 期間フィルタ (chip + カレンダー)
// - 学習収集トグル (コンパクト)
// - KPI 4 連カード (serif numbers / brand color accents)
// - 日次の StackBars (画像 / DL) + ジャンル Donut
// - 14 日 Sparkline 3 連
// - エンドポイント / ユーザー / 日別 / ジャンル の表 (CardChrome に格納)

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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bars, Donut, SparkLine, StackBars, type DailyPoint } from '@/components/charts';
import { getLearningEnabled } from './settings-helpers';
import LearningToggle from './learning-toggle';
import { UserStatsTable } from './user-stats-table';
import {
  endpointLabel,
  type EndpointRow,
  type UserRow,
} from './dashboard-types';
import {
  combinedCount,
  combinedCountAndImages,
  combinedGenreGroups,
  combinedEndpointGroups,
  combinedUserGroups,
  combinedAvgHit,
  combinedLatestUserName,
  combinedFindManyLite,
  combinedFindForDailyBreakdown,
} from '@/lib/event-source';
import {
  parsePeriod,
  parseDateRange,
  resolveRangeFilter,
  type Period,
  type DateRange,
} from '@/lib/period';
import { jstDateInputValue, JST_TIMEZONE } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ダッシュボード — ab-insights' };

// ============================================================
// 型・ユーティリティ
// ============================================================

type GenreRow = {
  genre: string;
  total: number;
  images: number;
  downloaded: number;
  expanded: number;
  edited: number;
  avgHitScore: number | null;
};

type DailyRow = {
  day: string; // YYYY-MM-DD (JST)
  total: number;
  images: number;
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
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const utcMid = new Date(Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000);
  const wd = WEEKDAY_FORMATTER_JST.format(utcMid);
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${wd})`;
}

function shortDayLabel(dayKey: string): string {
  // YYYY-MM-DD → MM-DD
  const [, m, d] = dayKey.split('-');
  return `${m}-${d}`;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JST 今日を含む直近 N 日分の day key (YYYY-MM-DD, JST) を古い順に返す。 */
function recentDayKeys(days: number): string[] {
  const keys: string[] = [];
  // JST の「今日」を UTC で表現
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.UTC(y, m, d - i));
    // jstDayKey は Date を JST 暦日にフォーマット。 元 Date が UTC 0:00 でも en-CA + Asia/Tokyo で日付が変わるので JST 0:00 (= UTC -9h) に補正
    const jstMidnightUtc = new Date(key.getTime() - JST_OFFSET_MS);
    keys.push(jstDayKey(jstMidnightUtc));
  }
  return keys;
}

/**
 * dailyRows (一部日付欠落) を直近 N 日の連続シリーズに変換 (0 で穴埋め)。
 * チャート用に常に同じ x 軸の日数を見せたい時に使う。
 */
function build14DayChart(rows: DailyRow[], days = 14): DailyPoint[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const keys = recentDayKeys(days);
  return keys.map((key) => {
    const r = map.get(key);
    return {
      date: shortDayLabel(key),
      events: r?.total ?? 0,
      images: r?.images ?? 0,
      downloads: r?.downloaded ?? 0,
    };
  });
}

// ============================================================
// データ取得
// ============================================================

async function getDashboardData(rangeFilter: RangeFilter) {
  const where = rangeFilter ? { createdAt: rangeFilter } : {};
  const [
    totalAgg,
    rangeAgg,
    downloadedTotal,
    aiEditedRange,
    genreGroups,
    endpointGroups,
    userGroups,
    learningEnabled,
  ] = await Promise.all([
    combinedCountAndImages({}),
    combinedCountAndImages(where),
    combinedCount({ ...where, downloaded: true }),
    combinedCount({ ...where, aiEdited: true }),
    combinedGenreGroups(where),
    combinedEndpointGroups(where),
    combinedUserGroups(where),
    getLearningEnabled(),
  ]);

  const totalEvents = totalAgg.count;
  const totalImages = totalAgg.images;
  const rangeEvents = rangeAgg.count;
  const rangeImages = rangeAgg.images;

  const genreRows: GenreRow[] = await Promise.all(
    genreGroups.map(async (g) => {
      const w = { ...where, genre: g.genre };
      const [downloaded, expanded, edited, avg] = await Promise.all([
        combinedCount({ ...w, downloaded: true }),
        combinedCount({ ...w, horizontallyExpanded: true }),
        combinedCount({ ...w, aiEdited: true }),
        combinedAvgHit(w),
      ]);
      return {
        genre: g.genre ?? '',
        total: g.total,
        images: g.images,
        downloaded,
        expanded,
        edited,
        avgHitScore: avg,
      };
    }),
  );

  const endpointRows: EndpointRow[] = endpointGroups.map((g) => ({
    endpoint: g.endpoint,
    total: g.total,
    images: g.images,
  }));

  const userRows: UserRow[] = await Promise.all(
    userGroups.map(async (u) => {
      const w = { ...where, abSystemUserId: u.abSystemUserId };
      const [downloadedCount, byEndpoint, recentLite, latestName] = await Promise.all([
        combinedCount({ ...w, downloaded: true }),
        combinedEndpointGroups(w),
        combinedFindManyLite({ where: w, skip: 0, take: 10 }),
        combinedLatestUserName(u.abSystemUserId),
      ]);
      return {
        abSystemUserId: u.abSystemUserId,
        abSystemUserName: latestName,
        total: u.total,
        images: u.images,
        downloaded: downloadedCount,
        endpointBreakdown: byEndpoint,
        recentEvents: recentLite.map((r) => ({
          id: r.displayId,
          endpoint: r.endpoint,
          genre: r.genre,
          imageCount: r.imageCount,
          downloaded: r.downloaded,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }),
  );

  return {
    totalEvents,
    totalImages,
    rangeEvents,
    rangeImages,
    downloadedTotal,
    aiEditedRange,
    genreRows,
    endpointRows,
    userRows,
    learningEnabled,
  };
}

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

  const events = await combinedFindForDailyBreakdown(where);
  const map = new Map<string, DailyRow>();
  for (const e of events) {
    const day = jstDayKey(e.createdAt);
    const cur =
      map.get(day) ??
      ({ day, total: 0, images: 0, downloaded: 0, expanded: 0, edited: 0 } satisfies DailyRow);
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

const C = {
  ink: 'var(--ink)',
  muted: 'var(--muted-foreground)',
  hairline: 'var(--hairline)',
  orange: 'var(--brand-orange)',
  orangeSoft: 'var(--accent)',
  navy: 'var(--brand-navy)',
  navySoft: 'var(--brand-navy-soft)',
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
      aiEditedRange,
      genreRows,
      endpointRows,
      userRows,
      learningEnabled,
    },
    dailyRows,
  ] = await Promise.all([
    getDashboardData(rangeFilter),
    getDailyBreakdown(rangeFilter),
  ]);

  // チャートは「直近 14 日」を常に固定で表示する (0 件日も補完してタイムライン連続)
  const chartPoints: DailyPoint[] = build14DayChart(dailyRows, 14);

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

  // ジャンル Donut 用 (上位 5 + その他)
  const genreSorted = [...genreRows].sort((a, b) => b.images - a.images);
  const topGenres = genreSorted.slice(0, 5);
  const otherImages = genreSorted.slice(5).reduce((s, g) => s + g.images, 0);
  const donutData = [
    ...topGenres.map((g, i) => ({
      name: g.genre || '未分類',
      value: g.images,
      color: [
        C.orange,
        C.navy,
        C.orangeSoft,
        C.navySoft,
        C.ink,
      ][i] ?? C.muted,
    })),
    ...(otherImages > 0
      ? [{ name: 'その他', value: otherImages, color: 'oklch(0.85 0 0)' }]
      : []),
  ];

  // KPI: AI 編集率
  const aiEditedRate = rangeEvents === 0 ? 0 : aiEditedRange / rangeEvents;
  const imagesPerEvent = rangeEvents === 0 ? 0 : rangeImages / rangeEvents;

  return (
    <div className="space-y-6">
      {/* タイトル + チップフィルタ */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">
            ab.insights / vol. 04
          </div>
          <h1 className="mt-2 text-[34px] leading-tight font-semibold tracking-tight">
            <span style={{ color: C.orange }}>制作実績</span>
            <span className="ml-3 text-muted-foreground/70 text-[18px] font-normal tabular-nums">
              {periodLabel}
            </span>
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            学習データの収集状況と生成画像の集計。
          </p>
        </div>
        <div
          className="flex gap-1 p-1 rounded-md text-[12px] shrink-0"
          style={{
            background: 'oklch(1 0 0)',
            border: `1px solid ${C.hairline}`,
          }}
        >
          {PERIOD_CHIPS.map((c) => {
            const isActive = !usingExplicitRange && (period ?? '') === c.value;
            return (
              <Link
                key={c.value || 'all'}
                href={c.value ? `/?period=${c.value}` : '/'}
                className="px-3 h-7 inline-flex items-center rounded transition"
                style={{
                  background: isActive ? C.ink : 'transparent',
                  color: isActive ? 'oklch(0.99 0 0)' : C.muted,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 期間カレンダー + 学習トグル */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 justify-between">
            <form action="/" method="get" className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="from" className="text-[11px] text-muted-foreground tracking-wider uppercase">
                  開始日
                </Label>
                <Input
                  id="from"
                  type="date"
                  name="from"
                  defaultValue={range.fromStr}
                  max={range.toStr || jstDateInputValue(new Date())}
                  className="h-8 w-[150px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-[11px] text-muted-foreground tracking-wider uppercase">
                  終了日
                </Label>
                <Input
                  id="to"
                  type="date"
                  name="to"
                  defaultValue={range.toStr}
                  min={range.fromStr || undefined}
                  max={jstDateInputValue(new Date())}
                  className="h-8 w-[150px]"
                />
              </div>
              <Button type="submit" size="sm" className="h-8">
                適用
              </Button>
              {usingExplicitRange && (
                <Button type="button" variant="outline" size="sm" className="h-8" asChild>
                  <Link href="/">クリア</Link>
                </Button>
              )}
            </form>
            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-muted-foreground tracking-wider uppercase text-[10px]">
                学習データ収集
              </span>
              <LearningToggle initialEnabled={learningEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI 4 連 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={usingExplicitRange ? '範囲内 生成枚数' : period ? `${PERIOD_CHIPS.find((c) => c.value === period)?.label} 生成枚数` : '生成枚数 (全期間)'}
          value={rangeImages.toLocaleString()}
          unit="枚"
          sub={`工程 ${rangeEvents.toLocaleString()} / 累計 ${totalImages.toLocaleString()}`}
          accent={C.orange}
          decoration="orange"
        />
        <KpiCard
          label="工程数"
          value={rangeEvents.toLocaleString()}
          sub={`画像 / 工程 = ${imagesPerEvent.toFixed(1)}`}
          accent={C.ink}
        />
        <KpiCard
          label="DL 率 (工程ベース)"
          value={(downloadedTotal === 0 || rangeEvents === 0 ? 0 : (downloadedTotal / rangeEvents) * 100).toFixed(1)}
          unit="%"
          sub={`${downloadedTotal} / ${rangeEvents} 工程`}
          accent={C.navy}
          decoration="navy"
        />
        <KpiCard
          label="AI 編集率"
          value={(aiEditedRate * 100).toFixed(1)}
          unit="%"
          sub={`${aiEditedRange} / ${rangeEvents} 工程`}
          accent={C.muted}
        />
      </div>

      {/* メインチャート + ジャンル Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <CardChrome title="日次の制作量と DL" fig="fig. 1 — daily output (last 14 days, JST)">
            <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: C.navySoft }} />画像 (工程比例)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: C.orange }} />DL 内訳
              </span>
              {chartPoints.length > 0 && (
                <span className="ml-auto tabular-nums">
                  peak: {peakLabel(chartPoints)}
                </span>
              )}
            </div>
            <StackBars
              data={chartPoints}
              fills={{ events: C.navySoft, downloads: C.orange }}
              height={170}
            />
            <DateAxis dates={chartPoints.map((d) => d.date)} />
          </CardChrome>
        </div>
        <div className="lg:col-span-4">
          <CardChrome title="ジャンル構成" fig="fig. 2 — genre mix (画像枚数)">
            {donutData.length === 0 || donutData.every((d) => d.value === 0) ? (
              <EmptyMessage label="ジャンルデータなし" />
            ) : (
              <div className="flex items-center gap-5">
                <div style={{ color: C.ink }}>
                  <Donut size={130} thickness={14} data={donutData} />
                </div>
                <ul className="flex-1 text-[12px]">
                  {donutData.map((s) => (
                    <li
                      key={s.name}
                      className="flex items-center gap-2 py-1.5 border-b last:border-0"
                      style={{ borderColor: C.hairline }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tabular-nums text-[14px] font-semibold">
                        {s.value.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardChrome>
        </div>
      </div>

      {/* スパーク 3 連 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: '工程数 14日', field: 'events' as const, color: C.ink, fill: 'oklch(0.92 0.005 80)' },
          { label: '画像枚数 14日', field: 'images' as const, color: C.orange, fill: C.orangeSoft },
          { label: 'DL 14日', field: 'downloads' as const, color: C.navy, fill: C.navySoft },
        ].map((s) => (
          <CardChrome key={s.label} title={s.label}>
            <div style={{ color: s.color }}>
              <SparkLine
                data={chartPoints}
                field={s.field}
                accent={{ stroke: s.color, fill: s.fill }}
                height={70}
                unit={s.field === 'images' ? '枚' : s.field === 'downloads' ? '件' : '工程'}
              />
            </div>
            <SparkAxis dates={chartPoints.map((d) => d.date)} step={2} />
          </CardChrome>
        ))}
      </div>

      {/* 作業内訳 */}
      <CardChrome title="作業内訳" fig={`endpoints — ${periodLabel}`}>
        {endpointRows.length === 0 ? (
          <EmptyMessage label="この期間に作業はありません" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>作業種別</TableHead>
                <TableHead className="text-right">工程数</TableHead>
                <TableHead className="text-right">画像枚数</TableHead>
                <TableHead className="text-right">画像/工程</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpointRows.map((row) => (
                <TableRow key={row.endpoint}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{endpointLabel(row.endpoint)}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {row.endpoint}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.total.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums font-semibold"
                    style={{ color: C.orange }}
                  >
                    {row.images.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.total === 0 ? '—' : (row.images / row.total).toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardChrome>

      {/* ユーザー別 */}
      <CardChrome title="ユーザー別サマリー" fig={`tbl. — by user (${periodLabel})`}>
        {userRows.length === 0 ? (
          <EmptyMessage label="この期間にユーザー活動はありません" />
        ) : (
          <UserStatsTable users={userRows} />
        )}
      </CardChrome>

      {/* 日別内訳 */}
      <CardChrome title="日別内訳" fig={`daily breakdown — ${periodLabel}`}>
        {dailyRows.length === 0 ? (
          <EmptyMessage label="この期間にイベントはありません" />
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
                  <TableCell className="font-mono text-xs">{formatJstDayLabel(row.day)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.total.toLocaleString()}</TableCell>
                  <TableCell
                    className="text-right tabular-nums font-semibold"
                    style={{ color: C.orange }}
                  >
                    {row.images.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.downloaded.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.expanded.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.edited.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(row.downloaded, row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardChrome>

      {/* ジャンル別 */}
      <CardChrome title="ジャンル別レート" fig="genre rates">
        {genreRows.length === 0 ? (
          <EmptyMessage label="データがまだありません" />
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
                    {row.genre || <span className="text-muted-foreground">未分類</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.total.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold" style={{ color: C.orange }}>
                    {row.images.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(row.downloaded, row.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(row.expanded, row.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(row.edited, row.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.avgHitScore === null ? '—' : row.avgHitScore.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardChrome>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function KpiCard({
  label,
  value,
  unit,
  sub,
  accent,
  decoration,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  accent: string;
  decoration?: 'orange' | 'navy';
}) {
  const decorBg =
    decoration === 'orange'
      ? 'var(--accent)'
      : decoration === 'navy'
        ? 'var(--brand-navy-soft)'
        : 'transparent';
  return (
    <div
      className="relative overflow-hidden rounded-[14px] p-5"
      style={{
        background: 'var(--card)',
        boxShadow:
          '0 1px 0 rgba(20,20,20,0.04), 0 0 0 1px rgba(20,20,20,0.05)',
      }}
    >
      <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 40,
            color: accent,
            fontWeight: 500,
          }}
        >
          {value}
        </span>
        {unit && <span className="text-[14px] text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground tabular-nums">
        {sub}
      </div>
      {decoration && (
        <div
          className="absolute -right-5 -bottom-5 w-24 h-24 rounded-full opacity-50 pointer-events-none"
          style={{ background: decorBg }}
        />
      )}
    </div>
  );
}

function CardChrome({
  title,
  fig,
  children,
}: {
  title: string;
  fig?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[14px] p-5"
      style={{
        background: 'var(--card)',
        boxShadow:
          '0 1px 0 rgba(20,20,20,0.04), 0 0 0 1px rgba(20,20,20,0.05)',
      }}
    >
      <header className="flex items-baseline justify-between mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight">
          {title}
        </h3>
        {fig && (
          <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
            {fig}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * StackBars / Bars 直下に等間隔で日付ラベルを並べる。
 * SVG の bar スロットと同じ列数の grid を使うことで bar と日付を 1:1 で揃える。
 * 14 日全部出すと密になりすぎるので 14 → 7 → 4 と段階的に間引く。
 */
function DateAxis({ dates }: { dates: string[] }) {
  const n = dates.length;
  if (n === 0) return null;
  // 全部出す。14 列 grid。font は十分小さく。
  return (
    <div
      className="mt-1.5 grid text-[10px] tabular-nums text-muted-foreground"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, padding: '0 8px' }}
    >
      {dates.map((d, i) => (
        <div key={`${d}-${i}`} className="text-center truncate">
          {d}
        </div>
      ))}
    </div>
  );
}

/**
 * Spark チャート直下の日付軸。dates 配列から step 個おきに表示。
 * 14日 + step=2 → 7 ラベル (04-19 / 04-21 / 04-23 / ... / 05-01) で密度を上げる。
 */
function SparkAxis({ dates, step = 2 }: { dates: string[]; step?: number }) {
  const n = dates.length;
  if (n === 0) return null;
  return (
    <div
      className="mt-1 grid text-[10px] tabular-nums text-muted-foreground"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, padding: '0 4px' }}
    >
      {dates.map((d, i) => {
        const show = i % step === 0 || i === n - 1;
        return (
          <div key={`${d}-${i}`} className="text-center truncate">
            {show ? d : ''}
          </div>
        );
      })}
    </div>
  );
}

function EmptyMessage({ label, small }: { label: string; small?: boolean }) {
  return (
    <div
      className={`text-center text-muted-foreground ${
        small ? 'py-3 text-[12px]' : 'py-10 text-sm'
      }`}
    >
      {label}
    </div>
  );
}

function peakLabel(points: DailyPoint[]): string {
  let max = -1;
  let label = '';
  for (const p of points) {
    if (p.events > max) {
      max = p.events;
      label = `${p.date} · ${p.events} 工程`;
    }
  }
  return label;
}
