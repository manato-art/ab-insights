'use server';

// ジャンル横断の管理操作 (rename / reset)。
// /upload から /prompts に移管。

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s) throw new Error('認証が必要です');
}

function revalidateAll() {
  revalidatePath('/prompts');
  revalidatePath('/appeals');
  revalidatePath('/events');
  revalidatePath('/');
}

/**
 * ジャンルの学習データを全リセット。
 * - Event 全削除(cascade で EventImage / EventAiEdit も消える)
 * - GenrePrompt 全削除(自動生成の【...】ブロック + 手動ブロック全て)
 * - GenreInsight 削除
 *
 * 注: 手動で「広告業務の文脈強化」等を入れていても、このジャンルに属するものは削除される。
 *     共通ジャンル(「共通」タブ等)のブロックは別ジャンルなので影響しない。
 */
export async function resetGenreLearning(genre: string): Promise<{
  success: boolean;
  deletedEvents: number;
  deletedPrompts: number;
  error?: string;
}> {
  await requireAdmin();
  const g = (genre ?? '').trim();
  if (!g) {
    return {
      success: false,
      deletedEvents: 0,
      deletedPrompts: 0,
      error: 'ジャンル名が空です',
    };
  }

  try {
    const [deletedEvents, deletedPrompts] = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.deleteMany({ where: { genre: g } });
      const pr = await tx.genrePrompt.deleteMany({ where: { genre: g } });
      await tx.genreInsight.deleteMany({ where: { genre: g } });
      return [ev.count, pr.count];
    });

    revalidateAll();

    return { success: true, deletedEvents, deletedPrompts };
  } catch (e) {
    return {
      success: false,
      deletedEvents: 0,
      deletedPrompts: 0,
      error: (e as Error).message || '不明なエラー',
    };
  }
}

/**
 * ジャンル名を変更する。
 * 変更先に既存データがあれば自動的に合致(merge)する:
 *   - Event.genre と GenrePrompt.genre を一括書き換え
 *   - GenreInsight は @unique(genre) なので、新名に既存があれば旧を削除
 */
export async function renameGenre(
  oldGenre: string,
  newGenreRaw: string,
): Promise<{
  success: boolean;
  movedEvents: number;
  movedPrompts: number;
  merged: boolean;
  error?: string;
}> {
  await requireAdmin();
  const oldG = (oldGenre ?? '').trim();
  const newG = (newGenreRaw ?? '').trim();

  if (!oldG || !newG) {
    return {
      success: false,
      movedEvents: 0,
      movedPrompts: 0,
      merged: false,
      error: 'ジャンル名が空です',
    };
  }
  if (oldG === newG) {
    return {
      success: false,
      movedEvents: 0,
      movedPrompts: 0,
      merged: false,
      error: '同じ名称です',
    };
  }

  try {
    const merged = await (async () => {
      const [existingEvent, existingPrompt, existingInsight] = await Promise.all([
        prisma.event.count({ where: { genre: newG } }),
        prisma.genrePrompt.count({ where: { genre: newG } }),
        prisma.genreInsight.findUnique({ where: { genre: newG } }),
      ]);
      return existingEvent > 0 || existingPrompt > 0 || existingInsight != null;
    })();

    const [updatedEvents, updatedPrompts] = await prisma.$transaction(async (tx) => {
      const ev = await tx.event.updateMany({
        where: { genre: oldG },
        data: { genre: newG },
      });
      const pr = await tx.genrePrompt.updateMany({
        where: { genre: oldG },
        data: { genre: newG },
      });

      const newInsight = await tx.genreInsight.findUnique({ where: { genre: newG } });
      if (newInsight) {
        await tx.genreInsight.deleteMany({ where: { genre: oldG } });
      } else {
        await tx.genreInsight.updateMany({
          where: { genre: oldG },
          data: { genre: newG },
        });
      }

      return [ev.count, pr.count];
    });

    revalidateAll();

    return {
      success: true,
      movedEvents: updatedEvents,
      movedPrompts: updatedPrompts,
      merged,
    };
  } catch (e) {
    return {
      success: false,
      movedEvents: 0,
      movedPrompts: 0,
      merged: false,
      error: (e as Error).message || '不明なエラー',
    };
  }
}
