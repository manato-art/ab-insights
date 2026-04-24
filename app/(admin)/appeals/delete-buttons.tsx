'use client';

// 訴求統計ページの削除ボタン群(Client Component)
// - confirm() で確認してから Server Action を呼ぶ
// - 成功時は件数を toast で通知し、ページを更新

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  deleteGenreData,
  deleteSelectedAppeal,
  deleteRewrittenAppeal,
  deleteAiEditInstruction,
} from './actions';

export function DeleteGenreButton({ genre }: { genre: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`ジャンル「${genre}」の全イベントを削除します。よろしいですか？`)) return;
        start(async () => {
          try {
            const n = await deleteGenreData(genre);
            toast.success(`削除しました (${n} 件)`);
          } catch (e) {
            toast.error((e as Error).message || '削除に失敗しました');
          }
        });
      }}
    >
      {pending ? '削除中…' : 'ジャンル全体を削除'}
    </Button>
  );
}

export function DeleteRowButton({
  kind,
  genre,
  args,
  label = '削除',
}: {
  kind: 'selected' | 'rewritten' | 'aiedit';
  genre: string;
  args:
    | { originalText: string }
    | { originalText: string; rewrittenText: string }
    | { instructionKind: string; text: string };
  label?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`この行のデータを削除します。よろしいですか？`)) return;
        start(async () => {
          try {
            let n = 0;
            if (kind === 'selected') {
              const a = args as { originalText: string };
              n = await deleteSelectedAppeal(genre, a.originalText);
            } else if (kind === 'rewritten') {
              const a = args as { originalText: string; rewrittenText: string };
              n = await deleteRewrittenAppeal(
                genre,
                a.originalText,
                a.rewrittenText,
              );
            } else {
              const a = args as { instructionKind: string; text: string };
              n = await deleteAiEditInstruction(genre, a.instructionKind, a.text);
            }
            toast.success(`削除しました (${n} 件)`);
          } catch (e) {
            toast.error((e as Error).message || '削除に失敗しました');
          }
        });
      }}
      className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition disabled:opacity-50"
      aria-label={label}
      title={label}
    >
      {pending ? '…' : '×'}
    </button>
  );
}
