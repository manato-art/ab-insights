// POST /api/events
// ab-system からの webhook 受信エンドポイント。
// 画像生成の入力コンテキスト + サムネを Event / EventImage として保存する。
//
// フロー:
//   1. Bearer トークン検証 (abi_xxx)
//   2. learning_enabled フラグ確認 (未設定時は収集しない)
//   3. body を zod で検証
//   4. promptHash を SHA-256 で生成
//   5. Event + EventImage をトランザクションで作成
import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { verifyApiToken } from '@/lib/auth';
import { createEventSchema, formatZodError } from '@/lib/validators';
import {
  buildStorageKey,
  uploadOneImageToArchive,
} from '@/lib/event-archive';
import { isSupabaseEnabled } from '@/lib/supabase';
import { formatJstDateTimeSec } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEARNING_KEY = 'learning_enabled';

/**
 * learning_enabled Setting の値を確認。
 * 'true' / '1' のみ収集 ON と判断 (未設定時は OFF にして silently skip)。
 * ※ Web UI のデフォルトは ON だが、webhook 側では明示設定がない限り書き込まない
 *    設計にして、本番で学習フラグを能動的に有効化する運用を促す。
 */
async function isLearningEnabled(): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key: LEARNING_KEY } });
  if (!s) return false;
  return s.value === 'true' || s.value === '1';
}

/** promptFull から SHA-256 を 16 進で生成 */
function hashPrompt(promptFull: string): string {
  return createHash('sha256').update(promptFull).digest('hex');
}

/**
 * 受信した base64 サムネを Buffer に変換。
 * data: URL プレフィクスが付いていたら除去する。
 * デコード失敗時は null を返し、該当 EventImage は thumbnail なしで保存。
 */
function decodeThumbnail(b64: string | null | undefined): Uint8Array<ArrayBuffer> | null {
  if (!b64) return null;
  try {
    const cleaned = b64.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(cleaned, 'base64');
    if (buf.length === 0) return null;
    // Prisma 7 は Uint8Array<ArrayBuffer> を要求する(Node の Buffer は
    // Uint8Array<ArrayBufferLike> で SharedArrayBuffer の可能性を含む)。
    // 新しい ArrayBuffer を allocate してバイトをコピーすることで確実に ArrayBuffer 型にする。
    const arr = new ArrayBuffer(buf.byteLength);
    const view = new Uint8Array(arr);
    view.set(buf);
    return view;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // 1. 認証
  const ok = await verifyApiToken(req.headers.get('authorization'));
  if (!ok) {
    return NextResponse.json(
      { success: false, error: '認証に失敗しました' },
      { status: 401 }
    );
  }

  // 2. 学習フラグ確認
  if (!(await isLearningEnabled())) {
    // 204 No Content: 受領したが記録しない (ab-system 側はエラー扱いしない)
    return new NextResponse(null, { status: 204 });
  }

  // 3. body パース & zod 検証
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'リクエスト body の JSON 形式が不正です' },
      { status: 400 }
    );
  }

  const parsed = createEventSchema.safeParse(rawBody);
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

  // 4. promptHash
  const promptHash = body.promptFull ? hashPrompt(body.promptFull) : null;

  // styleAxes → JSON 文字列化
  const styleAxesJson = body.styleAxes ? JSON.stringify(body.styleAxes) : null;

  // imageCount: 明示指定を優先、無ければ images 配列長を採用
  const imageCount =
    typeof body.imageCount === 'number' && body.imageCount > 0
      ? body.imageCount
      : body.images.length;

  // 5. Event + EventImage 作成 (トランザクション) + 必要なら Supabase Storage upload
  try {
    const { eventId, archivePlan } = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          abSystemUserId: body.abSystemUserId,
          abSystemUserName: body.abSystemUserName ?? null,
          endpoint: body.endpoint,
          model: body.model ?? null,
          genre: body.genre ?? null,
          subGenre: body.subGenre ?? null,
          gender: body.gender ?? null,
          ageGroup: body.ageGroup ?? null,
          platform: body.platform ?? null,
          appealType: body.appealType ?? null,
          appealText: body.appealText ?? null,
          appealOriginalText: body.appealOriginalText ?? null,
          appealSelectedIndex: body.appealSelectedIndex ?? null,
          additionalNote: body.additionalNote ?? null,
          aiEditInstructionsJson:
            body.aiEditInstructions && body.aiEditInstructions.length > 0
              ? JSON.stringify(body.aiEditInstructions)
              : null,
          styleAxesJson,
          urlAnalysisSummary: body.urlAnalysisSummary ?? null,
          promptFull: body.promptFull ?? null,
          promptHash,
          imageCount,
          // ② 文脈入力(データ保存のみ・プロンプト非注入)
          campaignGoal: body.campaignGoal ?? null,
          targetInterestsJson:
            body.targetInterests && body.targetInterests.length > 0
              ? JSON.stringify(body.targetInterests)
              : null,
          targetRegion: body.targetRegion ?? null,
          targetIncomeRange: body.targetIncomeRange ?? null,
          budgetRange: body.budgetRange ?? null,
          targetCpa: body.targetCpa ?? null,
          landingPageUrl: body.landingPageUrl ?? null,
          cvPointType: body.cvPointType ?? null,
        },
      });

      // 画像ごとに Supabase Storage 用のキーを事前計算しておく (full が来ているもののみ)
      const archivePlanLocal: {
        imageId: number;
        imageIndex: number;
        storageKey: string;
        fullBase64: string;
      }[] = [];

      if (body.images.length > 0) {
        // SQLite は createMany で Bytes をうまく扱えない環境があるため個別 create
        for (const img of body.images) {
          const willArchive =
            isSupabaseEnabled() && typeof img.full === 'string' && img.full.length > 0;
          const storageKey = willArchive
            ? buildStorageKey({
                abSystemUserId: body.abSystemUserId,
                abSystemUserName: body.abSystemUserName ?? null,
                createdAt: event.createdAt,
                imageIndex: img.imageIndex,
                eventId: event.id,
              })
            : null;

          const created = await tx.eventImage.create({
            data: {
              eventId: event.id,
              imageIndex: img.imageIndex,
              thumbnail: decodeThumbnail(img.thumbnail),
              fullHash: img.fullHash ?? null,
              fullStorageKey: storageKey, // 楽観的に DB に書く。 upload 失敗時は後で null に戻す
            },
          });

          if (willArchive && storageKey) {
            archivePlanLocal.push({
              imageId: created.id,
              imageIndex: img.imageIndex,
              storageKey,
              fullBase64: img.full as string,
            });
          }
        }
      }

      return { eventId: event.id, archivePlan: archivePlanLocal };
    });

    // ===== Supabase Storage に並列アップロード =====
    // ab-system は webhook を fire-and-forget で送るため、 ここで多少時間がかかっても
    // ユーザー応答時間には影響しない。 同期的に upload して結果を DB に反映する。
    if (archivePlan.length > 0) {
      // 元の (日本語含む) 全工程情報を metadata で保存する。 Storage キーは ASCII 限定。
      // Supabase Dashboard で各画像をクリックすると詳細欄で読める。
      const metadata: Record<string, string> = {
        eventId: String(eventId),
        abSystemUserId: body.abSystemUserId,
        endpoint: body.endpoint,
        createdAtJst: formatJstDateTimeSec(new Date()),
      };
      if (body.abSystemUserName) metadata.userName = body.abSystemUserName;
      if (body.genre) metadata.genre = body.genre;
      if (body.subGenre) metadata.subGenre = body.subGenre;
      if (body.gender) metadata.gender = body.gender;
      if (body.ageGroup) metadata.ageGroup = body.ageGroup;
      if (body.platform) metadata.platform = body.platform;
      if (body.appealType) metadata.appealType = body.appealType;
      if (body.appealText) metadata.appealText = body.appealText.slice(0, 500); // 長すぎる場合カット
      if (body.campaignGoal) metadata.campaignGoal = body.campaignGoal;
      if (body.cvPointType) metadata.cvPointType = body.cvPointType;
      if (body.landingPageUrl) metadata.landingPageUrl = body.landingPageUrl;
      if (body.model) metadata.model = body.model;

      const results = await Promise.all(
        archivePlan.map((p) =>
          uploadOneImageToArchive({
            fullBase64: p.fullBase64,
            storageKey: p.storageKey,
            metadata: { ...metadata, imageIndex: String(p.imageIndex) },
          }).then((r) => ({ ...p, result: r })),
        ),
      );
      // 失敗したものは fullStorageKey を null に戻す (Storage に存在しないものを指してしまうため)
      const failures = results.filter((r) => !r.result.ok);
      if (failures.length > 0) {
        for (const f of failures) {
          if ('error' in f.result) {
            console.warn(
              `[POST /api/events] Supabase upload 失敗 eventId=${eventId} imageIndex=${f.imageIndex}:`,
              f.result.error,
            );
          }
          await prisma.eventImage.update({
            where: { id: f.imageId },
            data: { fullStorageKey: null },
          });
        }
      }
    }

    return NextResponse.json({ success: true, eventId }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/events] DB 書き込みエラー:', err);
    return NextResponse.json(
      { success: false, error: 'イベントの保存中にサーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
