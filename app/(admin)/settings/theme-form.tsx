'use client';

// テーマカラー選択 UI。スウォッチ + ラベル をラジオで一覧、変更時に Server Action 経由で保存。
// 保存後はソフトリロード (router.refresh) で layout を再取得して全画面に反映。

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { THEME_PRESETS, type ThemeColorId } from '@/lib/theme';
import { setThemeColorAction } from './actions';

export function ThemeColorForm({ current }: { current: ThemeColorId }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(id: ThemeColorId) {
    if (id === current || pending) return;
    startTransition(async () => {
      const res = await setThemeColorAction(id);
      if (res.ok) {
        toast.success('テーマを変更しました');
        router.refresh();
      } else {
        toast.error(res.error ?? 'テーマの保存に失敗しました');
      }
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="テーマカラー"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
    >
      {THEME_PRESETS.map((p) => {
        const selected = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => pick(p.id)}
            disabled={pending}
            className={`group relative flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
              selected
                ? 'border-foreground/40 bg-accent/40 ring-1 ring-foreground/10'
                : 'border-border hover:bg-accent/30'
            } ${pending ? 'opacity-60 cursor-progress' : 'cursor-pointer'}`}
          >
            {/* スウォッチ — 主役色 + soft の 2 トーン */}
            <span
              aria-hidden
              className="relative shrink-0 h-7 w-7 rounded-full overflow-hidden ring-1 ring-black/5"
              style={{ background: p.swatch }}
            >
              <span
                className="absolute inset-y-0 right-0 w-1/2"
                style={{ background: p.brandSoft }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium truncate">{p.label}</span>
              <span className="block text-[10px] text-muted-foreground font-mono truncate">
                {p.id}
              </span>
            </span>
            {selected && (
              <span
                aria-hidden
                className="text-[10px] tracking-wider uppercase text-muted-foreground"
              >
                選択中
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
