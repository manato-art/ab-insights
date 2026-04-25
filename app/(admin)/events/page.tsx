// イベント一覧ページ (Server Component)
// - URL query param でフィルタ / ページネーション
// - 行クリックで詳細 Dialog(client component で制御)
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { parsePeriod, periodStartDate } from '@/lib/period';
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
import {
  EventRow,
  type EventDetailPayload,
} from './event-detail';

export const metadata = { title: '生成画像一覧 — ab-insights' };

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

type SearchParams = {
  page?: string;
  perPage?: string;
  genre?: string;
  endpoint?: string;
  user?: string;
  period?: string; // 'today' | 'week' | 'month'
  downloaded?: string;
  horizontallyExpanded?: string;
};

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

  // --- where 構築 ---
  const period = parsePeriod(sp.period);
  const periodFrom = periodStartDate(period);

  const where: {
    genre?: string;
    endpoint?: string;
    abSystemUserName?: { contains: string; mode: 'insensitive' };
    createdAt?: { gte: Date };
    downloaded?: boolean;
    horizontallyExpanded?: boolean;
  } = {};
  if (sp.genre) where.genre = sp.genre;
  if (sp.endpoint) where.endpoint = sp.endpoint;
  if (sp.user) where.abSystemUserName = { contains: sp.user, mode: 'insensitive' };
  if (periodFrom) where.createdAt = { gte: periodFrom };
  if (sp.downloaded === '1') where.downloaded = true;
  if (sp.downloaded === '0') where.downloaded = false;
  if (sp.horizontallyExpanded === '1') where.horizontallyExpanded = true;
  if (sp.horizontallyExpanded === '0') where.horizontallyExpanded = false;

  // --- 並列で count + data + 詳細(images + aiEdits) を一回取得 ---
  const [total, rows] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        images: { orderBy: { imageIndex: 'asc' } },
        aiEdits: { orderBy: { createdAt: 'asc' } },
      },
    }),
  ]);

  // --- 行データを client 向け payload に変換 ---
  // - Buffer → base64 dataURL
  // - Date → ISO string
  const events: EventDetailPayload[] = rows.map((r) => ({
    id: r.id,
    abSystemUserId: r.abSystemUserId,
    abSystemUserName: r.abSystemUserName,
    endpoint: r.endpoint,
    model: r.model,
    createdAt: r.createdAt.toISOString(),
    genre: r.genre,
    subGenre: r.subGenre,
    gender: r.gender,
    ageGroup: r.ageGroup,
    platform: r.platform,
    appealType: r.appealType,
    appealText: r.appealText,
    additionalNote: r.additionalNote,
    styleAxesJson: r.styleAxesJson,
    urlAnalysisSummary: r.urlAnalysisSummary,
    promptFull: r.promptFull,
    promptHash: r.promptHash,
    imageCount: r.imageCount,
    downloaded: r.downloaded,
    horizontallyExpanded: r.horizontallyExpanded,
    aiEdited: r.aiEdited,
    regeneratedCount: r.regeneratedCount,
    hitScore: r.hitScore,
    images: r.images.map((img) => ({
      id: img.id,
      imageIndex: img.imageIndex,
      dataUrl: img.thumbnail
        ? 'data:image/webp;base64,' +
          Buffer.from(img.thumbnail).toString('base64')
        : null,
      downloaded: img.downloaded,
      aiEdited: img.aiEdited,
    })),
    aiEdits: r.aiEdits.map((e) => ({
      id: e.id,
      kind: e.kind,
      instruction: e.instruction,
      createdAt: e.createdAt.toISOString(),
    })),
    // ① 信号粒度・評価
    decisionTimeMs: r.decisionTimeMs,
    regenerationReason: r.regenerationReason,
    rating: r.rating,
    ratingComment: r.ratingComment,
    tagsJson: r.tagsJson,
    // ② 文脈入力
    campaignGoal: r.campaignGoal,
    targetInterestsJson: r.targetInterestsJson,
    targetRegion: r.targetRegion,
    targetIncomeRange: r.targetIncomeRange,
    budgetRange: r.budgetRange,
    targetCpa: r.targetCpa,
    landingPageUrl: r.landingPageUrl,
    cvPointType: r.cvPointType,
    // ⑤ 暗黙シグナル
    sessionDurationMs: r.sessionDurationMs,
    totalHoverMs: r.totalHoverMs,
    zoomCount: r.zoomCount,
    tabSwitchCount: r.tabSwitchCount,
    comparisonViewMs: r.comparisonViewMs,
    rightClickSaveCount: r.rightClickSaveCount,
    // ⑥ ネガティブ学習
    discardedAfterEdit: r.discardedAfterEdit,
    regenerationDiffJson: r.regenerationDiffJson,
  }));

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">生成画像一覧</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ab-system からの画像生成記録を閲覧します。
        </p>
      </div>

      <FilterBar
        initial={{
          genre: sp.genre ?? '',
          endpoint: sp.endpoint ?? '',
          user: sp.user ?? '',
          period: period ?? '',
          downloaded: sp.downloaded ?? '',
          horizontallyExpanded: sp.horizontallyExpanded ?? '',
        }}
      />

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  条件に合致する生成画像がありません
                </TableCell>
              </TableRow>
            ) : (
              events.map((ev) => (
                <EventRow key={ev.id} event={ev}>
                  <TableCell className="font-mono text-xs">
                    {formatShort(ev.createdAt)}
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
                    <Badge variant="secondary">
                      {endpointLabel(ev.endpoint)}
                    </Badge>
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
                </EventRow>
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

  // 既存 sp を保持しつつ page だけ差し替える helper
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

// ------------------------------------------------------------
// utils
// ------------------------------------------------------------
function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function endpointLabel(endpoint: string): string {
  const m: Record<string, string> = {
    'generate-images': '画像生成',
    'generate-similar-one': '横展開',
    'improve-images': '改善',
    'edit-region': 'AI編集',
  };
  return m[endpoint] ?? endpoint;
}

function formatShort(iso: string) {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
