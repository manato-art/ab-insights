// 訴求ポイント統計
// - ジャンル別に「選択された訴求ポイント」の出現頻度と DL 率
// - ジャンル別に「書き換えられた訴求ポイント」の before → after ペア一覧
// - ジャンル別に「AI 修正指示」(edit-region イベント) の kind 別/文言別頻度
//
// データ源:
//   Event.appealOriginalText (AI 原文) vs Event.appealText (最終確定版・keywords 付き)
//   Event.aiEditInstructionsJson (AI 修正エンドポイント経由の指示配列)
// 古いイベント(いずれも null)は統計対象外。

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
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = { title: '訴求ポイント統計 — ab-insights' };

// ============================================================
// 型・ユーティリティ
// ============================================================

type SelectedRow = {
  originalText: string;
  count: number;
  downloaded: number;
  avgHitScore: number | null;
  appealTypes: Set<string>;
  indexHistogram: Record<number, number>; // 1/2/3 の度数
};

type RewrittenRow = {
  originalText: string;
  rewrittenText: string;
  count: number;
  downloaded: number;
};

type AiEditKindRow = {
  kind: string;
  count: number;
};

type AiEditInstructionRow = {
  kind: string;
  text: string;
  count: number;
};

type GenreStats = {
  genre: string;
  totalAppeal: number;
  totalAiEdit: number;
  selected: SelectedRow[];
  rewritten: RewrittenRow[];
  aiEditKinds: AiEditKindRow[];
  aiEditInstructions: AiEditInstructionRow[];
};

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** appealText から末尾の 【使用キーワード：...】 行を除去して原文部分を返す */
function extractPlainAppealText(appealText: string | null): string {
  if (!appealText) return '';
  return appealText.replace(/\n*【使用キーワード：[^】]*】\s*$/u, '').trim();
}

/** AI 修正の kind を日本語に */
function kindLabel(kind: string): string {
  const m: Record<string, string> = {
    background: '背景',
    text: 'テキスト',
    text_color: 'テキスト色',
    text_content: 'テキスト文言',
    text_size: 'テキストサイズ',
    person: '人物',
    color: '色',
    product_swap: '商品差し替え',
    remove: '削除',
  };
  return m[kind] ?? kind;
}

type AiEditItem = {
  kind?: string | null;
  text?: string | null;
};

function parseAiEditJson(json: string | null): AiEditItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

// ============================================================
// データ取得
// ============================================================

type EventForStats = {
  genre: string | null;
  endpoint: string;
  appealType: string | null;
  appealText: string | null;
  appealOriginalText: string | null;
  appealSelectedIndex: number | null;
  aiEditInstructionsJson: string | null;
  downloaded: boolean;
  hitScore: number | null;
};

function aggregate(events: EventForStats[]): GenreStats[] {
  const byGenre = new Map<string, EventForStats[]>();
  for (const e of events) {
    const g = e.genre ?? '未分類';
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g)!.push(e);
  }

  const result: GenreStats[] = [];
  for (const [genre, rows] of byGenre.entries()) {
    const selMap = new Map<string, SelectedRow>();
    const rewMap = new Map<string, RewrittenRow>();
    const kindMap = new Map<string, number>();
    const instMap = new Map<string, AiEditInstructionRow>();
    let totalAppeal = 0;
    let totalAiEdit = 0;

    for (const e of rows) {
      // 訴求(選択/書き換え)集計 — appealOriginalText を持つイベント
      if (e.appealOriginalText) {
        totalAppeal += 1;
        const orig = e.appealOriginalText.trim();
        if (orig) {
          const sel = selMap.get(orig) ?? {
            originalText: orig,
            count: 0,
            downloaded: 0,
            avgHitScore: null,
            appealTypes: new Set<string>(),
            indexHistogram: {},
          };
          sel.count += 1;
          if (e.downloaded) sel.downloaded += 1;
          if (e.appealType) sel.appealTypes.add(e.appealType);
          if (e.appealSelectedIndex) {
            sel.indexHistogram[e.appealSelectedIndex] =
              (sel.indexHistogram[e.appealSelectedIndex] ?? 0) + 1;
          }
          if (e.hitScore !== null) {
            const prevAvg = sel.avgHitScore ?? 0;
            const prevCount = sel.count - 1;
            sel.avgHitScore =
              (prevAvg * prevCount + e.hitScore) / sel.count;
          }
          selMap.set(orig, sel);

          const plainFinal = extractPlainAppealText(e.appealText);
          if (plainFinal && plainFinal !== orig) {
            const key = `${orig}\u0000${plainFinal}`;
            const rew = rewMap.get(key) ?? {
              originalText: orig,
              rewrittenText: plainFinal,
              count: 0,
              downloaded: 0,
            };
            rew.count += 1;
            if (e.downloaded) rew.downloaded += 1;
            rewMap.set(key, rew);
          }
        }
      }

      // AI 修正指示集計
      const items = parseAiEditJson(e.aiEditInstructionsJson);
      if (items.length > 0) {
        totalAiEdit += 1;
        for (const it of items) {
          const kind = (it.kind || 'unknown').trim();
          const text = (it.text || '').trim();
          kindMap.set(kind, (kindMap.get(kind) ?? 0) + 1);
          if (text) {
            const key = `${kind}\u0000${text}`;
            const row = instMap.get(key) ?? { kind, text, count: 0 };
            row.count += 1;
            instMap.set(key, row);
          }
        }
      }
    }

    const selected = Array.from(selMap.values()).sort(
      (a, b) => b.count - a.count,
    );
    const rewritten = Array.from(rewMap.values()).sort(
      (a, b) => b.count - a.count,
    );
    const aiEditKinds = Array.from(kindMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    const aiEditInstructions = Array.from(instMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    result.push({
      genre,
      totalAppeal,
      totalAiEdit,
      selected,
      rewritten,
      aiEditKinds,
      aiEditInstructions,
    });
  }

  result.sort(
    (a, b) => b.totalAppeal + b.totalAiEdit - (a.totalAppeal + a.totalAiEdit),
  );
  return result;
}

async function getAppealsStats(selectedGenre: string | null) {
  const whereStats = {
    OR: [
      { appealOriginalText: { not: null } },
      { aiEditInstructionsJson: { not: null } },
    ],
  };
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
        endpoint: true,
        appealType: true,
        appealText: true,
        appealOriginalText: true,
        appealSelectedIndex: true,
        aiEditInstructionsJson: true,
        downloaded: true,
        hitScore: true,
      },
    }),
    prisma.event.groupBy({
      by: ['genre'],
      where: whereStats,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);

  const genreStats = aggregate(events);
  const genreOptions = allGenres
    .filter((g): g is typeof g & { genre: string } => !!g.genre)
    .map((g) => ({ genre: g.genre, count: g._count._all }));

  return { genreStats, genreOptions };
}

// ============================================================
// ページ
// ============================================================

export default async function AppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const sp = await searchParams;
  const selectedGenre = sp.genre ?? null;

  const { genreStats, genreOptions } = await getAppealsStats(selectedGenre);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          訴求ポイント統計
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          「どの訴求が選ばれたか」「どう書き換えられたか」「AI 修正でどんな指示が出たか」をジャンル別に集計
        </p>
      </div>

      {/* ジャンルフィルタ */}
      <Card>
        <CardHeader>
          <CardTitle>ジャンル</CardTitle>
          <CardDescription>
            フィルタで絞り込み。訴求原文 or AI 修正指示のどちらかを持つイベントを対象
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <GenreChip href="/appeals" label="すべて" active={!selectedGenre} />
            {genreOptions.map((g) => (
              <GenreChip
                key={g.genre}
                href={`/appeals?genre=${encodeURIComponent(g.genre)}`}
                label={`${g.genre} (${g.count})`}
                active={selectedGenre === g.genre}
              />
            ))}
            {genreOptions.length === 0 && (
              <span className="text-sm text-muted-foreground">
                データがまだありません。ab-system
                から画像生成・AI 修正を行うとデータが溜まります。
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ジャンルごとのブロック */}
      {genreStats.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
            該当データがありません
          </CardContent>
        </Card>
      ) : (
        genreStats.map((g) => (
          <section key={g.genre} className="space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">{g.genre}</h2>
              <span className="text-xs text-muted-foreground">
                訴求統計対象: {g.totalAppeal.toLocaleString()} 件 / AI 修正:{' '}
                {g.totalAiEdit.toLocaleString()} 件
              </span>
            </div>

            {/* 選択された訴求 */}
            <Card>
              <CardHeader>
                <CardTitle>選択された訴求ポイント</CardTitle>
                <CardDescription>
                  AI が提案した ①②③ のうち、ユーザーが選んだ訴求文の頻度
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {g.selected.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    該当なし
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>訴求文 (AI 原文)</TableHead>
                        <TableHead className="text-right">選択回数</TableHead>
                        <TableHead className="text-right">DL率</TableHead>
                        <TableHead className="text-right">
                          平均 hit_score
                        </TableHead>
                        <TableHead className="text-right">
                          選ばれた位置
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.selected.slice(0, 20).map((row) => (
                        <TableRow key={row.originalText}>
                          <TableCell className="max-w-[380px]">
                            <div className="text-sm whitespace-pre-wrap break-words">
                              {row.originalText}
                            </div>
                            {row.appealTypes.size > 0 && (
                              <div className="text-[10px] font-mono text-muted-foreground mt-1">
                                {Array.from(row.appealTypes).join(' / ')}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pct(row.downloaded, row.count)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.avgHitScore === null
                              ? '—'
                              : row.avgHitScore.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {formatIndexHistogram(row.indexHistogram)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 書き換えられた訴求 */}
            <Card>
              <CardHeader>
                <CardTitle>書き換えられた訴求ポイント</CardTitle>
                <CardDescription>
                  AI 原文 → ユーザー確定文の差分ペア
                  (キーワードサフィックスは除外して比較)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {g.rewritten.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    書き換えデータがまだありません
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>AI 原文</TableHead>
                        <TableHead>書き換え後</TableHead>
                        <TableHead className="text-right">回数</TableHead>
                        <TableHead className="text-right">DL率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rewritten.slice(0, 20).map((row) => (
                        <TableRow
                          key={`${row.originalText}__${row.rewrittenText}`}
                        >
                          <TableCell className="max-w-[280px] text-sm whitespace-pre-wrap break-words text-muted-foreground">
                            {row.originalText}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-sm whitespace-pre-wrap break-words">
                            {row.rewrittenText}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.count.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pct(row.downloaded, row.count)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* AI 修正指示 */}
            <Card>
              <CardHeader>
                <CardTitle>AI 修正指示</CardTitle>
                <CardDescription>
                  /edit-region 経由でユーザーが AI に出した指示
                  (kind 別頻度 + 具体的な指示文)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {g.aiEditInstructions.length === 0 &&
                g.aiEditKinds.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    AI 修正データがまだありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {g.aiEditKinds.length > 0 && (
                      <div className="px-4">
                        <div className="text-xs text-muted-foreground mb-2">
                          種別別頻度
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.aiEditKinds.map((k) => (
                            <span
                              key={k.kind}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-xs"
                            >
                              <span className="font-medium">
                                {kindLabel(k.kind)}
                              </span>
                              <span className="tabular-nums text-muted-foreground">
                                × {k.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {g.aiEditInstructions.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[120px]">種別</TableHead>
                            <TableHead>指示文</TableHead>
                            <TableHead className="text-right">回数</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.aiEditInstructions.slice(0, 30).map((row) => (
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

// ============================================================
// サブコンポーネント
// ============================================================

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
      className={`px-3 py-1.5 rounded-full text-xs border transition ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-foreground/80 hover:bg-accent'
      }`}
    >
      {label}
    </Link>
  );
}

function formatIndexHistogram(hist: Record<number, number>): string {
  const parts: string[] = [];
  for (const i of [1, 2, 3]) {
    if (hist[i]) parts.push(`${['①', '②', '③'][i - 1]}${hist[i]}`);
  }
  return parts.length === 0 ? '—' : parts.join(' ');
}
