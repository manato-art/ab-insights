'use client';

// 上部バー: 現在ページ (パンくず) + LIVE pill + 時計 (JST) + ユーザー pill。
// 時計は client で 1 秒更新。

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { activeNavItem } from './nav-items';

const FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatNow(d: Date): string {
  // 例: "2026/05/01 (金) 21:32 JST"
  return FORMATTER.format(d) + ' JST';
}

export function Topbar() {
  const pathname = usePathname();
  const active = activeNavItem(pathname);

  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const tick = () => setNow(formatNow(new Date()));
    tick();
    const id = setInterval(tick, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="sticky top-0 z-30 h-12 flex items-center justify-between px-6 border-b backdrop-blur-sm"
      style={{
        background: 'oklch(1 0 0 / 0.92)',
        borderColor: 'var(--hairline)',
      }}
    >
      <div className="flex items-center gap-3 text-[12px] min-w-0">
        <span className="text-muted-foreground tracking-[0.18em] uppercase text-[10px]">
          ab.insights
        </span>
        <span className="text-muted-foreground/60">›</span>
        <span className="font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {active?.label ?? '管理コンソール'}
        </span>
        <span
          className="ml-3 px-2 py-0.5 text-[10px] tracking-widest uppercase rounded font-semibold"
          style={{
            background: 'oklch(0.93 0.05 60)',
            color: 'var(--brand-orange)',
          }}
        >
          live
        </span>
      </div>
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="tabular-nums" suppressHydrationWarning>
          {now || '—'}
        </span>
      </div>
    </div>
  );
}
