// ⑦b ジャンル転移分析
// - ジャンル × appealType(サブカテゴリ)のマトリクスで DL 率を表示
// - 「A ジャンルで効いたパターンが B でも通るか」を純 SQL 集計で可視化
// - AI/embedding 不要の軽量分析
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

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ジャンル転移分析 — ab-insights' };

// appeals/page.tsx と同じ SUB_LABELS_BY_CATEGORY を使う
// (将来 lib に切り出して共通化してもよい)
const SUB_LABELS_BY_CATEGORY: Record<string, readonly [string, string, string]> = {
  '課題解決・コンプレックス': ['警告・ハッとさせる', '共感・代弁', '原因の指摘'],
  '理想の未来・ベネフィット': ['物理的・具体的な変化', '感情・メンタルの変化', 'ステータス・優越感'],
  'オファー・お得感': ['ダイレクトな安さ', 'ハードルの低さ', '特典・付加価値'],
  '実績・権威性': ['大衆の支持', '専門家・プロの推薦', 'ユーザーの熱量'],
  '手軽さ・タイパ': ['時間の短縮', '労力の削減', '場所・環境の自由'],
  '限定・緊急性': ['時間・期間の限定', '数量・人数の限定', '条件の限定'],
  '新奇性・意外性': ['常識の破壊', 'トレンド・最新', '秘密・非公開'],
};

function resolveSubLabel(
  appealType: string | null | undefined,
  index: number | null | undefined,
): string | null {
  if (!appealType || !index || index < 1 || index > 3) return null;
  const exact = SUB_LABELS_BY_CATEGORY[appealType];
  if (exact) return exact[index - 1];
  for (const [cat, subs] of Object.entries(SUB_LABELS_BY_CATEGORY)) {
    if (appealType.includes(cat)) return subs[index - 1];
  }
  return null;
}

type CellStats = {
  count: number;
  downloaded: number;
  expanded: number;
  avgHitScore: number | null;
};

type MatrixRow = {
  genre: string;
  totalEvents: number;
  cells: Map<string, CellStats>; // key = subLabel
};

async function getCrossGenreData() {
  // Event を直近 1000 件取得(サブラベル解決可能なもの + 全ジャンル)
  const events = await prisma.event.findMany({
    where: { genre: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: {
      genre: true,
      appealType: true,
      appealSelectedIndex: true,
      downloaded: true,
      horizontallyExpanded: true,
      hitScore: true,
    },
  });

  const byGenre = new Map<string, EventForMatrix[]>();
  for (const e of events) {
    const g = e.genre!;
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g)!.push(e);
  }

  // 行 = ジャンル、列 = サブラベル
  const rows: MatrixRow[] = [];
  const allSubLabels = new Set<string>();

  for (const [genre, eventsInGenre] of byGenre.entries()) {
    const cells = new Map<string, CellStats>();
    for (const e of eventsInGenre) {
      const subLabel = resolveSubLabel(e.appealType, e.appealSelectedIndex);
      if (!subLabel) continue;
      allSubLabels.add(subLabel);
      const c = cells.get(subLabel) ?? {
        count: 0,
        downloaded: 0,
        expanded: 0,
        avgHitScore: null,
      };
      c.count += 1;
      if (e.downloaded) c.downloaded += 1;
      if (e.horizontallyExpanded) c.expanded += 1;
      if (e.hitScore != null) {
        const prev = c.avgHitScore ?? 0;
        const prevCount = c.count - 1;
        c.avgHitScore = (prev * prevCount + e.hitScore) / c.count;
      }
      cells.set(subLabel, c);
    }
    rows.push({ genre, totalEvents: eventsInGenre.length, cells });
  }

  // 行ソート: 件数降順
  rows.sort((a, b) => b.totalEvents - a.totalEvents);

  // 列ソート: 定義順を優先(7カテゴリ × 3)
  const orderedSubLabels: string[] = [];
  for (const subs of Object.values(SUB_LABELS_BY_CATEGORY)) {
    for (const s of subs) {
      if (allSubLabels.has(s)) orderedSubLabels.push(s);
    }
  }
  // 未知のサブラベルは末尾
  for (const s of allSubLabels) {
    if (!orderedSubLabels.includes(s)) orderedSubLabels.push(s);
  }

  // 各サブラベルの全体平均 DL 率を算出(その列で「平均より上か下か」判定用)
  const columnAvg = new Map<string, number>();
  for (const subLabel of orderedSubLabels) {
    let total = 0;
    let dl = 0;
    for (const row of rows) {
      const c = row.cells.get(subLabel);
      if (!c) continue;
      total += c.count;
      dl += c.downloaded;
    }
    if (total > 0) columnAvg.set(subLabel, dl / total);
  }

  return { rows, subLabels: orderedSubLabels, columnAvg };
}

type EventForMatrix = {
  genre: string | null;
  appealType: string | null;
  appealSelectedIndex: number | null;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  hitScore: number | null;
};

export default async function CrossGenrePage() {
  const { rows, subLabels, columnAvg } = await getCrossGenreData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ジャンル転移分析</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ジャンル × 訴求サブラベルで DL 率を横断比較。
          あるジャンルで効いたパターンが他でも通用するかを純 SQL 集計で可視化します(AI 不要)。
        </p>
      </div>

      {/* マトリクス */}
      <Card>
        <CardHeader>
          <CardTitle>ジャンル × 訴求サブ DL率マトリクス</CardTitle>
          <CardDescription>
            セル内の数値は「DL 数 / 選択回数 (DL率%)」。背景色の濃さが DL 率の高さを示します。
            列平均より高いセルは緑系、低いセルは赤系でハイライト。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 overflow-x-auto">
          {rows.length === 0 || subLabels.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              集計できるデータがまだありません。生成画像に appealType と appealSelectedIndex が揃っている必要があります。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-muted/50 min-w-[140px]">
                    ジャンル
                  </TableHead>
                  <TableHead className="text-right">総件数</TableHead>
                  {subLabels.map((s) => (
                    <TableHead
                      key={s}
                      className="text-center text-xs whitespace-nowrap min-w-[90px]"
                    >
                      {s}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.genre}>
                    <TableCell className="font-medium sticky left-0 bg-background">
                      {row.genre}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.totalEvents}
                    </TableCell>
                    {subLabels.map((s) => {
                      const c = row.cells.get(s);
                      if (!c) {
                        return (
                          <TableCell
                            key={s}
                            className="text-center text-xs text-muted-foreground"
                          >
                            —
                          </TableCell>
                        );
                      }
                      const rate = c.count > 0 ? c.downloaded / c.count : 0;
                      const avg = columnAvg.get(s) ?? 0;
                      const delta = rate - avg;
                      const cls = cellClass(rate, delta);
                      return (
                        <TableCell
                          key={s}
                          className={`text-center text-xs tabular-nums ${cls}`}
                          title={`${c.downloaded}/${c.count} DL / 平均hit=${c.avgHitScore != null ? c.avgHitScore.toFixed(2) : '—'}`}
                        >
                          <div className="font-mono">
                            {c.downloaded}/{c.count}
                          </div>
                          <div className="text-[10px] opacity-80">
                            {(rate * 100).toFixed(0)}%
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 転移パターン検出 — 各サブラベルで全ジャンル平均を上回る上位セル */}
      <Card>
        <CardHeader>
          <CardTitle>転移候補(ジャンルを超えて効くパターン)</CardTitle>
          <CardDescription>
            複数ジャンルで DL 率が列平均を上回っているサブラベル。
            「他ジャンルでも試す価値あり」の候補群です。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransferCandidates rows={rows} subLabels={subLabels} columnAvg={columnAvg} />
        </CardContent>
      </Card>
    </div>
  );
}

function cellClass(rate: number, delta: number): string {
  // 列平均との差で色分け
  if (rate === 0) return 'text-muted-foreground';
  if (delta > 0.15) return 'bg-green-500/25 font-semibold';
  if (delta > 0.05) return 'bg-green-500/10';
  if (delta < -0.15) return 'bg-red-500/25';
  if (delta < -0.05) return 'bg-red-500/10';
  return '';
}

function TransferCandidates({
  rows,
  subLabels,
  columnAvg,
}: {
  rows: MatrixRow[];
  subLabels: string[];
  columnAvg: Map<string, number>;
}) {
  // 各サブラベルについて、列平均を+10%以上上回る(サンプル 3 件以上の)ジャンル数を数える
  type Hot = { subLabel: string; hotGenres: string[]; avg: number };
  const hots: Hot[] = [];
  for (const s of subLabels) {
    const avg = columnAvg.get(s) ?? 0;
    if (avg === 0) continue;
    const hotGenres: string[] = [];
    for (const row of rows) {
      const c = row.cells.get(s);
      if (!c || c.count < 3) continue;
      const rate = c.downloaded / c.count;
      if (rate > avg + 0.1) {
        hotGenres.push(`${row.genre} (${(rate * 100).toFixed(0)}%)`);
      }
    }
    if (hotGenres.length >= 2) {
      hots.push({ subLabel: s, hotGenres, avg });
    }
  }

  hots.sort((a, b) => b.hotGenres.length - a.hotGenres.length);

  if (hots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        まだ複数ジャンルで効いているパターンは検出されていません(各ジャンル 3 件以上必要)。
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {hots.map((h) => (
        <li key={h.subLabel} className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="default">{h.subLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              列平均 DL 率 {(h.avg * 100).toFixed(0)}% を上回るジャンル {h.hotGenres.length} 件
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {h.hotGenres.map((g, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {g}
              </Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
