'use server';

// ユーザー管理ページ用 Server Actions
// - 表示名 / 月画像上限 / メモ の保存 (UserProfile upsert)
// - グローバルデフォルト上限の保存 (Setting)
//
// 注意: ab-system には一切戻さない / 通知しない。ab-insights 側 DB のみ更新する。

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { DEFAULT_MONTHLY_QUOTA_KEY } from './helpers';

async function assertAdmin() {
  const session = await getCurrentSession();
  if (!session) throw new Error('Unauthorized');
}

export type SaveProfileInput = {
  abSystemUserId: string;
  displayName: string | null;
  monthlyImageQuota: number | null;
  note: string | null;
};

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; error: string };

function normalizeQuota(raw: unknown): number | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'invalid';
  if (n < 0) return 'invalid';
  return Math.floor(n);
}

/** UserProfile を upsert (1ユーザー分) */
export async function saveUserProfileAction(
  input: SaveProfileInput,
): Promise<SaveProfileResult> {
  await assertAdmin();

  const id = (input.abSystemUserId ?? '').trim();
  if (!id) return { ok: false, error: 'ユーザー ID が空です' };

  const displayName = input.displayName?.trim() || null;
  const note = input.note?.trim() || null;

  const q = normalizeQuota(input.monthlyImageQuota);
  if (q === 'invalid') {
    return { ok: false, error: '月上限は 0 以上の整数で指定してください' };
  }

  await prisma.userProfile.upsert({
    where: { abSystemUserId: id },
    update: {
      displayName,
      monthlyImageQuota: q,
      note,
    },
    create: {
      abSystemUserId: id,
      displayName,
      monthlyImageQuota: q,
      note,
    },
  });

  revalidatePath('/users');
  return { ok: true };
}

/** グローバルなデフォルト月上限を保存。null / 空 で「デフォルト無し」 */
export async function saveDefaultMonthlyQuotaAction(
  raw: unknown,
): Promise<SaveProfileResult> {
  await assertAdmin();

  const q = normalizeQuota(raw);
  if (q === 'invalid') {
    return { ok: false, error: 'デフォルト上限は 0 以上の整数で指定してください' };
  }

  if (q === null) {
    await prisma.setting.deleteMany({ where: { key: DEFAULT_MONTHLY_QUOTA_KEY } });
  } else {
    await prisma.setting.upsert({
      where: { key: DEFAULT_MONTHLY_QUOTA_KEY },
      update: { value: String(q) },
      create: { key: DEFAULT_MONTHLY_QUOTA_KEY, value: String(q) },
    });
  }

  revalidatePath('/users');
  return { ok: true };
}
