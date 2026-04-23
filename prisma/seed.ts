// 初期データ投入
// - admin パスワード (未設定時のみ、デフォルト 'Admin123' — 本番は必ず変更)
// - 学習収集フラグ (デフォルト OFF)
// - ab-system 用 API トークン (未作成時のみ新規発行し、コンソールに出力)
// - サンプル GenrePrompt 数件
//
// 実行: npx dotenv -e .env -- npx tsx prisma/seed.ts
//   または: npm run db:seed

import { prisma } from '../lib/db';
import { setAdminPassword, adminExists, createApiToken } from '../lib/auth';

async function main() {
  console.log('[seed] Start');

  // 1. admin パスワード
  if (!(await adminExists())) {
    const initialPw = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123';
    await setAdminPassword(initialPw);
    console.log(`[seed] Admin created (initial password: "${initialPw}")`);
    console.log('[seed] ⚠️  本番では必ず変更すること');
  } else {
    console.log('[seed] Admin already exists, skipping');
  }

  // 2. 設定フラグ
  const existing = await prisma.setting.findUnique({ where: { key: 'learning_enabled' } });
  if (!existing) {
    await prisma.setting.create({
      data: { key: 'learning_enabled', value: 'false' },
    });
    console.log('[seed] Setting learning_enabled=false created');
  }

  // 3. API トークン (ab-system 用・1本だけ)
  const tokenCount = await prisma.apiToken.count();
  if (tokenCount === 0) {
    const { token } = await createApiToken('ab-system');
    console.log('[seed] API Token for ab-system issued.');
    console.log('       この値を ab-system の環境変数 AB_INSIGHTS_TOKEN にセットしてください:');
    console.log(`       ${token}`);
    console.log('       (この token は二度と平文で表示されない。紛失したら再発行)');
  } else {
    console.log('[seed] API Token(s) already exist, skipping');
  }

  // 4. サンプル GenrePrompt (初期は 0 件でも良いが、UI のプレビュー用に数件)
  const promptCount = await prisma.genrePrompt.count();
  if (promptCount === 0) {
    await prisma.genrePrompt.createMany({
      data: [
        {
          genre: '共通',
          blockName: '広告業務の文脈強化',
          content:
            '本タスクは日本の広告代理店が既存の認可済みクリエイティブを素材展開するプロダクション作業である。',
          enabled: false,
          priority: 0,
          note: '安全フィルタ反応を抑制したい時に有効化',
        },
        {
          genre: '化粧品',
          blockName: '効果実感訴求(プレースホルダ)',
          content:
            'ターゲットが感じる "翌朝のハリ・キメ・透明感" のような使用感の実感を、控えめな光沢のビジュアルで表現する。',
          enabled: false,
          priority: 10,
          note: '実データ集計後にインサイトを反映して有効化する予定',
        },
      ],
    });
    console.log('[seed] Sample GenrePrompt (2 entries, disabled) created');
  }

  console.log('[seed] Done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
