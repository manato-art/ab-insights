// 工程の画像本体閲覧ページ。
// /events/current/{id}/images   → Event テーブル (現役)
// /events/archived/{id}/images  → ArchivedEvent テーブル (アーカイブ済)
//
// サムネ (DB 内 Bytes) は即時表示。 原寸 (Supabase Storage) は signed URL を発行してダウンロード可能。
// 工程の全フィールド (ジャンル・訴求・ターゲット情報など) も同じ画面で表示する。

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

const CAMPAIGN_GOAL_LABEL: Record<string, string> = {
  cv: 'CV (購入/申込)',
  awareness: '認知拡大',
  lead: 'リード獲得',
  retargeting: 'リターゲティング',
};

const CV_POINT_LABEL: Record<string, string> = {
  purchase: '購入',
  signup: '会員登録',
  call: '電話',
  download: '資料 DL',
  other: 'その他',
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
    <div className="space-y-6">
      <div>
        <Link
          href="/events"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← 工程履歴に戻る
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          工程 #{data.displayId}
          {source === 'archived' && (
            <Badge variant="outline" className="ml-2 text-xs align-middle">
              アーカイブ済
            </Badge>
          )}
        </h1>
      </div>

      {/* 工程の詳細情報 (= ユーザーが言ってた「説明」 = メタ情報) */}
      <section className="rounded-lg ring-1 ring-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          工程の情報
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field k="日時 (JST)" v={formatJstDateTimeSec(data.createdAt)} />
          <Field k="作業種別" v={ENDPOINT_LABEL[data.endpoint] ?? data.endpoint} />
          <Field k="ユーザー" v={data.userLabel} />
          <Field k="ユーザーID" v={data.abSystemUserId} mono />
          <Field k="モデル" v={data.model ?? '—'} mono />
          <Field k="ジャンル" v={data.genre ?? '—'} />
          <Field k="サブジャンル" v={data.subGenre ?? '—'} />
          <Field k="性別" v={data.gender ?? '—'} />
          <Field k="年齢層" v={data.ageGroup ?? '—'} />
          <Field k="プラットフォーム" v={data.platform ?? '—'} />
          <Field k="訴求タイプ" v={data.appealType ?? '—'} />
          <Field
            k="キャンペーン目的"
            v={data.campaignGoal ? CAMPAIGN_GOAL_LABEL[data.campaignGoal] ?? data.campaignGoal : '—'}
          />
          <Field
            k="CV ポイント"
            v={data.cvPointType ? CV_POINT_LABEL[data.cvPointType] ?? data.cvPointType : '—'}
          />
        </dl>
        {data.appealText && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">訴求文</div>
            <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
              {data.appealText}
            </div>
          </div>
        )}
        {data.additionalNote && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">追加メモ</div>
            <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
              {data.additionalNote}
            </div>
          </div>
        )}
        {data.landingPageUrl && (
          <div>
            <span className="text-xs text-muted-foreground">LP URL : </span>
            <a
              href={data.landingPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all text-sm"
            >
              {data.landingPageUrl}
            </a>
          </div>
        )}
        <div className="pt-2 flex gap-2 flex-wrap">
          {data.downloaded && <Badge variant="default">DL済</Badge>}
          {data.horizontallyExpanded && <Badge variant="default">横展開済</Badge>}
          {data.aiEdited && <Badge variant="secondary">AI編集済</Badge>}
          {data.hitScore !== null && (
            <Badge variant="outline">刺さり度 {data.hitScore.toFixed(2)}</Badge>
          )}
          <Badge variant="outline">画像 {data.images.length} 枚</Badge>
        </div>
      </section>

      {/* 画像本体 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          画像 ({data.images.length})
        </h2>
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
                      {img.aiEdited && <Badge variant="secondary">AI編集</Badge>}
                    </div>
                    {signed ? (
                      <div className="flex flex-col gap-1.5">
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={signed}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            原寸画像を開く
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
                        画像ファイル無し
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================
// 補助コンポーネント
// ============================================================

function Field({
  k,
  v,
  mono,
}: {
  k: string;
  v: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`text-sm ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </>
  );
}

// ============================================================
// データ取得
// ============================================================

type LoadedEvent = {
  displayId: number;
  createdAt: Date;
  endpoint: string;
  model: string | null;
  abSystemUserId: string;
  userLabel: string;
  genre: string | null;
  subGenre: string | null;
  gender: string | null;
  ageGroup: string | null;
  platform: string | null;
  appealType: string | null;
  appealText: string | null;
  additionalNote: string | null;
  campaignGoal: string | null;
  cvPointType: string | null;
  landingPageUrl: string | null;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  hitScore: number | null;
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
    return mapToLoaded(e, e.id);
  }

  const e = await prisma.archivedEvent.findUnique({
    where: { id },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  });
  if (!e) return null;
  return mapToLoaded(e, e.originalEventId);
}

// Event と ArchivedEvent はカラム構成が同じなので 1 つの mapper で扱える
type AnyEvent = {
  createdAt: Date;
  endpoint: string;
  model: string | null;
  abSystemUserId: string;
  abSystemUserName: string | null;
  genre: string | null;
  subGenre: string | null;
  gender: string | null;
  ageGroup: string | null;
  platform: string | null;
  appealType: string | null;
  appealText: string | null;
  additionalNote: string | null;
  campaignGoal: string | null;
  cvPointType: string | null;
  landingPageUrl: string | null;
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  hitScore: number | null;
  images: {
    id: number;
    imageIndex: number;
    thumbnail: Uint8Array | null;
    fullStorageKey: string | null;
    downloaded: boolean;
    aiEdited: boolean;
  }[];
};

function mapToLoaded(e: AnyEvent, displayId: number): LoadedEvent {
  return {
    displayId,
    createdAt: e.createdAt,
    endpoint: e.endpoint,
    model: e.model,
    abSystemUserId: e.abSystemUserId,
    userLabel: e.abSystemUserName ?? e.abSystemUserId,
    genre: e.genre,
    subGenre: e.subGenre,
    gender: e.gender,
    ageGroup: e.ageGroup,
    platform: e.platform,
    appealType: e.appealType,
    appealText: e.appealText,
    additionalNote: e.additionalNote,
    campaignGoal: e.campaignGoal,
    cvPointType: e.cvPointType,
    landingPageUrl: e.landingPageUrl,
    downloaded: e.downloaded,
    horizontallyExpanded: e.horizontallyExpanded,
    aiEdited: e.aiEdited,
    hitScore: e.hitScore,
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
