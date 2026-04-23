'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { computeGenreLearning, summarizeWithAI } from '@/lib/insights';

const LEARNED_BLOCK_NAME = '学習済みインサイト';
const LEARNED_BLOCK_PRIORITY = 100; // 既存の手動ブロックより後ろに来る(ソート昇順で末尾)

async function assertAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('認証が必要です');
}

export type UploadResult = {
  success: boolean;
  genre: string;
  eventCount: number;
  promptPreview: string;
  enhanced: boolean;  // AI 要約が成功したか
  model: string | null;
  error?: string;
};

/**
 * 指定ジャンルの学習データを集計 → AI で要約 → GenrePrompt に upsert + 有効化。
 * 既存の「学習済みインサイト」ブロックがあれば上書き。
 */
export async function uploadGenreLearning(genre: string): Promise<UploadResult> {
  await assertAdmin();
  if (!genre || !genre.trim()) {
    return {
      success: false,
      genre,
      eventCount: 0,
      promptPreview: '',
      enhanced: false,
      model: null,
      error: 'ジャンル名が空です',
    };
  }

  const g = genre.trim();

  try {
    // 1. 集計
    const learning = await computeGenreLearning(g);

    if (learning.eventCount === 0) {
      return {
        success: false,
        genre: g,
        eventCount: 0,
        promptPreview: '',
        enhanced: false,
        model: null,
        error: 'このジャンルの学習データ(Event)がまだありません',
      };
    }

    // 2. AI 要約(失敗時はルールベース promptText が返る)
    const summarized = await summarizeWithAI(learning);

    // 3. GenrePrompt に upsert (同じ genre + blockName で既存があれば更新)
    const existing = await prisma.genrePrompt.findFirst({
      where: { genre: g, blockName: LEARNED_BLOCK_NAME },
    });

    const note = [
      `自動生成: ${new Date().toLocaleString('ja-JP')}`,
      `対象 Event: ${learning.eventCount} 件`,
      `DL 率: ${((learning.downloadedCount / Math.max(1, learning.eventCount)) * 100).toFixed(1)}%`,
      `横展開率: ${((learning.expandedCount / Math.max(1, learning.eventCount)) * 100).toFixed(1)}%`,
      summarized.enhanced ? `AI 要約: ${summarized.model}` : 'AI 要約: オフ(ルールベース)',
    ].join(' / ');

    if (existing) {
      await prisma.genrePrompt.update({
        where: { id: existing.id },
        data: {
          content: summarized.text,
          enabled: true,
          priority: LEARNED_BLOCK_PRIORITY,
          note,
        },
      });
    } else {
      await prisma.genrePrompt.create({
        data: {
          genre: g,
          blockName: LEARNED_BLOCK_NAME,
          content: summarized.text,
          enabled: true,
          priority: LEARNED_BLOCK_PRIORITY,
          note,
        },
      });
    }

    revalidatePath('/upload');
    revalidatePath('/prompts');
    revalidatePath('/');

    return {
      success: true,
      genre: g,
      eventCount: learning.eventCount,
      promptPreview: summarized.text,
      enhanced: summarized.enhanced,
      model: summarized.model,
    };
  } catch (e) {
    return {
      success: false,
      genre: g,
      eventCount: 0,
      promptPreview: '',
      enhanced: false,
      model: null,
      error: (e as Error).message || '不明なエラー',
    };
  }
}

/**
 * 全ジャンル一括アップロード
 * @param genres 対象ジャンル一覧。省略時は Event に記録がある全ジャンル
 */
export async function uploadMultipleGenres(
  genres?: string[]
): Promise<UploadResult[]> {
  await assertAdmin();

  let targets: string[];
  if (genres && genres.length > 0) {
    targets = genres.filter(Boolean);
  } else {
    const all = await prisma.event.groupBy({
      by: ['genre'],
      where: { genre: { not: null } },
      _count: true,
    });
    targets = all
      .map((r) => r.genre)
      .filter((g): g is string => g != null && g.trim() !== '');
  }

  const results: UploadResult[] = [];
  // ジャンル単位の処理は順次(OpenAI の rate limit 配慮)
  for (const g of targets) {
    const result = await uploadGenreLearning(g);
    results.push(result);
  }
  return results;
}

/** アップロード済み(= 「学習済みインサイト」として保存済み)のジャンル一覧 */
export async function listUploadedGenres() {
  const rows = await prisma.genrePrompt.findMany({
    where: { blockName: LEARNED_BLOCK_NAME },
    orderBy: { updatedAt: 'desc' },
  });
  return rows;
}

/** アップロード済みブロックを無効化(物理削除ではなく enabled=false) */
export async function disableUploadedGenre(genre: string) {
  await assertAdmin();
  await prisma.genrePrompt.updateMany({
    where: { genre, blockName: LEARNED_BLOCK_NAME },
    data: { enabled: false },
  });
  revalidatePath('/upload');
  revalidatePath('/prompts');
}

/** アップロード済みブロックを再有効化 */
export async function enableUploadedGenre(genre: string) {
  await assertAdmin();
  await prisma.genrePrompt.updateMany({
    where: { genre, blockName: LEARNED_BLOCK_NAME },
    data: { enabled: true },
  });
  revalidatePath('/upload');
  revalidatePath('/prompts');
}

/** アップロード済みブロックを完全削除 */
export async function deleteUploadedGenre(genre: string) {
  await assertAdmin();
  await prisma.genrePrompt.deleteMany({
    where: { genre, blockName: LEARNED_BLOCK_NAME },
  });
  revalidatePath('/upload');
  revalidatePath('/prompts');
}
