'use server';

// プロンプト管理用の Server Actions
// 画面遷移なしに mutate → revalidatePath で一覧を再描画するだけのシンプルな構成。
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s) throw new Error('Unauthorized');
}

// --- 型 ---
export type ActionResult = { ok: true } | { ok: false; error: string };

// --- Create ---
export async function createPromptBlock(input: {
  genre: string;
  blockName: string;
  content: string;
  note?: string | null;
  priority?: number | null;
  enabled?: boolean | null;
}): Promise<ActionResult> {
  await requireAdmin();
  const genre = input.genre?.trim();
  const blockName = input.blockName?.trim();
  const content = input.content?.trim();
  if (!genre) return { ok: false, error: 'ジャンルを入力してください' };
  if (!blockName) return { ok: false, error: 'ブロック名を入力してください' };
  if (!content) return { ok: false, error: '本文を入力してください' };

  // 新規作成時の priority は該当 genre の末尾に置く
  let priority = input.priority ?? undefined;
  if (priority === undefined || Number.isNaN(priority)) {
    const max = await prisma.genrePrompt.findFirst({
      where: { genre },
      orderBy: { priority: 'desc' },
      select: { priority: true },
    });
    priority = (max?.priority ?? -1) + 1;
  }

  await prisma.genrePrompt.create({
    data: {
      genre,
      blockName,
      content,
      note: input.note?.trim() || null,
      priority,
      enabled: input.enabled ?? true,
    },
  });
  revalidatePath('/prompts');
  return { ok: true };
}

// --- Update ---
export async function updatePromptBlock(input: {
  id: number;
  blockName?: string;
  content?: string;
  note?: string | null;
  priority?: number | null;
  genre?: string;
}): Promise<ActionResult> {
  await requireAdmin();
  if (!input.id) return { ok: false, error: 'id が不正です' };

  const data: Record<string, unknown> = {};
  if (input.genre !== undefined) {
    const g = input.genre.trim();
    if (!g) return { ok: false, error: 'ジャンルを入力してください' };
    data.genre = g;
  }
  if (input.blockName !== undefined) {
    const n = input.blockName.trim();
    if (!n) return { ok: false, error: 'ブロック名を入力してください' };
    data.blockName = n;
  }
  if (input.content !== undefined) {
    const c = input.content.trim();
    if (!c) return { ok: false, error: '本文を入力してください' };
    data.content = c;
  }
  if (input.note !== undefined) data.note = input.note?.trim() || null;
  if (input.priority !== undefined && input.priority !== null && !Number.isNaN(input.priority)) {
    data.priority = input.priority;
  }

  await prisma.genrePrompt.update({ where: { id: input.id }, data });
  revalidatePath('/prompts');
  return { ok: true };
}

// --- Toggle enabled ---
export async function togglePromptEnabled(id: number, enabled: boolean): Promise<ActionResult> {
  await requireAdmin();
  await prisma.genrePrompt.update({ where: { id }, data: { enabled } });
  revalidatePath('/prompts');
  return { ok: true };
}

// --- Delete ---
export async function deletePromptBlock(id: number): Promise<ActionResult> {
  await requireAdmin();
  await prisma.genrePrompt.delete({ where: { id } });
  revalidatePath('/prompts');
  return { ok: true };
}

// --- Reorder: 指定した block を 1 つ上 / 下 の block と priority を swap ---
export async function movePromptBlock(id: number, direction: 'up' | 'down'): Promise<ActionResult> {
  await requireAdmin();
  const me = await prisma.genrePrompt.findUnique({ where: { id } });
  if (!me) return { ok: false, error: 'ブロックが見つかりません' };

  const neighbor = await prisma.genrePrompt.findFirst({
    where: {
      genre: me.genre,
      priority: direction === 'up' ? { lt: me.priority } : { gt: me.priority },
    },
    orderBy: { priority: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return { ok: true }; // 端 → 何もしない

  // priority を swap (ユニーク制約は無いのでシンプルに入れ替え)
  await prisma.$transaction([
    prisma.genrePrompt.update({
      where: { id: me.id },
      data: { priority: neighbor.priority },
    }),
    prisma.genrePrompt.update({
      where: { id: neighbor.id },
      data: { priority: me.priority },
    }),
  ]);
  revalidatePath('/prompts');
  return { ok: true };
}
