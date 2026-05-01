// サイドバー / トップバーで共有するナビ定義。
// アイコンは lucide-react を使用し、 active 判定は path の前方一致 (`/` のみ完全一致) で行う。

import {
  LayoutDashboard,
  Users,
  Target,
  Wand2,
  Network,
  ScrollText,
  Upload,
  History,
  Database,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/users', label: 'ユーザー管理', icon: Users },
  { href: '/appeals', label: '訴求ポイント統計', icon: Target },
  { href: '/ai-edits', label: 'AI 修正指示', icon: Wand2 },
  { href: '/cross-genre', label: 'ジャンル転移分析', icon: Network },
  { href: '/prompts', label: 'プロンプト管理', icon: ScrollText },
  { href: '/upload', label: '学習アップロード', icon: Upload },
  { href: '/events', label: '工程履歴一覧', icon: History },
  { href: '/supabase', label: 'Supabase', icon: Database },
  { href: '/settings', label: '設定', icon: Settings },
] as const;

/** path に最も合致する nav item を返す。完全一致を優先、なければ前方一致で長いものを優先。 */
export function activeNavItem(pathname: string): NavItem | null {
  const exact = NAV_ITEMS.find((it) => it.href === pathname);
  if (exact) return exact;
  return (
    NAV_ITEMS.filter((it) => it.href !== '/' && pathname.startsWith(it.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
