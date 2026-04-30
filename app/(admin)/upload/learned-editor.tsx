'use client';

// アップロード済み「学習済みインサイト」の閲覧・編集 Dialog
// - 未アップロードなら button は disabled
// - 開くと getUploadedGenreDetail で全文を取得し textarea に入れる
// - 保存で updateUploadedGenreContent を呼び、完了後ページを revalidate

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatJstDateTime } from '@/lib/format';
import {
  getUploadedGenreDetail,
  updateUploadedGenreContent,
} from './actions';

export function LearnedEditorButton({
  genre,
  disabled,
}: {
  genre: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [content, setContent] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      const d = await getUploadedGenreDetail(genre);
      if (!d) {
        toast.error('このジャンルはまだアップロードされていません');
        setOpen(false);
        return;
      }
      setContent(d.content);
      setNote(d.note);
      setUpdatedAt(d.updatedAt.toString());
    } catch (e) {
      toast.error((e as Error).message || '読み込みに失敗しました');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    start(async () => {
      try {
        await updateUploadedGenreContent(genre, content);
        toast.success('学習内容を更新しました');
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message || '保存に失敗しました');
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => handleOpen(true)}
      >
        詳細・編集
      </Button>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>学習内容の編集 — {genre}</DialogTitle>
            <DialogDescription className="text-xs">
              ab-system が「{genre}」の画像生成時にプロンプトへ注入する内容です。
              直接編集して保存できます。
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              読み込み中…
            </div>
          ) : (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="w-full rounded border bg-muted/30 p-3 text-sm font-mono whitespace-pre-wrap resize-none min-h-[320px] flex-1"
                placeholder="学習内容(ab-system のプロンプトに挿入されます)"
              />
              {note && (
                <div className="text-[11px] text-muted-foreground mt-1 break-all">
                  {note}
                </div>
              )}
              {updatedAt && (
                <div className="text-[11px] text-muted-foreground">
                  最終更新: {formatJstDateTime(updatedAt)}
                </div>
              )}
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              disabled={pending || loading || !content.trim()}
            >
              {pending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
