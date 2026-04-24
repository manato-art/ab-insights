// GET /api/prompts/[genre]
// ab-system が画像生成時に取得するプロンプトブロック配信。
//   - 指定 genre の enabled=true ブロック
//   - 共通ブロック ('全て') も合わせて返す
//   - priority 昇順でソート
//   - 結合済みテキスト (combined) も返す
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyApiToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMMON_GENRES = ['全て'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ genre: string }> }
) {
  // 認証
  const ok = await verifyApiToken(req.headers.get('authorization'));
  if (!ok) {
    return NextResponse.json(
      { success: false, error: '認証に失敗しました' },
      { status: 401 }
    );
  }

  // Next.js 16: params は Promise。route path に含まれる日本語は URL デコードされて渡る。
  const { genre: rawGenre } = await params;
  const genre = decodeURIComponent(rawGenre);

  if (!genre || genre.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: 'ジャンルが指定されていません' },
      { status: 400 }
    );
  }

  try {
    const blocks = await prisma.genrePrompt.findMany({
      where: {
        enabled: true,
        OR: [{ genre }, ...COMMON_GENRES.map((g) => ({ genre: g }))],
      },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      select: {
        blockName: true,
        content: true,
        priority: true,
        genre: true,
      },
    });

    const combined = blocks.map((b) => b.content).join('\n\n');

    return NextResponse.json(
      {
        genre,
        blocks,
        combined,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          // 軽くキャッシュ。編集したプロンプトが 30 秒以内には反映される。
          'Cache-Control': 'private, max-age=30',
        },
      }
    );
  } catch (err) {
    console.error('[GET /api/prompts/[genre]] 取得エラー:', err);
    return NextResponse.json(
      { success: false, error: 'プロンプト取得中にサーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
