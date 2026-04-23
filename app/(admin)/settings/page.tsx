// 設定ページ (Server Component)
// - パスワード変更
// - API トークン管理
// - 学習収集フラグ(冗長にここでも触れる)

import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getLearningEnabled } from '../settings-helpers';
import LearningToggle from '../learning-toggle';
import PasswordForm from './password-form';
import TokenManager, { type TokenRow } from './token-manager';

export const dynamic = 'force-dynamic';

export const metadata = { title: '設定 — ab-insights' };

async function getSettingsData() {
  const [tokens, learningEnabled] = await Promise.all([
    prisma.apiToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        active: true,
      },
    }),
    getLearningEnabled(),
  ]);
  return { tokens: tokens as TokenRow[], learningEnabled };
}

export default async function SettingsPage() {
  const { tokens, learningEnabled } = await getSettingsData();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理者アカウント・API トークン・収集フラグの管理
        </p>
      </div>

      {/* 学習収集トグル */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>学習データ収集</CardTitle>
              <CardDescription>
                ab-system からの webhook 受信を有効/無効にします。
              </CardDescription>
            </div>
            <LearningToggle initialEnabled={learningEnabled} />
          </div>
        </CardHeader>
      </Card>

      {/* パスワード変更 */}
      <Card>
        <CardHeader>
          <CardTitle>管理者パスワード</CardTitle>
          <CardDescription>
            ログインに使うパスワードを変更します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      {/* API トークン */}
      <Card>
        <CardHeader>
          <CardTitle>API トークン</CardTitle>
          <CardDescription>
            外部アプリから /api/* にアクセスするための Bearer トークン
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenManager tokens={tokens} />
        </CardContent>
      </Card>
    </div>
  );
}
