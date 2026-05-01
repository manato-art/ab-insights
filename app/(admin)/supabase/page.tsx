// Supabase 連携管理ページ
// - 接続状況
// - 手動 backfill (期間指定)
// - 各月の Storage 反映状況サマリ

import { prisma } from '@/lib/db';
import { isSupabaseEnabled, SUPABASE_BUCKET } from '@/lib/supabase';
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
import { ManualBackfillForm } from './manual-backfill';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Supabase 連携 — ab-insights' };

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstYearMonth(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`;
}

type MonthSummary = {
  month: string;
  totalEvents: number;
  totalImages: number;
  imagesInStorage: number;
  imagesNotInStorage: number;
};

async function getMonthlySummary(): Promise<MonthSummary[]> {
  // 過去 12 ヶ月分くらい (Event + ArchivedEvent)
  const now = Date.now();
  const since = new Date(now - 365 * 24 * 60 * 60 * 1000);

  const [eventList, archivedList, eventImages, archivedImages] = await Promise.all([
    prisma.event.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true },
    }),
    prisma.archivedEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true },
    }),
    prisma.eventImage.findMany({
      where: { event: { createdAt: { gte: since } } },
      select: { fullStorageKey: true, event: { select: { createdAt: true } } },
    }),
    prisma.archivedEventImage.findMany({
      where: { event: { createdAt: { gte: since } } },
      select: { fullStorageKey: true, event: { select: { createdAt: true } } },
    }),
  ]);

  const map = new Map<string, MonthSummary>();
  const ensure = (m: string) => {
    let v = map.get(m);
    if (!v) {
      v = {
        month: m,
        totalEvents: 0,
        totalImages: 0,
        imagesInStorage: 0,
        imagesNotInStorage: 0,
      };
      map.set(m, v);
    }
    return v;
  };

  for (const e of eventList) ensure(jstYearMonth(e.createdAt)).totalEvents++;
  for (const e of archivedList) ensure(jstYearMonth(e.createdAt)).totalEvents++;
  for (const i of eventImages) {
    const m = ensure(jstYearMonth(i.event.createdAt));
    m.totalImages++;
    if (i.fullStorageKey) m.imagesInStorage++;
    else m.imagesNotInStorage++;
  }
  for (const i of archivedImages) {
    const m = ensure(jstYearMonth(i.event.createdAt));
    m.totalImages++;
    if (i.fullStorageKey) m.imagesInStorage++;
    else m.imagesNotInStorage++;
  }

  return Array.from(map.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
}

export default async function SupabasePage() {
  const enabled = isSupabaseEnabled();
  const summary = enabled ? await getMonthlySummary() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supabase 連携</h1>
        <p className="text-sm text-muted-foreground mt-1">
          画像本体と工程情報を Supabase Storage に保管 / 月単位で手動再アップロード可能
        </p>
      </div>

      {/* 接続状況 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">接続状況</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-32">状態:</span>
            {enabled ? (
              <Badge variant="default">接続済</Badge>
            ) : (
              <Badge variant="destructive">未接続 (env 設定必要)</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-32">バケット:</span>
            <code className="font-mono text-xs">{SUPABASE_BUCKET}</code>
          </div>
        </CardContent>
      </Card>

      {/* 手動 backfill */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">手動 アップロード</CardTitle>
          <CardDescription>
            指定月の画像 + 工程情報 (e&#123;id&#125;_xxx.txt) を Supabase Storage に反映します。
            6 月以降は毎月 1 日 9:00 JST に自動で同様の処理が走ります。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enabled ? (
            <ManualBackfillForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              Supabase 環境変数が設定されていないため、 backfill は実行できません。
              Vercel の環境変数 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_BUCKET) を
              設定してください。
            </p>
          )}
        </CardContent>
      </Card>

      {/* 月別 反映状況 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月別 反映状況 (直近 12 ヶ月)</CardTitle>
          <CardDescription>
            画像が Storage に入っているかを月ごとに集計
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              データがありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月 (JST)</TableHead>
                  <TableHead className="text-right">工程数</TableHead>
                  <TableHead className="text-right">画像枚数</TableHead>
                  <TableHead className="text-right">Storage 反映済</TableHead>
                  <TableHead className="text-right">未反映</TableHead>
                  <TableHead className="text-right">反映率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((m) => {
                  const rate =
                    m.totalImages === 0
                      ? '—'
                      : `${((m.imagesInStorage / m.totalImages) * 100).toFixed(0)}%`;
                  return (
                    <TableRow key={m.month}>
                      <TableCell className="font-mono text-xs">{m.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.totalEvents.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.totalImages.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {m.imagesInStorage.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.imagesNotInStorage.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rate}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
