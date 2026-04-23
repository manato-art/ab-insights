'use server';

// ダッシュボード用 Server Actions
// - 学習収集フラグ(Setting: learning_enabled) のトグル
//
// 注意: このファイルは 'use server' なので、すべての export は
// クライアントから呼べる POST エンドポイントになる。
// 管理用の read-only ヘルパー (getLearningEnabled) は
// ./settings-helpers.ts に分離。

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { LEARNING_KEY } from './settings-helpers';

async function assertAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
}

/** 学習収集フラグを明示的にセット(Switch の onCheckedChange 連動用) */
export async function setLearningEnabled(value: boolean): Promise<boolean> {
  await assertAdmin();
  await prisma.setting.upsert({
    where: { key: LEARNING_KEY },
    update: { value: value ? 'true' : 'false' },
    create: { key: LEARNING_KEY, value: value ? 'true' : 'false' },
  });
  revalidatePath('/');
  revalidatePath('/settings');
  return value;
}
