// 月単位の Supabase backfill 共通ロジック。
// Server Action / Cron route / 手動スクリプトから共通で利用する。
//
// 動作:
//   - 指定月 (YYYY-MM, JST 暦日) の Event + ArchivedEvent を対象に
//     1) fullStorageKey が空 + thumbnail がある画像を Storage に upload
//     2) 各工程フォルダに e{id}_user_date.txt (工程情報 全フィールド) を upload
//   - 既に Storage にあるファイルは upsert: true で上書き安全
//   - DB 側の fullStorageKey も同時に更新

import 'server-only';
import { prisma } from './db';
import { getSupabase, SUPABASE_BUCKET, isSupabaseEnabled } from './supabase';
import {
  buildStorageKey,
  buildMetaKey,
  buildMetaText,
} from './event-archive';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export type BackfillResult = {
  ok: boolean;
  monthLabel: string;
  archivedEventsCount: number;
  currentEventsCount: number;
  uploadedImages: number;
  uploadedMetas: number;
  skippedImages: number;
  failedImages: number;
  failedMetas: number;
  elapsedMs: number;
  error?: string;
};

export async function runMonthlyBackfill(
  month: string,
): Promise<BackfillResult> {
  const startedAt = Date.now();
  const m = MONTH_RE.exec(month);
  if (!m) {
    return makeEmpty(month, startedAt, 'month は YYYY-MM 形式で指定してください');
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) {
    return makeEmpty(month, startedAt, 'month は 1〜12 の値である必要');
  }

  if (!isSupabaseEnabled()) {
    return makeEmpty(month, startedAt, 'Supabase env が未設定');
  }
  const sb = getSupabase();
  if (!sb) return makeEmpty(month, startedAt, 'Supabase client init 失敗');

  // JST 暦日基準の月範囲を UTC Date に
  const gte = new Date(Date.UTC(y, mo - 1, 1) - JST_OFFSET_MS);
  const lt = new Date(Date.UTC(y, mo, 1) - JST_OFFSET_MS);

  const [archived, current] = await Promise.all([
    prisma.archivedEvent.findMany({
      where: { createdAt: { gte, lt } },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.event.findMany({
      where: { createdAt: { gte, lt } },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  let uploadedImages = 0;
  let uploadedMetas = 0;
  let skippedImages = 0;
  let failedImages = 0;
  let failedMetas = 0;

  // ArchivedEvent
  for (const ev of archived) {
    const eventId = ev.originalEventId;

    // 画像 upload (fullStorageKey が空のもののみ)
    for (const img of ev.images) {
      if (img.fullStorageKey || !img.thumbnail) {
        skippedImages++;
        continue;
      }
      const key = buildStorageKey({
        abSystemUserId: ev.abSystemUserId,
        abSystemUserName: ev.abSystemUserName,
        createdAt: ev.createdAt,
        imageIndex: img.imageIndex,
        eventId,
      });
      const buf = Buffer.from(img.thumbnail);
      const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (error) {
        failedImages++;
        continue;
      }
      await prisma.archivedEventImage.update({
        where: { id: img.id },
        data: { fullStorageKey: key },
      });
      uploadedImages++;
    }

    // meta.txt upload (常に最新で上書き)
    const metaKey = buildMetaKey({
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      createdAt: ev.createdAt,
      eventId,
    });
    const text = buildMetaText({
      originalEventId: eventId,
      createdAt: ev.createdAt,
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      endpoint: ev.endpoint,
      model: ev.model,
      genre: ev.genre,
      subGenre: ev.subGenre,
      gender: ev.gender,
      ageGroup: ev.ageGroup,
      platform: ev.platform,
      appealType: ev.appealType,
      appealText: ev.appealText,
      additionalNote: ev.additionalNote,
      campaignGoal: ev.campaignGoal,
      cvPointType: ev.cvPointType,
      landingPageUrl: ev.landingPageUrl,
      imageCount: ev.imageCount,
      downloaded: ev.downloaded,
      horizontallyExpanded: ev.horizontallyExpanded,
      aiEdited: ev.aiEdited,
      hitScore: ev.hitScore,
      rating: ev.rating,
    });
    const metaBuf = Buffer.from(text, 'utf-8');
    const { error: metaErr } = await sb.storage
      .from(SUPABASE_BUCKET)
      .upload(metaKey, metaBuf, { contentType: 'text/plain', upsert: true });
    if (metaErr) failedMetas++;
    else uploadedMetas++;
  }

  // Event (現役)
  for (const ev of current) {
    const eventId = ev.id;
    for (const img of ev.images) {
      if (img.fullStorageKey || !img.thumbnail) {
        skippedImages++;
        continue;
      }
      const key = buildStorageKey({
        abSystemUserId: ev.abSystemUserId,
        abSystemUserName: ev.abSystemUserName,
        createdAt: ev.createdAt,
        imageIndex: img.imageIndex,
        eventId,
      });
      const buf = Buffer.from(img.thumbnail);
      const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(key, buf, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (error) {
        failedImages++;
        continue;
      }
      await prisma.eventImage.update({
        where: { id: img.id },
        data: { fullStorageKey: key },
      });
      uploadedImages++;
    }

    const metaKey = buildMetaKey({
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      createdAt: ev.createdAt,
      eventId,
    });
    const text = buildMetaText({
      id: eventId,
      createdAt: ev.createdAt,
      abSystemUserId: ev.abSystemUserId,
      abSystemUserName: ev.abSystemUserName,
      endpoint: ev.endpoint,
      model: ev.model,
      genre: ev.genre,
      subGenre: ev.subGenre,
      gender: ev.gender,
      ageGroup: ev.ageGroup,
      platform: ev.platform,
      appealType: ev.appealType,
      appealText: ev.appealText,
      additionalNote: ev.additionalNote,
      campaignGoal: ev.campaignGoal,
      cvPointType: ev.cvPointType,
      landingPageUrl: ev.landingPageUrl,
      imageCount: ev.imageCount,
      downloaded: ev.downloaded,
      horizontallyExpanded: ev.horizontallyExpanded,
      aiEdited: ev.aiEdited,
      hitScore: ev.hitScore,
      rating: ev.rating,
    });
    const metaBuf = Buffer.from(text, 'utf-8');
    const { error: metaErr } = await sb.storage
      .from(SUPABASE_BUCKET)
      .upload(metaKey, metaBuf, { contentType: 'text/plain', upsert: true });
    if (metaErr) failedMetas++;
    else uploadedMetas++;
  }

  return {
    ok: true,
    monthLabel: month,
    archivedEventsCount: archived.length,
    currentEventsCount: current.length,
    uploadedImages,
    uploadedMetas,
    skippedImages,
    failedImages,
    failedMetas,
    elapsedMs: Date.now() - startedAt,
  };
}

function makeEmpty(month: string, startedAt: number, error: string): BackfillResult {
  return {
    ok: false,
    monthLabel: month,
    archivedEventsCount: 0,
    currentEventsCount: 0,
    uploadedImages: 0,
    uploadedMetas: 0,
    skippedImages: 0,
    failedImages: 0,
    failedMetas: 0,
    elapsedMs: Date.now() - startedAt,
    error,
  };
}
