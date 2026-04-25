'use client';

// 「🔄 プロンプト更新」パネル。
// /prompts の各ジャンルタブの先頭に配置。
// 押下 → 3 ブロック並列生成 (vision 使用) → プレビュー Dialog → 確定で upsert。
// ジャンル管理(名称変更 / 学習リセット)もここからアクセス可能。

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  generatePromptBlockPreview,
  commitPromptBlocks,
} from './generate-actions';
import { renameGenre, resetGenreLearning } from './genre-admin-actions';
import type {
  GeneratePreviewResult,
  PromptBlockDraft,
} from '@/lib/insights/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function GeneratePromptPanel({
  genre,
  existingGenres,
}: {
  genre: string;
  existingGenres: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GeneratePreviewResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const isAllTab = genre === '全て';

  function handleGenerate() {
    if (isAllTab) {
      handleGenerateAll();
      return;
    }
    startTransition(async () => {
      toast.info(`${genre} の学習データを分析中…(20-50 秒)`);
      const r = await generatePromptBlockPreview(genre);
      setResult(r);
      if (!r.ok) {
        toast.error(r.error);
      } else {
        const okBlocks = r.blocks.filter((b) => b.enhanced).length;
        toast.success(
          `プレビュー生成完了(${okBlocks}/${r.blocks.length} ブロックが AI 整形成功)`,
        );
      }
    });
  }

  /**
   * 「全て」タブの場合は、'全て' を除く全ジャンルを順次更新してそのままコミット。
   * 逐次実行(並列だと OpenAI レート制限に引っかかりやすい)、各完了ごとに toast。
   */
  function handleGenerateAll() {
    const targets = existingGenres.filter((g) => g !== '全て');
    if (targets.length === 0) {
      toast.warning('更新対象のジャンルがありません');
      return;
    }
    const mins = Math.max(1, Math.ceil((targets.length * 30) / 60));
    const ok = window.confirm(
      `${targets.length} ジャンル(${targets.join(' / ')})のプロンプトを順次更新します。` +
        `\n所要時間の目安: 約 ${mins} 分\n` +
        '各ジャンルの 3 ブロックを自動生成 → そのまま保存(プレビュー省略)します。\n\n実行しますか?',
    );
    if (!ok) return;

    startTransition(async () => {
      let okCount = 0;
      let ngCount = 0;
      const errors: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const g = targets[i];
        toast.info(`(${i + 1}/${targets.length}) ${g} を更新中…`);
        const r = await generatePromptBlockPreview(g);
        if (!r.ok) {
          ngCount += 1;
          errors.push(`${g}: ${r.error}`);
          continue;
        }
        // 生成成功したブロックをそのまま commit(enhanced or ルールベースでも保存)
        const c = await commitPromptBlocks(g, r.blocks);
        if (c.ok) {
          okCount += 1;
          toast.success(`✓ ${g} — ${c.upsertedCount} ブロック保存`);
        } else {
          ngCount += 1;
          errors.push(`${g} (commit): ${c.error}`);
        }
      }
      if (ngCount === 0) {
        toast.success(`全 ${okCount} ジャンルの更新が完了しました`);
      } else {
        toast.warning(
          `${okCount} 件成功 / ${ngCount} 件失敗\n${errors.slice(0, 3).join('\n')}`,
        );
      }
      router.refresh();
    });
  }

  function handleClose() {
    if (committing) return;
    setResult(null);
  }

  function handleCommit() {
    if (!result || !result.ok) return;
    setCommitting(true);
    startTransition(async () => {
      const res = await commitPromptBlocks(result.genre, result.blocks);
      setCommitting(false);
      if (res.ok) {
        toast.success(
          `${res.genre}: ${res.upsertedCount} ブロックを保存しました`,
        );
        setResult(null);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <Card className="border-primary/30 bg-primary/5 py-0">
        <CardContent className="px-3 py-2 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
            <div className="font-semibold text-sm whitespace-nowrap">🔄 プロンプト自動更新</div>
            <p className="text-xs text-muted-foreground truncate">
              {isAllTab
                ? '全ジャンルを順次更新(プレビュー省略・自動保存)'
                : 'DL画像 + 刺さりコピー + 訴求サブ統計から 3 ブロック生成'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isAllTab && (
              <>
                <button
                  type="button"
                  onClick={() => setRenameOpen(true)}
                  disabled={pending || committing}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                >
                  名称変更
                </button>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  disabled={pending || committing}
                  className="text-[11px] text-destructive hover:text-destructive/80 underline underline-offset-2 disabled:opacity-50"
                >
                  学習リセット
                </button>
              </>
            )}
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={pending || committing}
            >
              {pending && !result
                ? (isAllTab ? '更新中…' : '生成中…')
                : (isAllTab ? '全ジャンル一括更新' : 'プロンプトを更新')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <RenameDialog
        open={renameOpen}
        currentName={genre}
        existingGenres={existingGenres}
        pending={pending}
        onClose={() => setRenameOpen(false)}
        onSubmit={(newName) => {
          startTransition(async () => {
            const res = await renameGenre(genre, newName);
            if (res.success) {
              toast.success(
                res.merged
                  ? `${genre} → ${newName} に合致(Event ${res.movedEvents} 件 / Prompt ${res.movedPrompts} 件統合)`
                  : `${genre} → ${newName} に改名(Event ${res.movedEvents} 件 / Prompt ${res.movedPrompts} 件)`,
              );
              setRenameOpen(false);
              router.replace(`/prompts?genre=${encodeURIComponent(newName)}`);
              router.refresh();
            } else {
              toast.error(res.error || '名称変更に失敗しました');
            }
          });
        }}
      />

      <ResetDialog
        open={resetOpen}
        genre={genre}
        pending={pending}
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          startTransition(async () => {
            const res = await resetGenreLearning(genre);
            if (res.success) {
              toast.success(
                `${genre} の学習をリセット(Event ${res.deletedEvents} 件 / Prompt ${res.deletedPrompts} 件削除)`,
              );
              setResetOpen(false);
              router.refresh();
            } else {
              toast.error(res.error || 'リセットに失敗しました');
            }
          });
        }}
      />

      <Dialog
        open={result != null && result.ok}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>プロンプト自動更新プレビュー — {genre}</DialogTitle>
            <DialogDescription>
              以下 3 ブロックが生成されました。「確定」で GenrePrompt に upsert します(既存同名ブロックは上書き)。
            </DialogDescription>
          </DialogHeader>

          {result && result.ok && (
            <>
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-0.5">
                <div>
                  Event <span className="font-mono">{result.signals.eventCount}</span> 件 /
                  DL <span className="font-mono">{result.signals.downloadedCount}</span> /
                  横展開 <span className="font-mono">{result.signals.expandedCount}</span> /
                  解析画像 <span className="font-mono">{result.signals.savedImageCount}</span> 枚
                </div>
                <div className="text-muted-foreground">
                  平均刺さり度{' '}
                  {result.signals.avgHitScore != null
                    ? result.signals.avgHitScore.toFixed(2)
                    : '—'}
                </div>
              </div>

              <div className="space-y-3">
                {result.blocks.map((b) => (
                  <BlockPreview key={b.kind} block={b} />
                ))}
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={committing}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleCommit}
              disabled={
                committing ||
                !result ||
                !result.ok ||
                result.blocks.every((b) => !b.content.trim())
              }
            >
              {committing ? '保存中…' : '確定して 3 ブロック保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameDialog({
  open,
  currentName,
  existingGenres,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  currentName: string;
  existingGenres: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (newName: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {open && (
          <RenameDialogInner
            key={currentName}
            currentName={currentName}
            existingGenres={existingGenres}
            pending={pending}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameDialogInner({
  currentName,
  existingGenres,
  pending,
  onClose,
  onSubmit,
}: {
  currentName: string;
  existingGenres: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (newName: string) => void;
}) {
  const [value, setValue] = useState(currentName);
  const trimmed = value.trim();
  const wouldMerge =
    trimmed.length > 0 &&
    trimmed !== currentName &&
    existingGenres.includes(trimmed);
  const canSubmit = trimmed.length > 0 && trimmed !== currentName && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>ジャンル名を変更</DialogTitle>
        <DialogDescription>
          既に同じ名称のジャンルがあれば自動で合致(マージ)されます。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">変更前</Label>
          <div className="text-sm font-mono p-2 bg-muted rounded-md break-all">
            {currentName}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rename-input-prompts" className="text-xs">
            新しい名称
          </Label>
          <Input
            id="rename-input-prompts"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="新しいジャンル名"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) onSubmit(trimmed);
            }}
          />
          {wouldMerge && (
            <p className="text-xs text-amber-600">
              ⚠ 既存の「{trimmed}」に合致されます(Event / Prompt をマージ)
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        <Button onClick={() => onSubmit(trimmed)} disabled={!canSubmit}>
          {wouldMerge ? '合致して統合' : '変更'}
        </Button>
      </DialogFooter>
    </>
  );
}

function ResetDialog({
  open,
  genre,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  genre: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {open && (
          <ResetDialogInner
            key={genre}
            genre={genre}
            pending={pending}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetDialogInner({
  genre,
  pending,
  onClose,
  onConfirm,
}: {
  genre: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const canSubmit = confirmText.trim() === genre && !pending;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-destructive">学習リセット</DialogTitle>
        <DialogDescription>
          このジャンルの Event と全 Prompt ブロック(自動 / 手動問わず) を削除します。
          <strong className="text-destructive block mt-1">
            この操作は元に戻せません。
          </strong>
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="font-semibold">{genre}</div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm-prompts" className="text-xs">
            確認のため、ジャンル名「
            <span className="font-mono font-semibold">{genre}</span>
            」を入力してください
          </Label>
          <Input
            id="reset-confirm-prompts"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={genre}
            autoFocus
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={!canSubmit}>
          リセットする
        </Button>
      </DialogFooter>
    </>
  );
}

function BlockPreview({ block }: { block: PromptBlockDraft }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-semibold text-sm">{block.blockName}</div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          priority {block.priority}
        </Badge>
        {block.enhanced ? (
          <Badge className="bg-green-600 hover:bg-green-600 text-[10px]">
            AI 整形
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            ルールベース
          </Badge>
        )}
        {block.model && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {block.model}
          </Badge>
        )}
        {block.error && (
          <Badge variant="destructive" className="text-[10px]">
            ⚠ {block.error}
          </Badge>
        )}
      </div>
      <pre className="whitespace-pre-wrap font-mono text-xs bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto">
        {block.content || '(本文なし)'}
      </pre>
      <div className="text-[11px] text-muted-foreground">{block.note}</div>
    </div>
  );
}
