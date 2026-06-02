import { Suspense } from 'react';
import LoginForm from './login-form';

export const metadata = { title: 'ログイン — ab-insights' };

// 静的プリレンダさせず毎回サーバーレンダリングする。
// 静的化すると Vercel エッジが空ボディの 304 を返し続け、ログイン画面が真っ白になる事象が出たため。
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
