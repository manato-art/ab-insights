'use server';

// 設定ページ用 Server Actions
// - 管理者パスワード変更
// - API トークン発行 / 無効化 / 削除

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  getCurrentSession,
  setAdminPassword,
  verifyAdminPassword,
  createApiToken,
} from '@/lib/auth';

async function assertAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
}

// ============================================================
// パスワード変更
// ============================================================

export type PasswordState = {
  error: string | null;
  ok: boolean;
};

/**
 * 管理者パスワード変更。
 * - 現在のパスワードを確認
 * - 新パスワードは 8 文字以上
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  await assertAdmin();

  const current = String(formData.get('currentPassword') || '');
  const next = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');

  if (!current || !next || !confirm) {
    return { error: 'すべての項目を入力してください', ok: false };
  }
  if (next.length < 8) {
    return { error: '新しいパスワードは 8 文字以上にしてください', ok: false };
  }
  if (next !== confirm) {
    return { error: '新しいパスワード(確認)が一致しません', ok: false };
  }
  const ok = await verifyAdminPassword(current);
  if (!ok) {
    return { error: '現在のパスワードが違います', ok: false };
  }

  await setAdminPassword(next);
  revalidatePath('/settings');
  return { error: null, ok: true };
}

// ============================================================
// API トークン
// ============================================================

export type CreateTokenResult = {
  error: string | null;
  token: string | null;
  name: string | null;
};

/** 新規 API トークンを発行。平文は 1 回だけ返す。 */
export async function createApiTokenAction(name: string): Promise<CreateTokenResult> {
  await assertAdmin();

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: 'トークン名を入力してください', token: null, name: null };
  }
  if (trimmed.length > 80) {
    return { error: 'トークン名は 80 文字以内にしてください', token: null, name: null };
  }

  const { token } = await createApiToken(trimmed);
  revalidatePath('/settings');
  return { error: null, token, name: trimmed };
}

/** 既存トークンの active を false に(論理無効化) */
export async function deactivateApiTokenAction(id: number): Promise<void> {
  await assertAdmin();
  await prisma.apiToken.update({
    where: { id },
    data: { active: false },
  });
  revalidatePath('/settings');
}

/** 既存トークンを active=true に戻す */
export async function activateApiTokenAction(id: number): Promise<void> {
  await assertAdmin();
  await prisma.apiToken.update({
    where: { id },
    data: { active: true },
  });
  revalidatePath('/settings');
}

/** トークンを DB から削除 */
export async function deleteApiTokenAction(id: number): Promise<void> {
  await assertAdmin();
  await prisma.apiToken.delete({ where: { id } });
  revalidatePath('/settings');
}
