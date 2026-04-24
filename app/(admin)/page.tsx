// 管理ダッシュボード (Server Component)
// - 学習収集トグル
// - 統計カード (総イベント / 今月 / DL率)
// - ジャンル別テーブル
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
import { getLearningEnabled } from './settings-helpers';
import LearningToggle from './learning-toggle';
import { parsePeriod, periodStartDate, type Period } from '@/lib/period';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ダッシュボード — ab-insights' };

// ============================================================
// 型・ユーティリティ
// ============================================================

type GenreRow = {
  genre: string;
  total: number;
  downloaded: number;
  expanded: number;
  edited: number;
  avgHitScore: number | null;
};

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${mi}`;
}

// ============================================================
// データ取得
// ============================================================

async function getDashboardData(period: Period) {
  const periodFrom = periodStartDate(period);
  const rangeFilter = periodFrom ? { createdAt: { gte: periodFrom } } : {};

  const [
    totalEvents,
    rangeEvents,
    downloadedTotal,
    genreGroups,
    recentEvents,
    learningEnabled,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({ where: rangeFilter }),
    prisma.event.count({ where: { ...rangeFilter, downloaded: true } }),
    prisma.event.groupBy({
      by: ['genre'],
      where: rangeFilter,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.event.findMany({
      where: rangeFilter,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        endpoint: true,
        genre: true,
        createdAt: true,
        downloaded: true,
      },
    }),
    getLearningEnabled(),
  ]);

  // ジャンル別の詳細(downloaded/expanded/edited/avgHit)は個別クエリで
  const genreRows: GenreRow[] = await Promise.all(
    genreGroups.map(async (g) => {
      const where = { ...rangeFilter, genre: g.genre };
      const [downloaded, expanded, edited, avg] = await Promise.all([
        prisma.event.count({ where: { ...where, downloaded: true } }),
        prisma.event.count({ where: { ...where, horizontallyExpanded: true } }),
        prisma.event.count({ where: { ...where, aiEdited: true } }),
        prisma.event.aggregate({
          where,
          _avg: { hitScore: true },
        }),
      ]);
      return {
        genre: g.genre ?? '',
        total: g._count._all,
        downloaded,
        expanded,
        edited,
        avgHitScore: avg._avg.hitScore,
      };
    }),
  );

  return {
    totalEvents,
    rangeEvents,
    downloadedTotal,
    genreRows,
    recentEvents,
    learningEnabled,
  };
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
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);

  const {
    totalEvents,
    rangeEvents,
    downloadedTotal,
    genreRows,
    recentEvents,
    learningEnabled,
  } = await getDashboardData(period);

  const rangeDlRate = pct(downloadedTotal, rangeEvents);
  const periodLabel = period ? PERIOD_HINT[period] : '全期間';

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground mt-1">
          学習データの収集状況とイベントの集計
        </p>
      </div>

      {/* 学習収集トグル */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>学習データ収集</CardTitle>
              <CardDescription>
                ab-system からの webhook を受信してイベントを保存します。
                無効化するとイベントは記録されません。
              </CardDescription>
            </div>
            <LearningToggle initialEnabled={learningEnabled} />
          </div>
        </CardHeader>
      </Card>

      {/* 期間フィルタ */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">期間:</span>
        {PERIOD_CHIPS.map((c) => (
          <Link
            key={c.value || 'all'}
            href={c.value ? `/?period=${c.value}` : '/'}
            className={`h-8 inline-flex items-center px-3 rounded-md text-xs border transition ${
              (period ?? '') === c.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input hover:bg-accent'
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="総イベント件数"
          value={totalEvents.toLocaleString()}
          hint="これまでに記録されたイベントの合計(全期間)"
        />
        <StatCard
          label={period ? `${PERIOD_CHIPS.find((c) => c.value === period)?.label}のイベント` : '期間内のイベント'}
          value={rangeEvents.toLocaleString()}
          hint={periodLabel}
        />
        <StatCard
          label="ダウンロード率"
          value={rangeDlRate}
          hint={`${downloadedTotal.toLocaleString()} / ${rangeEvents.toLocaleString()} イベント(${periodLabel})`}
        />
      </div>

      {/* ジャンル別テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>ジャンル別サマリー</CardTitle>
          <CardDescription>ジャンル毎の件数・各種レート</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {genreRows.length === 0 ? (
            <EmptyState message="データがまだありません" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ジャンル</TableHead>
                  <TableHead className="text-right">件数</TableHead>
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

      {/* 直近イベント */}
      <Card>
        <CardHeader>
          <CardTitle>直近イベント</CardTitle>
          <CardDescription>最新 5 件</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {recentEvents.length === 0 ? (
            <EmptyState message="イベントがまだありません" />
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
                      {formatDate(ev.createdAt)}
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
