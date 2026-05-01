// 工程履歴一覧ページ (Server Component)
// - URL query param でフィルタ / ページネーション
// - Event (現役) と ArchivedEvent (過去月) を統合表示
// - 行は lite 表示。 画像本体は /events/{source}/{id}/images で別途 (signed URL ダウンロード)
import Link from 'next/link';
import {
  buildEventsFilter,
  type EventsSearchParams,
} from '@/lib/event-filter';
import { formatJstShortDateTime } from '@/lib/format';
import {
  combinedCount,
  combinedFindManyLite,
} from '@/lib/event-source';
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
import { FilterBar } from './filter-bar';

export const dynamic = 'force-dynamic';
export const metadata = { title: '工程履歴一覧 — ab-insights' };

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

type SearchParams = EventsSearchParams;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const perPage = clamp(
    parseInt(sp.perPage ?? String(DEFAULT_PER_PAGE), 10) || DEFAULT_PER_PAGE,
    1,
    MAX_PER_PAGE,
  );

  const { where, period, range } = buildEventsFilter(sp);

  const [total, rows] = await Promise.all([
    combinedCount(where),
    combinedFindManyLite({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // 現在のフィルタを保ったまま エクスポート / 印刷 へ渡す
  const exportQuery = (() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== 'page' && k !== 'perPage') params.set(k, String(v));
    }
    return params.toString();
  })();
  const csvHref = `/api/export/events.csv${exportQuery ? `?${exportQuery}` : ''}`;
  const printHref = `/events/print${exportQuery ? `?${exportQuery}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">工程履歴一覧</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ab-system からの画像生成記録を閲覧します。 当月分はリアルタイム、 過去月はアーカイブから自動表示。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <a href={csvHref} download>
              CSV ダウンロード
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={printHref} target="_blank" rel="noopener noreferrer">
              印刷 / PDF 保存
            </Link>
          </Button>
        </div>
      </div>

      <FilterBar
        initial={{
          genre: sp.genre ?? '',
          endpoint: sp.endpoint ?? '',
          user: sp.user ?? '',
          period: period ?? '',
          from: range.fromStr,
          to: range.toStr,
          downloaded: sp.downloaded ?? '',
          horizontallyExpanded: sp.horizontallyExpanded ?? '',
        }}
      />

      {sp.userId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 ring-1 ring-primary/20 text-xs">
          <span className="text-muted-foreground">ユーザー絞り込み中:</span>
          <code className="font-mono">{sp.userId}</code>
          <Link
            href="/events"
            className="ml-auto text-primary hover:underline"
          >
            解除
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          全 <span className="font-mono text-foreground">{total}</span> 件 /{' '}
          ページ{page} / {totalPages}
        </div>
        <div>表示 {perPage} 件</div>
      </div>

      <div className="rounded-lg ring-1 ring-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[140px]">日時</TableHead>
              <TableHead>ユーザー</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>ジャンル</TableHead>
              <TableHead>訴求</TableHead>
              <TableHead className="text-right">枚数</TableHead>
              <TableHead>シグナル</TableHead>
              <TableHead className="text-right">刺さり度</TableHead>
              <TableHead>画像</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  条件に合致する工程がありません
                </TableCell>
              </TableRow>
            ) : (
              rows.map((ev) => (
                <TableRow key={`${ev.source}-${ev.id}`}>
                  <TableCell className="font-mono text-xs">
                    {formatJstShortDateTime(ev.createdAt)}
                    {ev.source === 'archived' && (
                      <Badge variant="outline" className="ml-1 text-[9px]">
                        アーカイブ
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <span
                      className="truncate block text-sm"
                      title={ev.abSystemUserName ?? ev.abSystemUserId}
                    >
                      {ev.abSystemUserName ?? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {ev.abSystemUserId}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{endpointLabel(ev.endpoint)}</Badge>
                  </TableCell>
                  <TableCell>
                    {ev.genre ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {ev.appealType && (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {ev.appealType}
                        </span>
                      )}
                      <span
                        className="truncate text-sm"
                        title={ev.appealText ?? ''}
                      >
                        {ev.appealText || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ev.imageCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {ev.downloaded && <Badge variant="default">DL</Badge>}
                      {ev.horizontallyExpanded && (
                        <Badge variant="default">横展開</Badge>
                      )}
                      {ev.aiEdited && (
                        <Badge variant="secondary">AI編集</Badge>
                      )}
                      {!ev.downloaded &&
                        !ev.horizontallyExpanded &&
                        !ev.aiEdited && (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ev.hitScore !== null ? ev.hitScore.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="xs" asChild>
                      <Link
                        href={`/events/${ev.source}/${ev.id}/images`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        画像
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} totalPages={totalPages} sp={sp} />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: SearchParams;
}) {
  if (totalPages <= 1) return null;

  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== 'page') params.set(k, String(v));
    }
    params.set('page', String(p));
    return `/events?${params.toString()}`;
  };

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      {canPrev ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={makeHref(page - 1)}>前へ</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          前へ
        </Button>
      )}
      <span className="text-sm font-mono px-3">
        {page} / {totalPages}
      </span>
      {canNext ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={makeHref(page + 1)}>次へ</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          次へ
        </Button>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function endpointLabel(endpoint: string): string {
  const m: Record<string, string> = {
    'generate-images': '新規生成',
    'generate-similar-one': '横展開',
    'improve-images': '改善',
    'edit-region': 'AI部分修正',
    'transform-image': '変形',
    'generate-reference': '参考広告ベース',
    'stylize-product': 'スタイル変換',
    'upscale-image': '画質向上',
    'resize-image': 'リサイズ',
  };
  return m[endpoint] ?? endpoint;
}
