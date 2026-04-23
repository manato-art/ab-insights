// 管理ダッシュボード (Server Component)
// - 学習収集トグル
// - 統計カード (総イベント / 今月 / DL率)
// - ジャンル別テーブル
// - 直近イベント 5 件

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

async function getDashboardData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalEvents,
    monthEvents,
    downloadedTotal,
    genreGroups,
    recentEvents,
    learningEnabled,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.event.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.event.count({ where: { downloaded: true } }),
    prisma.event.groupBy({
      by: ['genre'],
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.event.findMany({
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
      const where = { genre: g.genre };
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
    monthEvents,
    downloadedTotal,
    genreRows,
    recentEvents,
    learningEnabled,
  };
}

// ============================================================
// ページ
// ============================================================

export default async function DashboardPage() {
  const {
    totalEvents,
    monthEvents,
    downloadedTotal,
    genreRows,
    recentEvents,
    learningEnabled,
  } = await getDashboardData();

  const overallDlRate = pct(downloadedTotal, totalEvents);

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

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="総イベント件数"
          value={totalEvents.toLocaleString()}
          hint="これまでに記録されたイベントの合計"
        />
        <StatCard
          label="今月のイベント件数"
          value={monthEvents.toLocaleString()}
          hint="当月 1 日からの累計"
        />
        <StatCard
          label="ダウンロード率"
          value={overallDlRate}
          hint={`${downloadedTotal.toLocaleString()} / ${totalEvents.toLocaleString()} イベント`}
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
                  <TableHead className="text-right">平均 hit_score</TableHead>
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
