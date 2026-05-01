'use client';

// サイドバー nav (active 状態を usePathname で算出)

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, activeNavItem } from './nav-items';

export function SidebarNav() {
  const pathname = usePathname();
  const active = activeNavItem(pathname);

  return (
    <nav className="flex-1 px-2 py-2 space-y-0.5 text-[13px]">
      {NAV_ITEMS.map((item) => {
        const isActive = active?.href === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors"
            style={{
              background: isActive ? 'var(--sidebar-accent)' : 'transparent',
              color: isActive ? 'var(--sidebar-accent-foreground)' : 'var(--sidebar-foreground)',
              fontWeight: isActive ? 600 : 400,
              borderLeft: `2px solid ${isActive ? 'var(--sidebar-primary)' : 'transparent'}`,
              paddingLeft: isActive ? 10 : 12,
            }}
          >
            <Icon
              className="h-4 w-4 shrink-0"
              style={{ color: isActive ? 'var(--sidebar-primary)' : 'var(--muted-foreground)' }}
              strokeWidth={isActive ? 2.2 : 1.7}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
