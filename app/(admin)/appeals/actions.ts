'use server';

// 訴求統計ページの削除用 Server Actions
// - ジャンル単位の全削除
// - 選択された訴求(appealOriginalText) 単位の削除
// - 書き換え訴求(original → rewritten) 単位の削除
// - AI 修正指示(kind + text)単位の削除
//
// いずれも該当イベントを hard delete する。
// 書き換え/AI 修正の場合は、カスケードで他のセクションの件数にも影響する点に注意。

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

async function assertAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
}

function revalidateAppeals() {
  revalidatePath('/appeals');
  revalidatePath('/');
  revalidatePath('/events');
}

/** appealText に末尾のキーワードサフィックスがあれば除去して plain 部分だけ返す */
function extractPlainAppealText(appealText: string | null): string {
  if (!appealText) return '';
  return appealText.replace(/\n*【使用キーワード：[^】]*】\s*$/u, '').trim();
}

/** ジャンル全体のイベントを削除 */
export async function deleteGenreData(genre: string): Promise<number> {
  await assertAdmin();
  if (!genre) return 0;
  const res = await prisma.event.deleteMany({ where: { genre } });
  revalidateAppeals();
  return res.count;
}

/** 選択された訴求(appealOriginalText 完全一致)をまとめて削除 */
export async function deleteSelectedAppeal(
  genre: string,
  originalText: string,
): Promise<number> {
  await assertAdmin();
  if (!originalText) return 0;
  const res = await prisma.event.deleteMany({
    where: { genre, appealOriginalText: originalText },
  });
  revalidateAppeals();
  return res.count;
}

/** 書き換え訴求(original → rewritten のペア完全一致)を削除 */
export async function deleteRewrittenAppeal(
  genre: string,
  originalText: string,
  rewrittenText: string,
): Promise<number> {
  await assertAdmin();
  if (!originalText || !rewrittenText) return 0;

  // appealText は末尾キーワード付きで保存されている可能性があるので
  // 候補を絞ってから Node 側で plainFinal を比較
  const candidates = await prisma.event.findMany({
    where: { genre, appealOriginalText: originalText },
    select: { id: true, appealText: true },
  });
  const ids = candidates
    .filter((e) => extractPlainAppealText(e.appealText) === rewrittenText)
    .map((e) => e.id);
  if (ids.length === 0) {
    revalidateAppeals();
    return 0;
  }
  const res = await prisma.event.deleteMany({ where: { id: { in: ids } } });
  revalidateAppeals();
  return res.count;
}

/** AI 修正指示(kind + text)を含むイベントを削除 */
export async function deleteAiEditInstruction(
  genre: string,
  kind: string,
  text: string,
): Promise<number> {
  await assertAdmin();
  if (!text) return 0;

  const candidates = await prisma.event.findMany({
    where: { genre, aiEditInstructionsJson: { not: null } },
    select: { id: true, aiEditInstructionsJson: true },
  });
  const ids = candidates
    .filter((e) => {
      try {
        const items = JSON.parse(e.aiEditInstructionsJson!);
        if (!Array.isArray(items)) return false;
        return items.some(
          (i) => (i?.kind ?? '') === kind && (i?.text ?? '') === text,
        );
      } catch {
        return false;
      }
    })
    .map((e) => e.id);
  if (ids.length === 0) {
    revalidateAppeals();
    return 0;
  }
  const res = await prisma.event.deleteMany({ where: { id: { in: ids } } });
  revalidateAppeals();
  return res.count;
}
