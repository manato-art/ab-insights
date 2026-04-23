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
  { value: 'generate-images', label: 'generate-images' },
  { value: 'improve-images', label: 'improve-images' },
  { value: 'generate-similar-one', label: 'generate-similar-one' },
];

const TRI_OPTIONS = [
  { value: '', label: '指定なし' },
  { value: '1', label: 'あり' },
  { value: '0', label: 'なし' },
];

export function FilterBar({
  initial,
}: {
  initial: {
    genre: string;
    endpoint: string;
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
      // フィルタ変更時は page=1 に戻す
      params.delete('page');
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, sp],
  );

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
        <Label className="text-xs">エンドポイント</Label>
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

      <div className="ml-auto">
        <Button variant="outline" size="sm" onClick={reset}>
          リセット
        </Button>
      </div>
    </div>
  );
}
