import { prisma } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import UploadPanel from './upload-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: '学習アップロード — ab-insights' };

const LEARNED_BLOCK_NAME = '学習済みインサイト';

/** ジャンル別サムネイル最大取得数(表示 + 負荷制限) */
const MAX_THUMBS_PER_GENRE = 24;

type ThumbItem = {
  eventId: number;
  imageIndex: number;
  downloaded: boolean;
  aiEdited: boolean;
  createdAt: string;          // ISO
  dataUrl: string | null;     // base64 → data URL(サムネ無しの古い記録は null)
  hitScore: number | null;
  appealType: string | null;
};

type GenreStat = {
  genre: string;
  eventCount: number;
  downloaded: number;
  expanded: number;
  avgHit: number | null;
  uploaded: boolean;
  uploadedEnabled: boolean;
  uploadedAt: Date | null;
  uploadedSnippet: string | null;
  thumbs: ThumbItem[];
};

async function getGenreStats(): Promise<GenreStat[]> {
  // Event + EventImage(サムネ付き)を一括取得
  // 保存画像(downloaded=true) を必ず thumbs 枠内に入れるため、以下の順で並べる:
  //   1) downloaded desc : DL されたイベントを先頭
  //   2) hitScore desc (nulls last) : hit の高いものを次に
  //   3) createdAt desc : 新しい順
  // Postgres は NULL を DESC で先頭に置くため、nulls:'last' を明示しないと
  // hitScore=null の未 DL イベントが上位を占拠して DL イベントが 24 枠外になる。
  const events = await prisma.event.findMany({
    where: { genre: { not: null } },
    include: {
      images: {
        select: {
          imageIndex: true,
          downloaded: true,
          aiEdited: true,
          thumbnail: true,
        },
        // DL された画像を先頭に(24 枠内で取りこぼさないため)
        orderBy: [{ downloaded: 'desc' }, { imageIndex: 'asc' }],
      },
    },
    orderBy: [
      { downloaded: 'desc' },
      { hitScore: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  });

  const byGenre = new Map<
    string,
    {
      count: number;
      dl: number;
      exp: number;
      hit: number[];
      thumbs: ThumbItem[];
    }
  >();
  for (const e of events) {
    const g = e.genre!;
    if (!byGenre.has(g))
      byGenre.set(g, { count: 0, dl: 0, exp: 0, hit: [], thumbs: [] });
    const b = byGenre.get(g)!;
    b.count += 1;
    if (e.downloaded) b.dl += 1;
    if (e.horizontallyExpanded) b.exp += 1;
    if (e.hitScore != null) b.hit.push(e.hitScore);

    // ジャンル内のサムネイルを収集(最大 MAX_THUMBS_PER_GENRE 枚)
    if (b.thumbs.length < MAX_THUMBS_PER_GENRE) {
      for (const img of e.images) {
        if (b.thumbs.length >= MAX_THUMBS_PER_GENRE) break;
        // Bytes (Uint8Array) → base64 data URL
        let dataUrl: string | null = null;
        if (img.thumbnail) {
          dataUrl = 'data:image/webp;base64,' +
            Buffer.from(img.thumbnail).toString('base64');
        }
        b.thumbs.push({
          eventId: e.id,
          imageIndex: img.imageIndex,
          downloaded: img.downloaded,
          aiEdited: img.aiEdited,
          createdAt: e.createdAt.toISOString(),
          dataUrl,
          hitScore: e.hitScore,
          appealType: e.appealType,
        });
      }
    }
  }

  // アップロード済みブロックを並行取得
  const uploaded = await prisma.genrePrompt.findMany({
    where: { blockName: LEARNED_BLOCK_NAME },
  });
  const uploadedMap = new Map(uploaded.map((u) => [u.genre, u]));

  // 両方をマージ
  const allGenres = new Set<string>([...byGenre.keys(), ...uploadedMap.keys()]);

  return [...allGenres]
    .map((g): GenreStat => {
      const b = byGenre.get(g);
      const u = uploadedMap.get(g);
      return {
        genre: g,
        eventCount: b?.count ?? 0,
        downloaded: b?.dl ?? 0,
        expanded: b?.exp ?? 0,
        avgHit:
          b && b.hit.length > 0 ? b.hit.reduce((a, c) => a + c, 0) / b.hit.length : null,
        uploaded: !!u,
        uploadedEnabled: u?.enabled ?? false,
        uploadedAt: u?.updatedAt ?? null,
        uploadedSnippet: u?.content ? u.content.slice(0, 140) : null,
        thumbs: b?.thumbs ?? [],
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount);
}

export default async function UploadPage() {
  const stats = await getGenreStats();
  const totalEvents = stats.reduce((sum, s) => sum + s.eventCount, 0);
  const uploadedCount = stats.filter((s) => s.uploaded && s.uploadedEnabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">学習アップロード</h1>
        <p className="text-sm text-muted-foreground mt-1">
          蓄積された Event(実データ)を集計・AI 要約し、ab-system に反映する。
          アップロードされたジャンルは、ab-system で同じジャンルの画像生成をする際に
          Gemini のプロンプトへ自動的に挿入される。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>記録済み Event</CardDescription>
            <CardTitle className="text-2xl font-mono">{totalEvents.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>データのあるジャンル数</CardDescription>
            <CardTitle className="text-2xl font-mono">{stats.filter((s) => s.eventCount > 0).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>アップロード有効中</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {uploadedCount}
              <span className="text-sm text-muted-foreground font-normal ml-2">ジャンル</span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Separator />

      <UploadPanel stats={stats} />

      {stats.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              まだ学習データが記録されていません。
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              設定 → 学習収集を ON にしてから、ab-system で画像を生成すると記録が始まります。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
