'use client';

// グローバルなデフォルト月上限を編集するフォーム。
// 空欄で「上限なし」を意味する。

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveDefaultMonthlyQuotaAction } from './actions';

export function DefaultQuotaForm({ initial }: { initial: number | null }) {
  const [value, setValue] = useState<string>(initial == null ? '' : String(initial));
  const [pending, startTransition] = useTransition();

  const initialStr = initial == null ? '' : String(initial);
  const dirty = value.trim() !== initialStr;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        toast.error('0 以上の整数で指定してください');
        return;
      }
    }
    startTransition(async () => {
      const res = await saveDefaultMonthlyQuotaAction(trimmed === '' ? null : trimmed);
      if (res.ok) toast.success('デフォルト上限を保存しました');
      else toast.error(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="defaultQuota" className="text-xs">
          月画像上限 (空欄 = 上限なし)
        </Label>
        <Input
          id="defaultQuota"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 1000"
          className="h-9 w-[180px]"
        />
      </div>
      <Button type="submit" size="sm" disabled={!dirty || pending}>
        {pending ? '保存中…' : '保存'}
      </Button>
    </form>
  );
}
