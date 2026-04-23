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
      const existing = await tx.event.findUnique({ where: { id: eventId } });
      if (!existing) {
        // throw で transaction を中断し、catch 側で 404 を返す
        throw new NotFoundError();
      }

      // aiEdits が渡ってきた時は aiEdited フラグも連動して true にする
      // (明示的に body.aiEdited が指定されていればそれが優先)
      const aiEditedToWrite =
        body.aiEdited !== undefined
          ? body.aiEdited
          : body.aiEdits && body.aiEdits.length > 0
            ? true
            : undefined;

      // マージ後の最終値(hitScore 算出用)
      const merged = {
        downloaded: body.downloaded ?? existing.downloaded,
        horizontallyExpanded:
          body.horizontallyExpanded ?? existing.horizontallyExpanded,
        aiEdited: aiEditedToWrite ?? existing.aiEdited,
        regeneratedCount: body.regeneratedCount ?? existing.regeneratedCount,
      };

      const newScore = computeHitScore(merged);

      // Event 更新 (undefined は省略 → Prisma が無視)
      await tx.event.update({
        where: { id: eventId },
        data: {
          downloaded: body.downloaded,
          horizontallyExpanded: body.horizontallyExpanded,
          aiEdited: aiEditedToWrite,
          regeneratedCount: body.regeneratedCount,
          hitScore: newScore,
        },
      });

      // aiEdits は append
      if (body.aiEdits && body.aiEdits.length > 0) {
        for (const edit of body.aiEdits) {
          await tx.eventAiEdit.create({
            data: {
              eventId,
              kind: edit.kind,
              instruction: edit.instruction,
            },
          });
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
