import { Suspense } from 'react';
import LoginForm from './login-form';

export const metadata = { title: 'ログイン — ab-insights' };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
