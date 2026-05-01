// GET /api/cron/archive-month
//
// 毎月 1 日 0:05 JST (= UTC 15:05 前日) に Vercel Cron が呼び出す。
// 「前月分の Event を ArchivedEvent に丸ごとコピー → Neon 側を削除」 を実行。
//
// 認証:
//   - Vercel Cron からの呼び出しは Authorization: Bearer ${CRON_SECRET} を持つ
//   - 手動デバッグ用に admin session でも許可
//
// 冪等性:
//   - originalEventId に @unique 制約があるので、 同じ月を 2 回流しても二重登録されない
//   - upsert ベースで安全
//
// 失敗時:
//   - 1 件失敗しても他の Event は処理続行 (warn ログ)
//   - サマリーをレスポンスに返す

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 月初は数千件処理する可能性があるので長めに
export const maxDuration = 300;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 現在 (UTC Date) を基準に「前月の JST 暦日範囲」 を返す */
function previousMonthRangeJst(now: Date = new Date()): { gte: Date; lt: Date; label: string } {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth(); // 0-11

  // 前月の JST 0:00 と 当月の JST 0:00 (どちらも UTC Date に変換)
  const prevMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
  const gte = new Date(Date.UTC(prevMonth.y, prevMonth.m, 1) - JST_OFFSET_MS);
  const lt = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
  const label = `${prevMonth.y}-${String(prevMonth.m + 1).padStart(2, '0')}`;
  return { gte, lt, label };
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (expected && auth === `Bearer ${expected}`) return true;
  // デバッグ用: admin session
  const session = await getCurrentSession();
  return Boolean(session);
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // クエリで month を強制指定可能 (テスト用)
  // ?month=YYYY-MM
  const monthOverride = req.nextUrl.searchParams.get('month');
  let range: { gte: Date; lt: Date; label: string };
  if (monthOverride && /^\d{4}-\d{2}$/.test(monthOverride)) {
    const [y, m] = monthOverride.split('-').map(Number);
    const gte = new Date(Date.UTC(y, m - 1, 1) - JST_OFFSET_MS);
    const lt = new Date(Date.UTC(y, m, 1) - JST_OFFSET_MS);
    range = { gte, lt, label: monthOverride };
  } else {
    range = previousMonthRangeJst();
  }

  return await runArchive(range);
}

async function runArchive(range: { gte: Date; lt: Date; label: string }) {
  const startedAt = Date.now();
  const where = { createdAt: { gte: range.gte, lt: range.lt } };

  // 対象 Event を images / aiEdits 込みで取得 (バッチで)
  const BATCH = 100;
  let processed = 0;
  let archivedCount = 0;
  let skippedExisting = 0;
  const errors: { id: number; error: string }[] = [];

  while (true) {
    const events = await prisma.event.findMany({
      where,
      orderBy: { id: 'asc' },
      take: BATCH,
      include: { images: true, aiEdits: true },
    });
    if (events.length === 0) break;

    for (const e of events) {
      try {
        // 既にアーカイブ済みかチェック
        const existing = await prisma.archivedEvent.findUnique({
          where: { originalEventId: e.id },
          select: { id: true },
        });

        if (existing) {
          // 既にコピー済 → Neon 側だけ削除
          await prisma.event.delete({ where: { id: e.id } });
          skippedExisting++;
          continue;
        }

        // ArchivedEvent + ArchivedEventImage + ArchivedEventAiEdit を一括作成
        // 1 トランザクションで コピー → 元削除 まで実行 (途中で落ちてもどちらかに完全に存在する状態を維持)
        await prisma.$transaction(async (tx) => {
          const created = await tx.archivedEvent.create({
            data: {
              originalEventId: e.id,
              abSystemUserId: e.abSystemUserId,
              abSystemUserName: e.abSystemUserName,
              endpoint: e.endpoint,
              model: e.model,
              createdAt: e.createdAt,
              genre: e.genre,
              subGenre: e.subGenre,
              gender: e.gender,
              ageGroup: e.ageGroup,
              platform: e.platform,
              appealType: e.appealType,
              appealText: e.appealText,
              appealOriginalText: e.appealOriginalText,
              appealSelectedIndex: e.appealSelectedIndex,
              additionalNote: e.additionalNote,
              aiEditInstructionsJson: e.aiEditInstructionsJson,
              styleAxesJson: e.styleAxesJson,
              urlAnalysisSummary: e.urlAnalysisSummary,
              promptFull: e.promptFull,
              promptHash: e.promptHash,
              imageCount: e.imageCount,
              downloaded: e.downloaded,
              horizontallyExpanded: e.horizontallyExpanded,
              aiEdited: e.aiEdited,
              regeneratedCount: e.regeneratedCount,
              hitScore: e.hitScore,
              decisionTimeMs: e.decisionTimeMs,
              regenerationReason: e.regenerationReason,
              rating: e.rating,
              ratingComment: e.ratingComment,
              tagsJson: e.tagsJson,
              campaignGoal: e.campaignGoal,
              targetInterestsJson: e.targetInterestsJson,
              targetRegion: e.targetRegion,
              targetIncomeRange: e.targetIncomeRange,
              budgetRange: e.budgetRange,
              targetCpa: e.targetCpa,
              landingPageUrl: e.landingPageUrl,
              cvPointType: e.cvPointType,
              sessionDurationMs: e.sessionDurationMs,
              totalHoverMs: e.totalHoverMs,
              zoomCount: e.zoomCount,
              tabSwitchCount: e.tabSwitchCount,
              comparisonViewMs: e.comparisonViewMs,
              rightClickSaveCount: e.rightClickSaveCount,
              discardedAfterEdit: e.discardedAfterEdit,
              regenerationDiffJson: e.regenerationDiffJson,
            },
          });

          for (const img of e.images) {
            await tx.archivedEventImage.create({
              data: {
                eventId: created.id,
                originalImageId: img.id,
                imageIndex: img.imageIndex,
                thumbnail: img.thumbnail,
                fullHash: img.fullHash,
                fullStorageKey: img.fullStorageKey,
                downloaded: img.downloaded,
                aiEdited: img.aiEdited,
                downloadedAt: img.downloadedAt,
                downloadRank: img.downloadRank,
                hoverMs: img.hoverMs,
                viewCount: img.viewCount,
              },
            });
          }

          for (const ed of e.aiEdits) {
            await tx.archivedEventAiEdit.create({
              data: {
                eventId: created.id,
                originalEditId: ed.id,
                kind: ed.kind,
                instruction: ed.instruction,
                createdAt: ed.createdAt,
                discarded: ed.discarded,
              },
            });
          }

          // Neon (= 現 DB) 側の Event を削除 (cascade で Image/AiEdit も消える)
          await tx.event.delete({ where: { id: e.id } });
        });

        archivedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[cron archive-month] event id=${e.id} アーカイブ失敗:`,
          msg,
        );
        errors.push({ id: e.id, error: msg });
      }
      processed++;
    }

    if (events.length < BATCH) break;
  }

  const elapsedMs = Date.now() - startedAt;
  const summary = {
    monthLabel: range.label,
    rangeFromUtc: range.gte.toISOString(),
    rangeToUtc: range.lt.toISOString(),
    processed,
    archived: archivedCount,
    skippedExisting,
    errorCount: errors.length,
    errors: errors.slice(0, 10), // ログ過大化防止
    elapsedMs,
  };
  console.log('[cron archive-month] done', summary);
  return NextResponse.json({ success: true, ...summary });
}
