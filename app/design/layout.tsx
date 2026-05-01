// /design は (admin) レイアウト外 / 認証なしの独立スコープ。
// admin の sidebar とは独立した「比較ビュー」専用レイアウト。

import type { ReactNode } from 'react';

export const metadata = { title: 'UI 比較 — ab-insights design lab' };

export default function DesignLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
