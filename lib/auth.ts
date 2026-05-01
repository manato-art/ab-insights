// 管理者認証(複数パスワード対応)
// Phase 1 は軽量実装:cookie + DB の Session テーブル。将来 NextAuth / Clerk に差替え可。
// Admin は複数行を許容 — 各行が「ラベル + パスワード」のペア。
// ログインは password 入力のみ:アクティブな全 Admin と bcrypt 照合し、最初に一致した行で session を発行。
import { cookies } from 'next/headers';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

const SESSION_COOKIE = 'ab_insights_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 日

// ============================================================
// 管理者パスワード
// ============================================================

/**
 * 既存 Admin が無い場合だけ作成する初期化用関数。
 * 旧 setAdminPassword の互換: 既に行があれば何もしない (複数発行は createAdminPassword を使う)。
 */
export async function ensureBootstrapAdmin(plain: string, name = '既定の管理者') {
  const count = await prisma.admin.count();
  if (count > 0) return;
  const hash = await bcrypt.hash(plain, 10);
  await prisma.admin.create({ data: { name, passwordHash: hash } });
}

/** 新しい管理者パスワードを発行(ラベル + 平文 → bcrypt 保存)。 */
export async function createAdminPassword(name: string, plain: string): Promise<{ id: number }> {
  const hash = await bcrypt.hash(plain, 10);
  const rec = await prisma.admin.create({ data: { name, passwordHash: hash } });
  return { id: rec.id };
}

/** 指定 Admin のパスワードを差し替える(本人によるパスワード変更用)。 */
export async function changeAdminPassword(adminId: number, newPlain: string) {
  const hash = await bcrypt.hash(newPlain, 10);
  await prisma.admin.update({ where: { id: adminId }, data: { passwordHash: hash } });
}

/** 指定 Admin のラベルを変更。 */
export async function renameAdmin(adminId: number, newName: string) {
  await prisma.admin.update({ where: { id: adminId }, data: { name: newName } });
}

/** Admin を有効/無効化。 */
export async function setAdminActive(adminId: number, active: boolean) {
  await prisma.admin.update({ where: { id: adminId }, data: { active } });
}

/** Admin を削除(関連 session も連動削除)。 */
export async function deleteAdmin(adminId: number) {
  await prisma.session.deleteMany({ where: { adminId } });
  await prisma.admin.delete({ where: { id: adminId } });
}

/** アクティブな Admin が最低 1 件残るかをチェック。削除/無効化時のガードに使う。 */
export async function countActiveAdmins(excludeId?: number): Promise<number> {
  return prisma.admin.count({
    where: {
      active: true,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
  });
}

/** 設定画面表示用の一覧 */
export async function listAdmins() {
  return prisma.admin.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

/**
 * 平文パスワードを検証。一致した Admin の id を返す(未一致は null)。
 * アクティブな全 Admin と bcrypt 照合。
 * 一致時は lastLoginAt を非同期更新。
 */
export async function verifyAdminPassword(plain: string): Promise<number | null> {
  const admins = await prisma.admin.findMany({
    where: { active: true },
    select: { id: true, passwordHash: true },
  });
  for (const a of admins) {
    const ok = await bcrypt.compare(plain, a.passwordHash);
    if (ok) {
      // 非同期で last login 更新
      prisma.admin
        .update({ where: { id: a.id }, data: { lastLoginAt: new Date() } })
        .catch(() => {});
      return a.id;
    }
  }
  return null;
}

/** 指定 Admin のハッシュとだけ照合(本人確認用 — パスワード変更前のチェック等)。 */
export async function verifyAdminPasswordById(
  adminId: number,
  plain: string,
): Promise<boolean> {
  const a = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { passwordHash: true, active: true },
  });
  if (!a || !a.active) return false;
  return bcrypt.compare(plain, a.passwordHash);
}

/** Admin レコードが 1 件以上あるか(初期セットアップ判定用) */
export async function adminExists(): Promise<boolean> {
  const count = await prisma.admin.count();
  return count > 0;
}

// ============================================================
// セッション
// ============================================================

export async function createSession(adminId: number | null = null): Promise<string> {
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, expiresAt, adminId } });
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
