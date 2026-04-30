// 3 ブロックを並列生成するオーケストレータ。
// Server Action 側は集計 → このオーケストレータ呼び出し → 結果を client へ返すだけ。

import { aggregateGenreSignals } from './aggregate';
import { buildSuccessImageBlock } from './blocks/success-image';
import { buildCopyBlock } from './blocks/copy';
import { buildAppealSubBlock } from './blocks/appeal-sub';
import type { GenreSignals, PromptBlockDraft } from './types';
import { formatJstDateTime } from '@/lib/format';

export type GenerateBlocksOutcome = {
  genre: string;
  signals: GenreSignals;
  blocks: PromptBlockDraft[];
};

/**
 * 指定ジャンルの 3 ブロック案を並列生成。
 * いずれかが失敗しても他は返す(`Promise.allSettled`)。
 * 呼び出し側は `signals.eventCount === 0` のチェックを先にやること。
 */
export async function generateThreeBlocks(
  genre: string,
): Promise<GenerateBlocksOutcome> {
  const signals = await aggregateGenreSignals(genre);

  const [successImage, copy, appealSub] = await Promise.all([
    safeBuild(buildSuccessImageBlock, signals, 'success-image'),
    safeBuild(buildCopyBlock, signals, 'copy'),
    safeBuild(buildAppealSubBlock, signals, 'appeal-sub'),
  ]);

  return {
    genre: signals.genre,
    signals,
    blocks: [successImage, copy, appealSub],
  };
}

/**
 * 各 builder は内部で throw しない想定だが、念のため外側でも保護。
 * 失敗時は最低限の fallback block を返す。
 */
async function safeBuild<K extends 'success-image' | 'copy' | 'appeal-sub'>(
  fn: (s: GenreSignals) => Promise<PromptBlockDraft>,
  signals: GenreSignals,
  kind: K,
): Promise<PromptBlockDraft> {
  try {
    return await fn(signals);
  } catch (e) {
    const msg = (e as Error).message || '不明なエラー';
    console.error(`[generate] ${kind} block failed:`, msg);
    const { BLOCK_NAME_BY_KIND, BLOCK_PRIORITY_BY_KIND } = await import('./types');
    return {
      kind,
      blockName: BLOCK_NAME_BY_KIND[kind],
      priority: BLOCK_PRIORITY_BY_KIND[kind],
      content: `##${BLOCK_NAME_BY_KIND[kind]}##\n(生成中に内部エラーが発生しました: ${msg})`,
      enhanced: false,
      model: null,
      note: `失敗: ${formatJstDateTime(new Date())}`,
      error: msg,
    };
  }
}
