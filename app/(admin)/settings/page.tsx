// 設定ページ (Server Component)
// - 管理者パスワード (複数発行) — ラベル付きで複数行を管理
// - 自分のパスワード変更
// - API トークン管理
// - 学習収集フラグ
// - テーマカラー

import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentSession, listAdmins } from '@/lib/auth';
import { getLearningEnabled, getThemeColor } from '../settings-helpers';
import LearningToggle from '../learning-toggle';
import PasswordForm from './password-form';
import TokenManager, { type TokenRow } from './token-manager';
import AdminManager, { type AdminRow } from './admin-manager';
import { ThemeColorForm } from './theme-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: '設定 — ab-insights' };

async function getSettingsData() {
  const [tokens, learningEnabled, theme, admins, session] = await Promise.all([
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
    getThemeColor(),
    listAdmins(),
    getCurrentSession(),
  ]);
  return {
    tokens: tokens as TokenRow[],
    learningEnabled,
    theme,
    admins: admins as AdminRow[],
    currentAdminId: session?.adminId ?? null,
  };
}

export default async function SettingsPage() {
  const { tokens, learningEnabled, theme, admins, currentAdminId } = await getSettingsData();

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

      {/* テーマカラー */}
      <Card>
        <CardHeader>
          <CardTitle>テーマカラー</CardTitle>
          <CardDescription>
            ダッシュボードのアクセントカラー。すべての管理画面に即時反映されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeColorForm current={theme.id} />
        </CardContent>
      </Card>

      {/* 管理者パスワード — 複数発行 */}
      <Card>
        <CardHeader>
          <CardTitle>管理者パスワード</CardTitle>
          <CardDescription>
            ログインに使うパスワードを複数発行できます。 各行はラベルで識別 (ログイン画面はパスワードのみ)。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminManager admins={admins} currentAdminId={currentAdminId} />
        </CardContent>
      </Card>

      {/* 自分のパスワード変更 */}
      <Card>
        <CardHeader>
          <CardTitle>自分のパスワードを変更</CardTitle>
          <CardDescription>
            現在ログイン中の管理者のパスワードを変更します。
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
