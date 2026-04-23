# ab-insights

ABシステム(画像生成ツール)の **admin 向け学習データ収集 + プロンプト管理基盤**。

- ユーザーが ab-system で生成した画像の入力条件・行動シグナル(DL / 横展開 / AI編集)を記録
- ジャンル別に刺さる訴求・スタイルを分析
- admin がプロンプトブロックを追加 → ab-system が生成時に自動参照
- 蓄積データを将来 RAG / fine-tune に活用

## アーキテクチャ

```
┌─ ab-system (port 3000) ──┐     ┌─ ab-insights (port 3001) ──┐
│ 画像生成ツール(既存)   │←───→│ admin 向け分析 + プロンプト管理│
│ 生成ごとに webhook 送信  │     │ SQLite / Next.js 16        │
│ 生成前にブロック取得     │     │ Prisma 7                   │
└──────────────────────────┘     └────────────────────────────┘
```

## 技術スタック

- Next.js 16 (App Router + Turbopack)
- React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui
- Prisma 7 + better-sqlite3 (ローカル) / Postgres (本番想定)
- bcryptjs(管理者パスワード・API トークン)
- zod(リクエスト検証)

## セットアップ(ローカル)

```bash
npm install
cp .env.example .env   # もしくは手動で DATABASE_URL=file:./dev.db を書く
npx prisma migrate dev
npm run db:seed        # admin パスワード + API トークン発行
npm run dev            # http://localhost:3001
```

初期 admin パスワード: `Admin123`(本番では必ず変更)

## ディレクトリ構成

```
app/
├── (admin)/                 管理画面(要認証)
│   ├── layout.tsx
│   ├── page.tsx             ダッシュボード
│   ├── prompts/             プロンプト管理
│   ├── events/              イベント一覧
│   └── settings/            設定・API トークン
├── api/
│   ├── events/              POST webhook 受信
│   ├── events/[id]/signal/  POST シグナル更新
│   ├── prompts/[genre]/     GET ブロック配信
│   └── health/              GET ヘルスチェック
└── login/                   管理者ログイン

lib/
├── db.ts                    Prisma Client シングルトン
├── auth.ts                  認証・API トークン管理
└── validators.ts            zod スキーマ

prisma/
├── schema.prisma
└── seed.ts

proxy.ts                     Next.js 16 middleware (旧 middleware.ts)
```

## ab-system 連携

ab-system の `.env` に以下を設定:

```
AB_INSIGHTS_URL=http://localhost:3001
AB_INSIGHTS_TOKEN=abi_xxxxxxx  (seed 実行時に発行された値)
```

未設定なら ab-system は完全にこれまで通りの動作(no-op)。

## 本番デプロイ

Vercel 推奨。Vercel Marketplace から Neon Postgres を紐付け →
`prisma/schema.prisma` の `provider = "sqlite"` を `"postgresql"` に変更 → migrate → deploy。

## ライセンス

Proprietary — CypherOne Inc.
