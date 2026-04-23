'use server';

import { redirect } from 'next/navigation';
import { verifyAdminPassword, createSession, setSessionCookie } from '@/lib/auth';

export type LoginState = { error: string | null };

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');

  if (!password) {
    return { error: 'パスワードを入力してください' };
  }
  const ok = await verifyAdminPassword(password);
  if (!ok) {
    return { error: 'パスワードが違います' };
  }

  const sid = await createSession();
  await setSessionCookie(sid);
  // redirect() はここでは使えない(useActionState 経由だと throw される)
  // → クライアント側で state.error が null なら next へ遷移する設計にする
  redirect(next && next.startsWith('/') ? next : '/');
}
