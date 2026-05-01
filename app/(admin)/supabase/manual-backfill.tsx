'use client';

// 手動 backfill フォーム + 結果表示。
// 期間 (YYYY-MM) を指定して 「実行」 ボタンで Server Action を呼び出す。

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backfillMonthAction } from './actions';
import type { BackfillResult } from '@/lib/backfill-runner';

function currentMonthYYYYMM(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ManualBackfillForm() {
  const [month, setMonth] = useState(currentMonthYYYYMM());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);
    startTransition(async () => {
      try {
        const r = await backfillMonthAction(month);
        setResult(r);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <Label htmlFor="month" className="text-xs">
            対象月 (YYYY-MM, JST 暦日)
          </Label>
          <Input
            id="month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 w-[180px]"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? '実行中…' : 'この月を Supabase に反映'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        指定月の工程をすべて再アップロードします。 既にアップロード済の画像はスキップ、
        meta.txt は常に最新で上書きします (上書きは安全)。
      </p>

      {errorMsg && (
        <div className="rounded-md ring-1 ring-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {result && (
        <div
          className={`rounded-md ring-1 p-4 text-sm ${
            result.ok
              ? 'ring-green-300 bg-green-50 dark:bg-green-950/30'
              : 'ring-destructive/50 bg-destructive/5'
          }`}
        >
          <div className="font-semibold mb-2">
            {result.ok ? '✅ 完了' : '❌ エラー'} ({result.monthLabel})
          </div>
          {result.error && (
            <div className="text-destructive mb-2">{result.error}</div>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            <Field k="対象 (アーカイブ)" v={`${result.archivedEventsCount} 工程`} />
            <Field k="対象 (現役)" v={`${result.currentEventsCount} 工程`} />
            <Field k="所要時間" v={`${(result.elapsedMs / 1000).toFixed(1)}秒`} />
            <Field k="画像 アップロード成功" v={`${result.uploadedImages} 枚`} accent />
            <Field k="meta.txt 反映" v={`${result.uploadedMetas} 件`} accent />
            <Field k="画像 スキップ" v={`${result.skippedImages} 枚`} />
            <Field k="画像 失敗" v={`${result.failedImages} 枚`} bad={result.failedImages > 0} />
            <Field k="meta.txt 失敗" v={`${result.failedMetas} 件`} bad={result.failedMetas > 0} />
          </dl>
        </div>
      )}
    </form>
  );
}

function Field({
  k,
  v,
  accent,
  bad,
}: {
  k: string;
  v: string;
  accent?: boolean;
  bad?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={`tabular-nums ${
          bad ? 'text-destructive font-semibold' : accent ? 'font-semibold' : ''
        }`}
      >
        {v}
      </dd>
    </>
  );
}
