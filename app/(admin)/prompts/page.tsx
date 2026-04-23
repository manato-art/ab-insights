// プロンプト管理ページ (Server Component)
// - GenrePrompt を genre 毎にタブで表示
// - ブロックカードでは enabled / priority / 上下移動 / 編集 / 削除 を提供
// - ページ下部に「ab-system が取得するプレビュー」を表示
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

export const metadata = { title: 'プロンプト管理 — ab-insights' };

// デフォルトで表示するジャンル(未登録でもタブを出しておく)
const DEFAULT_GENRES = ['共通', '化粧品', 'サプリ', 'アパレル'];

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre: selectedGenre } = await searchParams;

  const allBlocks = await prisma.genrePrompt.findMany({
    orderBy: [{ genre: 'asc' }, { priority: 'asc' }, { id: 'asc' }],
  });

  // genre ごとに group by
  const byGenre = new Map<string, PromptBlock[]>();
  for (const b of allBlocks) {
    const arr = byGenre.get(b.genre) ?? [];
    arr.push(b as PromptBlock);
    byGenre.set(b.genre, arr);
  }

  // タブ表示対象: デフォルト + 既存に存在する未登録ジャンル
  const tabGenres = Array.from(
    new Set([...DEFAULT_GENRES, ...Array.from(byGenre.keys())]),
  );
  const existingGenres = Array.from(byGenre.keys()).sort();

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
          return (
            <TabsContent key={g} value={g} className="space-y-4 pt-2">
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
    <Card size="sm" className={block.enabled ? '' : 'opacity-60'}>
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
              <CardDescription className="mt-1">{block.note}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EnabledToggle block={block} />
            <MoveButtons block={block} isFirst={isFirst} isLast={isLast} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto">
          {block.content}
        </pre>
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
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return String(d);
  }
}
