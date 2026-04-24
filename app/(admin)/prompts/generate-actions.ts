'use server';

// 「🔄 プロンプト更新」ボタンの Server Actions。
// - generatePromptBlockPreview: 3 ブロック案を並列生成して返す(DB 書き込み無し)
// - commitPromptBlocks:        クライアントが確定した blocks を GenrePrompt に upsert
//
// Vision 呼び出しがあるため、ジャンルによっては 30-50 秒かかる想定。
// 実行時間の上限は呼び出し元ページ (app/(admin)/prompts/page.tsx) の
// `export const maxDuration` で制御している(Hobby=60s, Pro=300s)。

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { generateThreeBlocks } from '@/lib/insights/generate';
import type {
  CommitResult,
  GeneratePreviewResult,
  PromptBlockDraft,
} from '@/lib/insights/types';

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s) throw new Error('認証が必要です');
}

/**
 * 3 ブロック案を並列生成してクライアントに返す。
 * 失敗しても全体を throw せず、ok/error で返す。
 */
export async function generatePromptBlockPreview(
  genre: string,
): Promise<GeneratePreviewResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, genre, error: (e as Error).message };
  }

  const g = (genre ?? '').trim();
  if (!g) return { ok: false, genre, error: 'ジャンル名が空です' };

  try {
    const outcome = await generateThreeBlocks(g);

    if (outcome.signals.eventCount === 0) {
      return {
        ok: false,
        genre: g,
        error: 'このジャンルの Event がまだありません',
      };
    }

    return {
      ok: true,
      genre: g,
      blocks: outcome.blocks,
      signals: {
        eventCount: outcome.signals.eventCount,
        downloadedCount: outcome.signals.downloadedCount,
        expandedCount: outcome.signals.expandedCount,
        avgHitScore: outcome.signals.avgHitScore,
        savedImageCount: outcome.signals.savedImages.length,
      },
    };
  } catch (e) {
    console.error('[generatePromptBlockPreview] failed:', e);
    return {
      ok: false,
      genre: g,
      error: (e as Error).message || '内部エラー',
    };
  }
}

/**
 * プレビューで生成した blocks を DB に upsert。
 * 既存の (genre, blockName) 一致行があれば update、無ければ create。
 * content が空 or error 付きの block はスキップ。
 */
export async function commitPromptBlocks(
  genre: string,
  blocks: PromptBlockDraft[],
): Promise<CommitResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, genre, error: (e as Error).message };
  }

  const g = (genre ?? '').trim();
  if (!g) return { ok: false, genre, error: 'ジャンル名が空です' };
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { ok: false, genre: g, error: 'ブロックがありません' };
  }

  try {
    let upsertedCount = 0;
    for (const block of blocks) {
      // 失敗ブロック (空 content or error flag 付き) はスキップ
      if (!block.content || !block.content.trim()) continue;
      // 明示エラー付きでも、fallback テキストが入っている場合は保存する
      // (ユーザーが「とりあえずルールベースで入れておきたい」ケース)

      const existing = await prisma.genrePrompt.findFirst({
        where: { genre: g, blockName: block.blockName },
      });
      if (existing) {
        await prisma.genrePrompt.update({
          where: { id: existing.id },
          data: {
            content: block.content,
            enabled: true,
            priority: block.priority,
            note: block.note,
          },
        });
      } else {
        await prisma.genrePrompt.create({
          data: {
            genre: g,
            blockName: block.blockName,
            content: block.content,
            enabled: true,
            priority: block.priority,
            note: block.note,
          },
        });
      }
      upsertedCount += 1;
    }

    revalidatePath('/prompts');
    revalidatePath('/');

    return { ok: true, genre: g, upsertedCount };
  } catch (e) {
    console.error('[commitPromptBlocks] failed:', e);
    return { ok: false, genre: g, error: (e as Error).message || '内部エラー' };
  }
}
