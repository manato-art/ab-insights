// Next.js 16: middleware は proxy.ts に改名された
// 認証保護: /login と /api 以外は管理者セッション必須
// /api は各ルート側で Bearer トークン検証を行う(ここでは通す)

import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api'];
const SESSION_COOKIE = 'ab_insights_session';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 静的ファイル・Next 内部パスは素通し
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 公開パスは素通し(/api は各ルートで独自認証、/login はパスワード入力画面)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  // 管理者セッション cookie をチェック
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Edge Runtime では Prisma/DB 検証はできないので、
  // cookie の有無だけ確認して通す。詳細チェックは各ページ/route で getCurrentSession() を呼ぶ。
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
