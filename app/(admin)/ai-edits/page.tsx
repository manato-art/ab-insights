// AI 修正指示一覧
// - /edit-region 経由でユーザーが AI に出した「修正指示」をジャンル別に集計
// - 種別 (kind) 別の頻度 + 具体的な指示文の頻度
//
// データ源: Event.aiEditInstructionsJson (AI 修正エンドポイント経由の指示配列)
// 訴求関連の集計は /appeals 側に分離済み。

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
import { DeleteRowButton } from '../appeals/delete-buttons';
import {
  type AiEditInstructionRow,
  type AiEditKindRow,
  kindLabel,
  parseAiEditJson,
} from '../appeals/_helpers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI 修正指示 — ab-insights' };

// ============================================================
// 集計
// ============================================================

type EventForAiEdit = {
  genre: string | null;
  aiEditInstructionsJson: string | null;
};

type GenreAiEditStats = {
  genre: string;
  totalEvents: number;
  totalInstructions: number;
  kinds: AiEditKindRow[];
  instructions: AiEditInstructionRow[];
};

function aggregate(events: EventForAiEdit[]): GenreAiEditStats[] {
  const byGenre = new Map<string, EventForAiEdit[]>();
  for (const e of events) {
    const g = e.genre ?? '未分類';
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g)!.push(e);
  }

  const out: GenreAiEditStats[] = [];
  for (const [genre, list] of byGenre.entries()) {
    const kindCount = new Map<string, number>();
    const instCount = new Map<string, { kind: string; text: string; count: number }>();
    let totalInstructions = 0;

    for (const e of list) {
      const items = parseAiEditJson(e.aiEditInstructionsJson);
      for (const item of items) {
        const kind = (item.kind ?? '').trim();
        const text = (item.text ?? '').trim();
        if (!kind && !text) continue;
        totalInstructions += 1;
        if (kind) {
          kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
        }
        if (kind && text) {
          const key = `${kind}__${text}`;
          const cur = instCount.get(key);
          if (cur) cur.count += 1;
          else instCount.set(key, { kind, text, count: 1 });
        }
      }
    }

    const kinds: AiEditKindRow[] = Array.from(kindCount.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    const instructions: AiEditInstructionRow[] = Array.from(instCount.values())
      .sort((a, b) => b.count - a.count);

    out.push({
      genre,
      totalEvents: list.length,
      totalInstructions,
      kinds,
      instructions,
    });
  }
  // 件数の多い順
  out.sort((a, b) => b.totalInstructions - a.totalInstructions);
  return out;
}

async function getAiEditStats(selectedGenre: string | null) {
  const whereStats = { aiEditInstructionsJson: { not: null } };
  const where = selectedGenre
    ? { AND: [{ genre: selectedGenre }, whereStats] }
    : whereStats;

  const [events, allGenres] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        genre: true,
        aiEditInstructionsJson: true,
      },
    }),
    prisma.event.groupBy({
      by: ['genre'],
      where: whereStats,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);

  const stats = aggregate(events);
  const genreOptions = allGenres
    .filter((g): g is typeof g & { genre: string } => !!g.genre)
    .map((g) => ({ genre: g.genre, count: g._count._all }));

  return { stats, genreOptions };
}

// ============================================================
// ページ
// ============================================================

export default async function AiEditsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const sp = await searchParams;
  const selectedGenre = sp.genre ?? null;

  const { stats, genreOptions } = await getAiEditStats(selectedGenre);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI 修正指示</h1>
        <p className="text-sm text-muted-foreground mt-1">
          /edit-region 経由でユーザーが AI に出した修正指示をジャンル別に集計(訴求統計は{' '}
          <Link href="/appeals" className="underline hover:text-foreground">
            訴求ポイント統計
          </Link>{' '}
          へ)
        </p>
      </div>

      {/* ジャンルフィルタ */}
      <Card>
        <CardHeader>
          <CardTitle>ジャンル</CardTitle>
          <CardDescription>
            フィルタで絞り込み。AI 修正指示を持つ生成画像が対象
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <GenreChip href="/ai-edits" label="すべて" active={!selectedGenre} />
            {genreOptions.map((g) => (
              <GenreChip
                key={g.genre}
                href={`/ai-edits?genre=${encodeURIComponent(g.genre)}`}
                label={`${g.genre} (${g.count})`}
                active={selectedGenre === g.genre}
              />
            ))}
            {genreOptions.length === 0 && (
              <span className="text-sm text-muted-foreground">
                データがまだありません。ab-system で AI 修正(/edit-region)を実行するとここに溜まります。
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ジャンルごとのブロック */}
      {stats.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
            該当データがありません
          </CardContent>
        </Card>
      ) : (
        stats.map((g) => (
          <section key={g.genre} className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">{g.genre}</h2>
              <span className="text-xs text-muted-foreground">
                AI 修正イベント: {g.totalEvents.toLocaleString()} 件 / 指示総数:{' '}
                {g.totalInstructions.toLocaleString()} 件
              </span>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>修正指示</CardTitle>
                <CardDescription>
                  種別 (kind) 別の頻度 + 具体的な指示文の頻度
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {g.instructions.length === 0 && g.kinds.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    AI 修正データがまだありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {g.kinds.length > 0 && (
                      <div className="px-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          種別別頻度
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.kinds.map((k) => (
                            <span
                              key={k.kind}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-xs"
                            >
                              <span className="font-medium">{kindLabel(k.kind)}</span>
                              <span className="tabular-nums text-muted-foreground">
                                × {k.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {g.instructions.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[120px]">種別</TableHead>
                            <TableHead>指示文</TableHead>
                            <TableHead className="text-right">回数</TableHead>
                            <TableHead className="w-[44px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.instructions.slice(0, 50).map((row) => (
                            <TableRow key={`${row.kind}__${row.text}`}>
                              <TableCell className="text-xs">
                                <span className="inline-block px-2 py-0.5 rounded bg-muted">
                                  {kindLabel(row.kind)}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm whitespace-pre-wrap break-words max-w-[560px]">
                                {row.text}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.count.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <DeleteRowButton
                                  kind="aiedit"
                                  genre={g.genre}
                                  args={{
                                    instructionKind: row.kind,
                                    text: row.text,
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function GenreChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm border transition ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background hover:bg-accent border-border'
      }`}
    >
      {label}
    </Link>
  );
}
