'use server';

// 設定ページ用 Server Actions
// - 管理者パスワードの発行 / 削除 / 有効化 / 自分のパスワード変更
// - API トークン発行 / 無効化 / 削除
// - テーマカラー切替

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  getCurrentSession,
  createAdminPassword,
  changeAdminPassword,
  setAdminActive,
  deleteAdmin as deleteAdminRecord,
  countActiveAdmins,
  renameAdmin,
  verifyAdminPasswordById,
  createApiToken,
} from '@/lib/auth';
import { isValidThemeId } from '@/lib/theme';
import { THEME_COLOR_KEY } from '../settings-helpers';

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

// ============================================================
// 自分のパスワード変更
// ============================================================

export type PasswordState = {
  error: string | null;
  ok: boolean;
};

/**
 * ログイン中の管理者自身のパスワードを変更。
 * - 現在のパスワードを確認
 * - 新パスワードは 8 文字以上
 * - レガシーセッション (adminId=null) は再ログインを促す
 */
export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const session = await requireAdmin();
  if (session.adminId == null) {
    return {
      error: 'セッションが古いため、 一度ログアウトして再ログインしてください',
      ok: false,
    };
  }

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
  const ok = await verifyAdminPasswordById(session.adminId, current);
  if (!ok) {
    return { error: '現在のパスワードが違います', ok: false };
  }

  await changeAdminPassword(session.adminId, next);
  revalidatePath('/settings');
  return { error: null, ok: true };
}

// ============================================================
// 管理者パスワード — 発行 / 名称変更 / 有効化 / 削除
// ============================================================

export type CreateAdminResult = {
  error: string | null;
  ok: boolean;
};

/** 新しい管理者パスワードを発行。 */
export async function createAdminPasswordAction(
  name: string,
  password: string,
  passwordConfirm: string,
): Promise<CreateAdminResult> {
  await requireAdmin();

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'ラベルを入力してください' };
  if (trimmed.length > 60)
    return { ok: false, error: 'ラベルは 60 文字以内にしてください' };
  if (password.length < 8)
    return { ok: false, error: 'パスワードは 8 文字以上にしてください' };
  if (password !== passwordConfirm)
    return { ok: false, error: 'パスワード (確認) が一致しません' };

  await createAdminPassword(trimmed, password);
  revalidatePath('/settings');
  return { ok: true, error: null };
}

/** ラベル変更 */
export async function renameAdminAction(
  id: number,
  newName: string,
): Promise<CreateAdminResult> {
  await requireAdmin();
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: 'ラベルを入力してください' };
  if (trimmed.length > 60)
    return { ok: false, error: 'ラベルは 60 文字以内にしてください' };
  await renameAdmin(id, trimmed);
  revalidatePath('/settings');
  return { ok: true, error: null };
}

/** 有効化 / 無効化。最後のアクティブ管理者を無効化しようとするとエラー。 */
export async function setAdminActiveAction(
  id: number,
  active: boolean,
): Promise<CreateAdminResult> {
  const session = await requireAdmin();
  if (!active) {
    if (session.adminId === id) {
      return { ok: false, error: '自分自身は無効化できません' };
    }
    const remaining = await countActiveAdmins(id);
    if (remaining < 1) {
      return {
        ok: false,
        error: 'アクティブな管理者が 0 になります。先に他の管理者を有効化してください',
      };
    }
  }
  await setAdminActive(id, active);
  revalidatePath('/settings');
  return { ok: true, error: null };
}

/** 削除。自分自身は削除不可、最後のアクティブ管理者も削除不可。 */
export async function deleteAdminPasswordAction(
  id: number,
): Promise<CreateAdminResult> {
  const session = await requireAdmin();
  if (session.adminId === id) {
    return { ok: false, error: '自分自身は削除できません' };
  }
  const remaining = await countActiveAdmins(id);
  if (remaining < 1) {
    return {
      ok: false,
      error: 'アクティブな管理者が 0 になります。先に他の管理者を有効化してください',
    };
  }
  await deleteAdminRecord(id);
  revalidatePath('/settings');
  return { ok: true, error: null };
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
  await requireAdmin();

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
  await requireAdmin();
  await prisma.apiToken.update({
    where: { id },
    data: { active: false },
  });
  revalidatePath('/settings');
}

/** 既存トークンを active=true に戻す */
export async function activateApiTokenAction(id: number): Promise<void> {
  await requireAdmin();
  await prisma.apiToken.update({
    where: { id },
    data: { active: true },
  });
  revalidatePath('/settings');
}

/** トークンを DB から削除 */
export async function deleteApiTokenAction(id: number): Promise<void> {
  await requireAdmin();
  await prisma.apiToken.delete({ where: { id } });
  revalidatePath('/settings');
}

// ============================================================
// テーマカラー
// ============================================================

export type SetThemeResult = { ok: boolean; error: string | null };

/** テーマカラーを保存。Setting テーブルに upsert (key='theme_color')。 */
export async function setThemeColorAction(themeId: string): Promise<SetThemeResult> {
  await requireAdmin();
  if (!isValidThemeId(themeId)) {
    return { ok: false, error: '不正なテーマ ID です' };
  }
  await prisma.setting.upsert({
    where: { key: THEME_COLOR_KEY },
    create: { key: THEME_COLOR_KEY, value: themeId },
    update: { value: themeId },
  });
  // 全管理画面に効くので layout が読み直すよう / を revalidate
  revalidatePath('/', 'layout');
  return { ok: true, error: null };
}
