'use client';

// フィルタ bar(クライアント): 値を変更すると URL の query を書き換えるだけ。
// Server Component 側が searchParams を読み直して再描画する。
import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const ENDPOINT_OPTIONS = [
  { value: '', label: '全て' },
  { value: 'generate-images', label: '新規生成' },
  { value: 'generate-similar-one', label: '横展開' },
  { value: 'improve-images', label: '改善' },
  { value: 'edit-region', label: 'AI部分修正' },
  { value: 'transform-image', label: '変形' },
  { value: 'generate-reference', label: '参考広告ベース' },
  { value: 'stylize-product', label: 'スタイル変換' },
  { value: 'upscale-image', label: '画質向上' },
  { value: 'resize-image', label: 'リサイズ' },
];

const TRI_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: '1', label: 'あり' },
  { value: '0', label: 'なし' },
];

const PERIOD_CHIPS: { value: string; label: string }[] = [
  { value: '', label: '全期間' },
  { value: 'today', label: '本日' },
  { value: 'week', label: '今週' },
  { value: 'month', label: '今月' },
];

export function FilterBar({
  initial,
}: {
  initial: {
    genre: string;
    endpoint: string;
    user: string;
    period: string;
    from: string;
    to: string;
    downloaded: string;
    horizontallyExpanded: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      // 範囲指定 ⇄ プリセットは排他
      if (key === 'period' && value) {
        params.delete('from');
        params.delete('to');
      }
      if ((key === 'from' || key === 'to') && value) {
        params.delete('period');
      }
      // フィルタ変更時は page=1 に戻す
      params.delete('page');
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, sp],
  );

  const usingRange = Boolean(initial.from || initial.to);

  const reset = () => {
    startTransition(() => {
      router.replace(pathname);
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg ring-1 ring-border bg-card/50">
      <div className="space-y-1.5">
        <Label className="text-xs">ジャンル</Label>
        <Input
          defaultValue={initial.genre}
          placeholder="(例: 化粧品)"
          className="h-8 w-40"
          onBlur={(e) => setParam('genre', e.currentTarget.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              setParam('genre', (e.target as HTMLInputElement).value.trim());
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">種別</Label>
        <select
          defaultValue={initial.endpoint}
          onChange={(e) => setParam('endpoint', e.currentTarget.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {ENDPOINT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">ユーザー</Label>
        <Input
          defaultValue={initial.user}
          placeholder="(例: takeo)"
          className="h-8 w-44"
          onBlur={(e) => setParam('user', e.currentTarget.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              setParam('user', (e.target as HTMLInputElement).value.trim());
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">DL</Label>
        <select
          defaultValue={initial.downloaded}
          onChange={(e) => setParam('downloaded', e.currentTarget.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {TRI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">横展開</Label>
        <select
          defaultValue={initial.horizontallyExpanded}
          onChange={(e) =>
            setParam('horizontallyExpanded', e.currentTarget.value)
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {TRI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">期間プリセット</Label>
        <div className="flex gap-1">
          {PERIOD_CHIPS.map((c) => (
            <button
              key={c.value || 'all'}
              type="button"
              onClick={() => setParam('period', c.value)}
              className={`h-8 px-3 rounded-md text-xs border transition ${
                !usingRange && initial.period === c.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-input hover:bg-accent'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="events-from" className="text-xs">
          開始日 (JST)
        </Label>
        <Input
          id="events-from"
          type="date"
          value={initial.from}
          max={initial.to || undefined}
          onChange={(e) => setParam('from', e.currentTarget.value)}
          className="h-8 w-[160px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="events-to" className="text-xs">
          終了日 (JST)
        </Label>
        <Input
          id="events-to"
          type="date"
          value={initial.to}
          min={initial.from || undefined}
          onChange={(e) => setParam('to', e.currentTarget.value)}
          className="h-8 w-[160px]"
        />
      </div>

      <div className="ml-auto">
        <Button variant="outline" size="sm" onClick={reset}>
          リセット
        </Button>
      </div>
    </div>
  );
}
