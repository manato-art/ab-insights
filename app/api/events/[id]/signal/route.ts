// POST /api/events/[id]/signal
// ab-system からの行動シグナル後追い更新。
//   - downloaded / horizontallyExpanded / aiEdited を必要に応じて更新
//   - regeneratedCount を更新
//   - aiEdits は配列で渡されれば append (replace ではない)
//   - hitScore を自動再計算して返す
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyApiToken } from '@/lib/auth';
import {
  updateSignalSchema,
  formatZodError,
  computeHitScore,
} from '@/lib/validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 認証
  const ok = await verifyApiToken(req.headers.get('authorization'));
  if (!ok) {
    return NextResponse.json(
      { success: false, error: '認証に失敗しました' },
      { status: 401 }
    );
  }

  // Next.js 16: params は Promise
  const { id: idParam } = await params;
  const eventId = Number(idParam);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json(
      { success: false, error: 'イベント ID が不正です' },
      { status: 400 }
    );
  }

  // body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'リクエスト body の JSON 形式が不正です' },
      { status: 400 }
    );
  }

  const parsed = updateSignalSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'リクエスト body のバリデーションに失敗しました',
        fieldErrors: formatZodError(parsed.error),
      },
      { status: 400 }
    );
  }
  const body = parsed.data;

  try {
    const hitScore = await prisma.$transaction(async (tx) => {
      // 対象 event を取得(存在確認 & マージ用)
      const existing = await tx.event.findUnique({
        where: { id: eventId },
        include: { images: true },
      });
      if (!existing) {
        throw new NotFoundError();
      }

      // ===== 個別画像シグナルの反映(オプション B: どの絵柄が刺さったか) =====
      // EventImage を (eventId, imageIndex) で更新する
      if (body.imageSignals && body.imageSignals.length > 0) {
        for (const sig of body.imageSignals) {
          const targetImage = existing.images.find(
            (im) => im.imageIndex === sig.imageIndex
          );
          if (!targetImage) continue; // 存在しない imageIndex は無視

          const data: {
            downloaded?: boolean;
            aiEdited?: boolean;
            downloadedAt?: Date;
            downloadRank?: number;
            hoverMs?: number;
            viewCount?: number;
          } = {};
          if (sig.downloaded !== undefined) data.downloaded = sig.downloaded;
          if (sig.aiEdited !== undefined) data.aiEdited = sig.aiEdited;
          if (sig.downloadedAt) {
            const parsed = new Date(sig.downloadedAt);
            if (!isNaN(parsed.getTime())) data.downloadedAt = parsed;
          }
          if (sig.downloadRank != null) data.downloadRank = sig.downloadRank;
          if (sig.hoverMs != null) data.hoverMs = sig.hoverMs;
          if (sig.viewCount != null) data.viewCount = sig.viewCount;
          if (Object.keys(data).length === 0) continue;

          await tx.eventImage.update({
            where: { id: targetImage.id },
            data,
          });
        }
      }

      // ===== rollup: EventImage の状態を集計して Event.downloaded/aiEdited を決定 =====
      // 更新後の EventImage を取り直して rollup
      const imagesAfter = await tx.eventImage.findMany({ where: { eventId } });
      const anyDownloaded = imagesAfter.some((im) => im.downloaded);
      const anyAiEdited = imagesAfter.some((im) => im.aiEdited);

      // Event レベルのシグナル: body で明示的に指定されていればそれ優先、
      // なければ imageSignals からの rollup を使う
      const downloadedToWrite =
        body.downloaded !== undefined
          ? body.downloaded
          : body.imageSignals && body.imageSignals.length > 0
            ? anyDownloaded
            : undefined;

      // aiEdits 配列 or imageSignals 由来
      const aiEditedToWrite =
        body.aiEdited !== undefined
          ? body.aiEdited
          : body.aiEdits && body.aiEdits.length > 0
            ? true
            : body.imageSignals && body.imageSignals.length > 0
              ? anyAiEdited
              : undefined;

      const merged = {
        downloaded: downloadedToWrite ?? existing.downloaded,
        horizontallyExpanded:
          body.horizontallyExpanded ?? existing.horizontallyExpanded,
        aiEdited: aiEditedToWrite ?? existing.aiEdited,
        regeneratedCount: body.regeneratedCount ?? existing.regeneratedCount,
      };

      const newScore = computeHitScore(merged);

      // tags は配列で送られるので JSON 化
      const tagsJson =
        body.tags && body.tags.length > 0 ? JSON.stringify(body.tags) : undefined;
      const regenerationDiffJson = body.regenerationDiff
        ? JSON.stringify(body.regenerationDiff)
        : undefined;

      // Event 更新 (undefined は省略 → Prisma が無視)
      await tx.event.update({
        where: { id: eventId },
        data: {
          downloaded: downloadedToWrite,
          horizontallyExpanded: body.horizontallyExpanded,
          aiEdited: aiEditedToWrite,
          regeneratedCount: body.regeneratedCount,
          hitScore: newScore,
          // ① 信号粒度・評価 (late update)
          decisionTimeMs: body.decisionTimeMs,
          regenerationReason: body.regenerationReason,
          rating: body.rating,
          ratingComment: body.ratingComment,
          tagsJson,
          // ⑤ 暗黙シグナル
          sessionDurationMs: body.sessionDurationMs,
          totalHoverMs: body.totalHoverMs,
          zoomCount: body.zoomCount,
          tabSwitchCount: body.tabSwitchCount,
          comparisonViewMs: body.comparisonViewMs,
          rightClickSaveCount: body.rightClickSaveCount,
          // ⑥ ネガティブ学習
          discardedAfterEdit: body.discardedAfterEdit,
          regenerationDiffJson,
        },
      });

      // aiEdits は append (imageIndex がついてれば EventImage.aiEdited も true に)
      if (body.aiEdits && body.aiEdits.length > 0) {
        for (const edit of body.aiEdits) {
          await tx.eventAiEdit.create({
            data: {
              eventId,
              kind: edit.kind,
              instruction: edit.instruction,
              discarded: edit.discarded ?? false,
            },
          });
          // imageIndex が指定されていれば個別画像も aiEdited にマーク
          if (edit.imageIndex !== undefined) {
            const targetImage = existing.images.find(
              (im) => im.imageIndex === edit.imageIndex
            );
            if (targetImage) {
              await tx.eventImage.update({
                where: { id: targetImage.id },
                data: { aiEdited: true },
              });
            }
          }
        }
      }

      return newScore;
    });

    return NextResponse.json({ success: true, hitScore });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json(
        { success: false, error: '対象のイベントが見つかりません' },
        { status: 404 }
      );
    }
    console.error('[POST /api/events/[id]/signal] 更新エラー:', err);
    return NextResponse.json(
      { success: false, error: 'シグナル更新中にサーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

class NotFoundError extends Error {
  constructor() {
    super('Event not found');
    this.name = 'NotFoundError';
  }
}
