'use client';

// プロンプトブロック関連のインタラクティブ UI をここに集約。
// - 新規追加ボタン (+ Dialog)
// - カード毎の編集 Dialog / 削除確認 Dialog / enabled トグル / 上下移動
// Server Component(page.tsx)から block データと既存 genre 一覧を渡してもらう。

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  createPromptBlock,
  updatePromptBlock,
  deletePromptBlock,
  togglePromptEnabled,
  movePromptBlock,
  type ActionResult,
} from './actions';

export type PromptBlock = {
  id: number;
  genre: string;
  blockName: string;
  content: string;
  enabled: boolean;
  priority: number;
  note: string | null;
  updatedAt: Date;
};

// ============================================================
// ブロック作成 Dialog(新規追加ボタン)
// ============================================================
export function NewBlockButton({
  existingGenres,
  defaultGenre,
}: {
  existingGenres: string[];
  defaultGenre?: string;
}) {
  const [open, setOpen] = useState(false);
  const [genre, setGenre] = useState(defaultGenre ?? '');
  const [blockName, setBlockName] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [pending, startTransition] = useTransition();

  function reset() {
    setGenre(defaultGenre ?? '');
    setBlockName('');
    setContent('');
    setNote('');
    setPriority('');
    setEnabled(true);
  }

  function submit() {
    startTransition(async () => {
      const res = await createPromptBlock({
        genre: genre.trim(),
        blockName: blockName.trim(),
        content,
        note: note.trim() || null,
        priority: priority ? Number(priority) : null,
        enabled,
      });
      if (res.ok) {
        toast.success('ブロックを追加しました');
        setOpen(false);
        reset();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">＋ ブロック追加</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新規プロンプトブロック</DialogTitle>
          <DialogDescription>
            ジャンル別の追加プロンプトを作成します。enabled が有効なブロックのみ ab-system に送信されます。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>ジャンル</Label>
            <Input
              list="genre-options"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="例: 化粧品 / サプリ / 全て"
            />
            <datalist id="genre-options">
              {existingGenres.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>ブロック名</Label>
            <Input
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              placeholder="例: 効果実感訴求"
            />
          </div>
          <div className="space-y-1.5">
            <Label>本文(プロンプトに挿入)</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Gemini に送り込むテキスト"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>優先度(priority)</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="(空欄なら末尾)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>enabled</Label>
              <div className="h-8 flex items-center">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <span className="ml-2 text-xs text-muted-foreground">
                  {enabled ? '有効' : '無効'}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>メモ(任意)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="意図や仮説など"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? '作成中…' : '作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 編集 Dialog
// ============================================================
export function EditBlockButton({ block }: { block: PromptBlock }) {
  const [open, setOpen] = useState(false);
  const [genre, setGenre] = useState(block.genre);
  const [blockName, setBlockName] = useState(block.blockName);
  const [content, setContent] = useState(block.content);
  const [note, setNote] = useState(block.note ?? '');
  const [priority, setPriority] = useState(String(block.priority));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await updatePromptBlock({
        id: block.id,
        genre: genre.trim(),
        blockName: blockName.trim(),
        content,
        note,
        priority: priority ? Number(priority) : null,
      });
      handleResult(res, '更新しました');
      if (res.ok) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs">
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ブロック編集</DialogTitle>
          <DialogDescription>{block.blockName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>ジャンル</Label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ブロック名</Label>
            <Input value={blockName} onChange={(e) => setBlockName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>本文</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>優先度</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>メモ</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button size="sm" onClick={submit} disabled={pending}>
            {pending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 削除確認
// ============================================================
export function DeleteBlockButton({ block }: { block: PromptBlock }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await deletePromptBlock(block.id);
      handleResult(res, '削除しました');
      if (res.ok) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="xs">
          削除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ブロックを削除しますか?</DialogTitle>
          <DialogDescription>
            「{block.blockName}」を削除します。この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? '削除中…' : '削除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// enabled トグル(即時反映)
// ============================================================
export function EnabledToggle({ block }: { block: PromptBlock }) {
  const [pending, startTransition] = useTransition();
  // 楽観的 UI: 即座に UI を更新
  const [checked, setChecked] = useState(block.enabled);

  function onChange(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const res = await togglePromptEnabled(block.id, next);
      if (!res.ok) {
        // 失敗したら元に戻す
        setChecked(!next);
        toast.error(res.error);
      } else {
        toast.success(next ? '有効化しました' : '無効化しました');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} disabled={pending} />
      <span className="text-xs text-muted-foreground">
        {checked ? '有効' : '無効'}
      </span>
    </div>
  );
}

// ============================================================
// 上下移動
// ============================================================
export function MoveButtons({
  block,
  isFirst,
  isLast,
}: {
  block: PromptBlock;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function move(dir: 'up' | 'down') {
    startTransition(async () => {
      const res = await movePromptBlock(block.id, dir);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => move('up')}
        disabled={pending || isFirst}
        aria-label="上に移動"
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => move('down')}
        disabled={pending || isLast}
        aria-label="下に移動"
      >
        ↓
      </Button>
    </div>
  );
}

// ============================================================
// 共通ハンドラ
// ============================================================
function handleResult(res: ActionResult, successMsg: string) {
  if (res.ok) toast.success(successMsg);
  else toast.error(res.error);
}
