// 管理者認証(単一パスワード)
// Phase 1 は軽量実装:cookie + DB の Session テーブル。将来 NextAuth / Clerk に差替え可。
import { cookies } from 'next/headers';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

const SESSION_COOKIE = 'ab_insights_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 日

// ============================================================
// 管理者パスワード
// ============================================================

/** 管理者パスワードを(再)設定。初期設定/リセット両対応 */
export async function setAdminPassword(plain: string) {
  const hash = await bcrypt.hash(plain, 10);
  const existing = await prisma.admin.findFirst({ orderBy: { id: 'asc' } });
  if (existing) {
    await prisma.admin.update({
      where: { id: existing.id },
      data: { passwordHash: hash },
    });
  } else {
    await prisma.admin.create({ data: { passwordHash: hash } });
  }
}

/** 平文パスワードを検証。一致すれば true */
export async function verifyAdminPassword(plain: string): Promise<boolean> {
  const admin = await prisma.admin.findFirst({ orderBy: { id: 'asc' } });
  if (!admin) return false;
  return bcrypt.compare(plain, admin.passwordHash);
}

/** Admin レコードが 1 件以上あるか */
export async function adminExists(): Promise<boolean> {
  const count = await prisma.admin.count();
  return count > 0;
}

// ============================================================
// セッション
// ============================================================

export async function createSession(): Promise<string> {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, expiresAt } });
  return id;
}

export async function destroySession(id: string) {
  await prisma.session.delete({ where: { id } }).catch(() => {});
}

export async function getSession(id: string) {
  const s = await prisma.session.findUnique({ where: { id } });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    await destroySession(id).catch(() => {});
    return null;
  }
  return s;
}

/** Cookie にセッション ID を焼き付ける (Server Action / Route Handler から) */
export async function setSessionCookie(sessionId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** 現在の cookie からセッションを取得 (未ログインなら null) */
export async function getCurrentSession() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  return getSession(sid);
}

/** ログアウト: cookie 削除 + DB Session 削除 */
export async function logout() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (sid) await destroySession(sid);
  store.delete(SESSION_COOKIE);
}

// ============================================================
// API トークン (ab-system からの認証用)
// ============================================================

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** トークンを新規発行。平文は作成時のみ返す。 */
export async function createApiToken(name: string): Promise<{ id: number; token: string }> {
  const token = 'abi_' + randomBytes(24).toString('hex'); // 'abi_' = ab-insights prefix
  const tokenHash = hashToken(token);
  const rec = await prisma.apiToken.create({ data: { name, tokenHash } });
  return { id: rec.id, token };
}

/** Authorization ヘッダ値(例: "Bearer abi_xxx")を検証 */
export async function verifyApiToken(authHeader: string | null | undefined): Promise<boolean> {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1].trim();
  const tokenHash = hashToken(token);
  const rec = await prisma.apiToken.findUnique({ where: { tokenHash } });
  if (!rec || !rec.active) return false;
  // timingSafeEqual で一応タイミング攻撃を避ける(hash 同士なので実害は薄いが)
  const a = Buffer.from(tokenHash);
  const b = Buffer.from(rec.tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  // last_used_at 更新(非同期で OK)
  prisma.apiToken.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return true;
}
