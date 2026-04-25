'use client';

// ブロック本文の inline editor。
// ダブルクリックで textarea に切り替えて編集 → 保存ボタン or Cmd+Enter で更新、Esc でキャンセル。

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updatePromptBlock } from './actions';
import { Button } from '@/components/ui/button';

export function InlineContentEditor({
  blockId,
  initialContent,
}: {
  blockId: number;
  initialContent: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 親 props が更新されたら draft も追従(再 fetch 時の整合)
  useEffect(() => {
    if (!editing) setDraft(initialContent);
  }, [initialContent, editing]);

  // 編集モード開始時に textarea にフォーカス + 全選択
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(0, textareaRef.current.value.length);
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error('本文を入力してください');
      return;
    }
    if (trimmed === initialContent.trim()) {
      // 変更なし → そのまま閉じる
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await updatePromptBlock({ id: blockId, content: trimmed });
      if (r.ok) {
        toast.success('保存しました');
        setEditing(false);
      } else {
        toast.error(r.error || '保存に失敗しました');
      }
    });
  }

  function handleCancel() {
    setDraft(initialContent);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full font-mono text-xs bg-muted/50 rounded-md p-3 min-h-[200px] max-h-[60vh] resize-y border border-primary/40 outline-none focus:ring-2 focus:ring-primary/30"
          disabled={pending}
        />
        <div className="flex items-center gap-2 text-xs">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={pending}
          >
            {pending ? '保存中…' : '保存'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={pending}
          >
            キャンセル
          </Button>
          <span className="text-muted-foreground ml-auto">
            ⌘Enter で保存 · Esc でキャンセル
          </span>
        </div>
      </div>
    );
  }

  return (
    <pre
      onDoubleClick={() => setEditing(true)}
      title="ダブルクリックで編集"
      className="whitespace-pre-wrap font-mono text-xs bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto cursor-text hover:bg-muted/70 transition-colors"
    >
      {initialContent}
    </pre>
  );
}
