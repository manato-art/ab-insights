// プロンプト管理ページ (Server Component)
// - GenrePrompt を genre 毎にタブで表示
// - ブロックカードでは enabled / priority / 上下移動 / 編集 / 削除 を提供
// - ページ下部に「ab-system が取得するプレビュー」を表示
import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  NewBlockButton,
  EditBlockButton,
  DeleteBlockButton,
  EnabledToggle,
  MoveButtons,
  type PromptBlock,
} from './prompt-editor';
import { GeneratePromptPanel } from './generate-panel';
import { InlineContentEditor } from './inline-content-editor';
import { formatJstDateTime } from '@/lib/format';

export const metadata = { title: 'プロンプト管理 — ab-insights' };

// Vision 付き自動更新が最大 50 秒程度かかる想定のため、Server Action のタイムアウトを延長。
// Hobby は 60s 上限、Pro は 300s。Next.js は環境に応じて自動で丸める。
export const maxDuration = 90;

// デフォルトで表示するジャンル(未登録でもタブを出しておく)
// 「全て」はすべてのジャンル共通のプロンプトブロックを置く場所(ab-system が常に連結する)。
const DEFAULT_GENRES = ['全て'];

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre: selectedGenre } = await searchParams;

  // GenrePrompt と Event.genre の両方をまとめて取得
  const [allBlocks, eventGenreRows] = await Promise.all([
    prisma.genrePrompt.findMany({
      orderBy: [{ genre: 'asc' }, { priority: 'asc' }, { id: 'asc' }],
    }),
    // Event に記録された全ジャンル(GenrePrompt が未登録でもタブに出す)
    prisma.event.groupBy({
      by: ['genre'],
      where: { genre: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // genre ごとに group by
  const byGenre = new Map<string, PromptBlock[]>();
  for (const b of allBlocks) {
    const arr = byGenre.get(b.genre) ?? [];
    arr.push(b as PromptBlock);
    byGenre.set(b.genre, arr);
  }

  const eventGenres = eventGenreRows
    .map((r) => r.genre)
    .filter((g): g is string => !!g);

  // タブ表示対象:
  // - DEFAULT_GENRES (「全て」) は常に表示
  // - 手動/自動問わずブロックが 1 件以上あるジャンル
  // - Event が記録されたジャンル(プロンプト更新候補として)
  // - URL で指定中のジャンル(存在しない名前でも飛んできたら表示)
  // 空(ブロックなし & Event なし)の placeholder は出さない。
  const tabGenres = Array.from(
    new Set([
      ...DEFAULT_GENRES,
      ...Array.from(byGenre.keys()),
      ...eventGenres,
      ...(selectedGenre ? [selectedGenre] : []),
    ]),
  );
  const existingGenres = Array.from(
    new Set([...Array.from(byGenre.keys()), ...eventGenres]),
  ).sort();

  // クエリで genre 指定があればそれを、無ければ先頭
  const defaultTab =
    selectedGenre && tabGenres.includes(selectedGenre)
      ? selectedGenre
      : tabGenres[0];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">プロンプト管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ジャンル別の追加プロンプトブロックを管理します。ab-system は有効化されたブロックを優先度順に取得して挿入します。
          </p>
        </div>
        <NewBlockButton
          existingGenres={existingGenres}
          defaultGenre={defaultTab}
        />
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="flex-wrap h-auto">
          {tabGenres.map((g) => {
            const count = byGenre.get(g)?.length ?? 0;
            return (
              <TabsTrigger key={g} value={g}>
                {g}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {count}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabGenres.map((g) => {
          const blocks = byGenre.get(g) ?? [];
          const isAllTab = g === '全て';
          return (
            <TabsContent key={g} value={g} className="space-y-4 pt-2">
              <GeneratePromptPanel genre={g} existingGenres={existingGenres} />

              {blocks.length === 0 ? (
                <EmptyState genre={g} existingGenres={existingGenres} />
              ) : (
                <div className="space-y-3">
                  {blocks.map((b, idx) => (
                    <BlockCard
                      key={b.id}
                      block={b}
                      isFirst={idx === 0}
                      isLast={idx === blocks.length - 1}
                    />
                  ))}
                </div>
              )}

              {/* 「全て」タブ: 各ジャンルの概覧を大きな外枠で囲んで表示 */}
              {isAllTab && (
                <>
                  <Separator className="my-6" />
                  <GenreOverview
                    byGenre={byGenre}
                    eventGenres={eventGenres}
                  />
                </>
              )}

              <Separator className="my-6" />

              {/* ab-system が取得する連結プレビュー */}
              <PreviewPanel genre={g} blocks={blocks} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

/**
 * 「全て」タブで表示する各ジャンル概覧。
 * 大きな外枠の Card でラップし、中に小さい Card を並べる。
 * 編集は各ジャンルの個別タブへ誘導(Link)。
 */
function GenreOverview({
  byGenre,
  eventGenres,
}: {
  byGenre: Map<string, PromptBlock[]>;
  eventGenres: string[];
}) {
  const genres = Array.from(
    new Set([...byGenre.keys(), ...eventGenres]),
  )
    .filter((g) => g !== '全て')
    .sort();

  return (
    <Card>
      <CardHeader>
        <CardTitle>各ジャンルのプロンプト一覧</CardTitle>
        <CardDescription>
          ジャンル個別のブロックをここから確認できます。編集は各ジャンルのタブへ移動してください。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {genres.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            ジャンル固有のブロックはまだありません
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {genres.map((g) => {
              const gBlocks = byGenre.get(g) ?? [];
              return (
                <Link
                  key={g}
                  href={`/prompts?genre=${encodeURIComponent(g)}`}
                  className="block rounded-lg border bg-card hover:bg-accent/50 transition p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {gBlocks.length} ブロック
                    </Badge>
                  </div>
                  {gBlocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      ブロック未登録(Event あり)
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {gBlocks.map((b) => (
                        <div
                          key={b.id}
                          className="text-xs border-l-2 border-muted pl-2 py-0.5"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{b.blockName}</span>
                            <Badge variant="outline" className="text-[9px] font-mono">
                              p{b.priority}
                            </Badge>
                            {!b.enabled && (
                              <Badge variant="outline" className="text-[9px]">
                                無効
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate mt-0.5">
                            {b.content.slice(0, 70)}
                            {b.content.length > 70 ? '…' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  genre,
  existingGenres,
}: {
  genre: string;
  existingGenres: string[];
}) {
  return (
    <Card size="sm">
      <CardContent className="py-10 text-center space-y-3">
        <div className="text-sm text-muted-foreground">
          「{genre}」のブロックはまだ登録されていません
        </div>
        <NewBlockButton existingGenres={existingGenres} defaultGenre={genre} />
      </CardContent>
    </Card>
  );
}

function BlockCard({
  block,
  isFirst,
  isLast,
}: {
  block: PromptBlock;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <Card
      size="sm"
      className={`transition-colors hover:bg-accent/30 ${
        block.enabled ? '' : 'opacity-60'
      }`}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <span>{block.blockName}</span>
              <Badge variant="secondary" className="font-mono">
                priority {block.priority}
              </Badge>
              {!block.enabled && (
                <Badge variant="outline">無効</Badge>
              )}
            </CardTitle>
            {block.note && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200/60 bg-amber-50/50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                <span aria-hidden className="select-none">💡</span>
                <div className="min-w-0">
                  <span className="font-semibold">運用メモ:</span>{' '}
                  <span className="text-amber-900/90 dark:text-amber-100/90">{block.note}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EnabledToggle block={block} />
            <MoveButtons block={block} isFirst={isFirst} isLast={isLast} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <InlineContentEditor blockId={block.id} initialContent={block.content} />
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            更新: {formatDateTime(block.updatedAt)}
          </div>
          <div className="flex gap-2">
            <EditBlockButton block={block} />
            <DeleteBlockButton block={block} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewPanel({
  genre,
  blocks,
}: {
  genre: string;
  blocks: PromptBlock[];
}) {
  const enabled = blocks.filter((b) => b.enabled);
  const preview = enabled.map((b) => b.content).join('\n\n---\n\n');
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">ab-system への反映プレビュー</CardTitle>
        <CardDescription>
          有効化されているブロックを priority 順に連結した結果です(GET /api/prompts/{genre})。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enabled.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            有効なブロックがありません
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/50 rounded-md p-3 max-h-80 overflow-y-auto">
            {preview}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateTime(d: Date) {
  return formatJstDateTime(d);
}
