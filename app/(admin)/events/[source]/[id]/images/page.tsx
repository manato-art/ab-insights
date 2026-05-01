// 工程の画像本体閲覧ページ。
// /events/current/{id}/images   → Event テーブル (現役)
// /events/archived/{id}/images  → ArchivedEvent テーブル (アーカイブ済)
//
// サムネ (DB 内 Bytes) は即時表示。 原寸 (Supabase Storage) は signed URL を発行してダウンロード可能。

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createSignedDownloadUrl } from '@/lib/event-archive';
import { formatJstDateTimeSec } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata = { title: '画像本体 — ab-insights' };

const ENDPOINT_LABEL: Record<string, string> = {
  'generate-images': '新規生成',
  'generate-similar-one': '横展開',
  'improve-images': '改善',
  'edit-region': 'AI部分修正',
};

type Props = {
  params: Promise<{ source: string; id: string }>;
};

export default async function EventImagesPage({ params }: Props) {
  const { source, id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  if (source !== 'current' && source !== 'archived') notFound();

  const data = await loadEvent(source, id);
  if (!data) notFound();

  // 各画像の signed URL を並列発行 (fullStorageKey がある分だけ)
  const signedUrls = await Promise.all(
    data.images.map(async (img) =>
      img.fullStorageKey
        ? await createSignedDownloadUrl(img.fullStorageKey, 3600)
        : null,
    ),
  );

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/events"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 工程履歴に戻る
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          画像本体 #{data.displayId}
          {source === 'archived' && (
            <Badge variant="outline" className="ml-2 text-xs align-middle">
              アーカイブ済
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {formatJstDateTimeSec(data.createdAt)} ・{' '}
          {ENDPOINT_LABEL[data.endpoint] ?? data.endpoint} ・ {data.userLabel}
          {data.genre && ` ・ ${data.genre}`}
        </p>
      </div>

      {data.images.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          画像がありません
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.images.map((img, i) => {
            const signed = signedUrls[i];
            const thumbDataUrl = img.thumbnail
              ? 'data:image/webp;base64,' +
                Buffer.from(img.thumbnail).toString('base64')
              : null;
            return (
              <div
                key={img.id}
                className="rounded-lg ring-1 ring-border overflow-hidden bg-card"
              >
                {/* サムネ表示 (DB 内 64x64) */}
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {thumbDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbDataUrl}
                      alt={`image ${img.imageIndex}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      (サムネなし)
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono">
                      #{img.imageIndex}
                    </Badge>
                    {img.downloaded && <Badge variant="default">DL済</Badge>}
                    {img.aiEdited && (
                      <Badge variant="secondary">AI編集</Badge>
                    )}
                  </div>
                  {signed ? (
                    <div className="flex flex-col gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={signed}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          原寸 WebP を開く
                        </a>
                      </Button>
                      <p className="text-[10px] text-muted-foreground font-mono break-all">
                        {img.fullStorageKey}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        URL は 60 分有効
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      原寸画像なし (旧データ or upload 失敗)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// データ取得
// ============================================================

type LoadedEvent = {
  displayId: number;
  createdAt: Date;
  endpoint: string;
  genre: string | null;
  userLabel: string;
  images: {
    id: number;
    imageIndex: number;
    thumbnail: Uint8Array | null;
    fullStorageKey: string | null;
    downloaded: boolean;
    aiEdited: boolean;
  }[];
};

async function loadEvent(
  source: 'current' | 'archived',
  id: number,
): Promise<LoadedEvent | null> {
  if (source === 'current') {
    const e = await prisma.event.findUnique({
      where: { id },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
    });
    if (!e) return null;
    return {
      displayId: e.id,
      createdAt: e.createdAt,
      endpoint: e.endpoint,
      genre: e.genre,
      userLabel: e.abSystemUserName ?? e.abSystemUserId,
      images: e.images.map((img) => ({
        id: img.id,
        imageIndex: img.imageIndex,
        thumbnail: img.thumbnail,
        fullStorageKey: img.fullStorageKey,
        downloaded: img.downloaded,
        aiEdited: img.aiEdited,
      })),
    };
  }

  const e = await prisma.archivedEvent.findUnique({
    where: { id },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  });
  if (!e) return null;
  return {
    displayId: e.originalEventId,
    createdAt: e.createdAt,
    endpoint: e.endpoint,
    genre: e.genre,
    userLabel: e.abSystemUserName ?? e.abSystemUserId,
    images: e.images.map((img) => ({
      id: img.id,
      imageIndex: img.imageIndex,
      thumbnail: img.thumbnail,
      fullStorageKey: img.fullStorageKey,
      downloaded: img.downloaded,
      aiEdited: img.aiEdited,
    })),
  };
}
