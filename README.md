# ab-insights

ABシステム(画像生成ツール)の **admin 向け学習データ収集 + プロンプト管理基盤**。

- ユーザーが ab-system で生成した画像の入力条件・行動シグナル(DL / 横展開 / AI編集)を記録
- ジャンル別に刺さる訴求・スタイルを分析
- admin がプロンプトブロックを追加 → ab-system が生成時に自動参照
- 蓄積データを将来 RAG / fine-tune に活用

## アーキテクチャ

```
┌─ ab-system (Railway) ─┐     ┌─ ab-insights (Vercel) ─┐
│ 画像生成ツール        │←───→│ admin 向け分析・プロンプト│
│ 生成ごとに webhook    │     │ Next.js 16 + Prisma 7    │
│ 生成前にブロック取得  │     │ Neon Postgres (無料枠)  │
└───────────────────────┘     └──────────────────────────┘
```

## 技術スタック

- Next.js 16 (App Router + Turbopack)
- React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui
- Prisma 7 + @prisma/adapter-pg + pg
- Neon Postgres (Vercel Marketplace 経由で無料プロビジョン)
- bcryptjs(管理者パスワード・API トークン)
- zod(リクエスト検証)

## セットアップ(ローカル — Neon Postgres を使用)

```bash
npm install
cp .env.example .env
# .env の DATABASE_URL に Neon の接続文字列を記入 (postgresql://...?sslmode=require)
npx prisma db push          # スキーマを Neon に反映
npm run db:seed             # admin パスワード + API トークン発行
npm run dev                 # http://localhost:3001
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

## 本番デプロイ(Vercel + Neon・完全無料枠)

### 1. Vercel でプロジェクト作成
1. https://vercel.com/new から `manato-art/ab-insights` を import
2. Framework は Next.js が自動検出される(そのまま)

### 2. Neon Postgres を Marketplace から追加
1. Vercel プロジェクト画面 → **Storage** タブ → **Create Database** → **Neon** を選択
2. 無料プラン(Free)を選ぶ
3. 完了すると `DATABASE_URL` が自動で env に注入される

### 3. 追加の env 変数を設定
**Settings → Environment Variables** で以下を追加(Production + Preview + Development 全て):
- `OPENAI_API_KEY` = sk-... (AI 要約用・任意)
- `INITIAL_ADMIN_PASSWORD` = 任意の初回パスワード(強固に)

### 4. 初回デプロイ → スキーマ適用
1. Vercel が自動デプロイを走らせる(`prisma generate && next build`)
2. 初回のみローカルで Neon にスキーマを push + seed:
   ```bash
   vercel env pull .env.local --yes   # Vercel CLI があれば
   # または Neon の接続文字列を .env に手で貼る
   npx prisma db push
   npm run db:seed                     # admin パスワード + API トークン発行
   ```
3. コンソールに出力された `abi_xxx` トークンを控える

### 5. ab-system 側に URL と token を設定
Railway の ab-system の env に:
- `AB_INSIGHTS_URL` = `https://<your-project>.vercel.app`
- `AB_INSIGHTS_TOKEN` = `abi_xxx`(上で発行)

### 料金(2026-04 時点)
- **Vercel Hobby**: $0 (3人規模・月 100GB bandwidth まで無料)
- **Neon Free**: $0 (0.5GB storage + 191 compute hours/月)
- **合計**: $0/月

## ライセンス

Proprietary — CypherOne Inc.
