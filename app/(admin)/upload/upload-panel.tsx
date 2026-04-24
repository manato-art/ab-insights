'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  uploadGenreLearning,
  uploadMultipleGenres,
  disableUploadedGenre,
  enableUploadedGenre,
  deleteUploadedGenre,
  type UploadResult,
} from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LearnedEditorButton } from './learned-editor';

type ThumbItem = {
  eventId: number;
  imageIndex: number;
  downloaded: boolean;
  aiEdited: boolean;
  createdAt: string;
  dataUrl: string | null;
  hitScore: number | null;
  appealType: string | null;
};

type GenreStat = {
  genre: string;
  eventCount: number;
  downloaded: number;
  expanded: number;
  avgHit: number | null;
  uploaded: boolean;
  uploadedEnabled: boolean;
  uploadedAt: Date | string | null;
  uploadedSnippet: string | null;
  thumbs: ThumbItem[];
};

export default function UploadPanel({ stats }: { stats: GenreStat[] }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resultDialog, setResultDialog] = useState<UploadResult | UploadResult[] | null>(null);

  function toggleSelect(genre: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(genre)) next.delete(genre);
      else next.add(genre);
      return next;
    });
  }

  function handleUpload(genre: string) {
    startTransition(async () => {
      const result = await uploadGenreLearning(genre);
      if (result.success) {
        toast.success(
          `${genre} をアップロードしました(${result.eventCount} 件集計${result.enhanced ? ' / AI 要約適用' : ' / ルールベース'})`
        );
        setResultDialog(result);
      } else {
        toast.error(result.error || 'アップロードに失敗しました');
      }
    });
  }

  function handleUploadSelected() {
    const genres = [...selected];
    if (genres.length === 0) {
      toast.warning('1 つ以上選択してください');
      return;
    }
    startTransition(async () => {
      toast.info(`${genres.length} ジャンルをアップロード中…`);
      const results = await uploadMultipleGenres(genres);
      const ok = results.filter((r) => r.success).length;
      const ng = results.length - ok;
      if (ng === 0) toast.success(`${ok} 件すべて成功`);
      else toast.warning(`${ok} 件成功 / ${ng} 件失敗`);
      setResultDialog(results);
      setSelected(new Set());
    });
  }

  function handleUploadAll() {
    startTransition(async () => {
      toast.info(`全ジャンルをアップロード中…`);
      const results = await uploadMultipleGenres();
      const ok = results.filter((r) => r.success).length;
      const ng = results.length - ok;
      if (ng === 0) toast.success(`${ok} 件すべて成功`);
      else toast.warning(`${ok} 件成功 / ${ng} 件失敗`);
      setResultDialog(results);
    });
  }

  function handleDisable(genre: string) {
    startTransition(async () => {
      await disableUploadedGenre(genre);
      toast.success(`${genre} を無効化しました(ab-system への反映を停止)`);
    });
  }

  function handleEnable(genre: string) {
    startTransition(async () => {
      await enableUploadedGenre(genre);
      toast.success(`${genre} を再有効化しました`);
    });
  }

  function handleDelete(genre: string) {
    if (!confirm(`${genre} の学習ブロックを削除します。よろしいですか?`)) return;
    startTransition(async () => {
      await deleteUploadedGenre(genre);
      toast.success(`${genre} を削除しました`);
    });
  }

  return (
    <>
      {/* 一括操作バー */}
      <div className="sticky top-2 z-10 bg-background/95 backdrop-blur border rounded-lg p-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">
          選択中: <strong className="text-foreground">{selected.size}</strong> ジャンル
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUploadSelected}
            disabled={pending || selected.size === 0}
          >
            選択したジャンルをアップロード
          </Button>
          <Button
            size="sm"
            onClick={handleUploadAll}
            disabled={pending || stats.length === 0}
          >
            全ジャンル一括アップロード
          </Button>
        </div>
      </div>

      {/* ジャンル別カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {stats.map((s) => (
          <Card key={s.genre} className={selected.has(s.genre) ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.genre)}
                    onChange={() => toggleSelect(s.genre)}
                    className="size-4 cursor-pointer"
                    aria-label={`${s.genre} を選択`}
                  />
                  <CardTitle className="text-lg">{s.genre}</CardTitle>
                </div>
                {s.uploaded && s.uploadedEnabled && (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                    反映中
                  </Badge>
                )}
                {s.uploaded && !s.uploadedEnabled && (
                  <Badge variant="secondary">無効化済み</Badge>
                )}
              </div>
              <CardDescription>
                Event {s.eventCount} 件 / DL {s.downloaded} / 横展開 {s.expanded}
                {s.avgHit != null && (
                  <span className="ml-2">平均 hit {(s.avgHit * 100).toFixed(1)}%</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 保存された画像 — DL / 完成ダウンロードが押されたもののみ(赤いモヤ強調) */}
              {(() => {
                const savedThumbs = s.thumbs.filter((t) => t.downloaded);
                if (savedThumbs.length === 0) return null;
                return (
                  <div>
                    <div className="font-mono text-red-500 text-[10px] uppercase tracking-wider mb-1.5">
                      保存された画像 ({savedThumbs.length}{savedThumbs.length >= 24 ? '+' : ''} 枚 / hit 順)
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {savedThumbs.map((t, i) => (
                        <ThumbTile key={`${t.eventId}-${t.imageIndex}-${i}`} thumb={t} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* すべての生成画像 — ジャンル内で記録された全サムネイル */}
              {s.thumbs.length > 0 && (
                <div>
                  <div className="font-mono text-muted-foreground text-[10px] uppercase tracking-wider mb-1.5">
                    すべての生成画像 ({s.thumbs.length}{s.thumbs.length >= 24 ? '+' : ''} 枚 / hit 順)
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {s.thumbs.map((t, i) => (
                      <ThumbTile key={`all-${t.eventId}-${t.imageIndex}-${i}`} thumb={t} />
                    ))}
                  </div>
                </div>
              )}
              {s.uploadedSnippet && (
                <div className="text-xs bg-muted p-2 rounded max-h-24 overflow-y-auto border">
                  <div className="font-mono text-muted-foreground text-[10px] uppercase tracking-wider mb-1">
                    現在の学習ブロック(プレビュー)
                  </div>
                  <div className="whitespace-pre-wrap">{s.uploadedSnippet}…</div>
                </div>
              )}
              {s.uploadedAt && (
                <div className="text-xs text-muted-foreground">
                  最終アップロード:{' '}
                  {new Intl.DateTimeFormat('ja-JP', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(s.uploadedAt))}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => handleUpload(s.genre)}
                  disabled={pending || s.eventCount === 0}
                >
                  {s.uploaded ? '再アップロード' : 'アップロード'}
                </Button>
                {s.uploaded && (
                  <LearnedEditorButton genre={s.genre} disabled={pending} />
                )}
                {s.uploaded && s.uploadedEnabled && (
                  <Button size="sm" variant="outline" onClick={() => handleDisable(s.genre)} disabled={pending}>
                    無効化
                  </Button>
                )}
                {s.uploaded && !s.uploadedEnabled && (
                  <Button size="sm" variant="outline" onClick={() => handleEnable(s.genre)} disabled={pending}>
                    再有効化
                  </Button>
                )}
                {s.uploaded && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.genre)} disabled={pending}>
                    削除
                  </Button>
                )}
              </div>
              {s.eventCount === 0 && (
                <p className="text-xs text-muted-foreground">
                  このジャンルにはまだ Event がありません
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* アップロード結果 Dialog */}
      <Dialog open={resultDialog != null} onOpenChange={() => setResultDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>アップロード結果</DialogTitle>
            <DialogDescription>
              以下の内容が ab-system のプロンプトに反映されます
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {Array.isArray(resultDialog) ? (
              resultDialog.map((r, i) => <ResultCard key={i} result={r} />)
            ) : resultDialog ? (
              <ResultCard result={resultDialog} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * サムネイル 1 枚タイル
 * DL されたもののみ表示(呼び出し側でフィルタ済み)。
 * 赤いモヤ(赤い glow + 赤枠)で「保存された画像」を強調する。
 */
function ThumbTile({ thumb }: { thumb: ThumbItem }) {
  const [open, setOpen] = useState(false);
  const badges: React.ReactNode[] = [];
  if (thumb.downloaded) badges.push(<span key="dl" className="text-[9px] leading-none px-1 py-0.5 bg-red-500 text-white rounded-sm">DL</span>);
  if (thumb.aiEdited)   badges.push(<span key="ed" className="text-[9px] leading-none px-1 py-0.5 bg-purple-500 text-white rounded-sm">EDIT</span>);

  // 保存(DL / 完成ダウンロード押下) された画像は赤いモヤ + 赤枠で強調
  const savedGlowClass = thumb.downloaded
    ? 'ring-2 ring-red-500 shadow-[0_0_14px_rgba(239,68,68,0.55)]'
    : thumb.aiEdited
    ? 'ring-2 ring-purple-500'
    : 'ring-1 ring-border';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative aspect-square rounded overflow-hidden bg-muted ${savedGlowClass} hover:opacity-90 transition`}
        title={`Event #${thumb.eventId} / image ${thumb.imageIndex}${thumb.appealType ? ` / ${thumb.appealType}` : ''}${thumb.hitScore != null ? ` / hit=${(thumb.hitScore * 100).toFixed(0)}%` : ''}`}
      >
        {/* 赤いモヤ(オーバーレイ) */}
        {thumb.downloaded && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.35),rgba(239,68,68,0)_70%)] mix-blend-screen"
          />
        )}
        {thumb.dataUrl ? (
          // サーバーから渡される data:image/webp;base64,... のみ使用するので next/image は使わず <img> で OK
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.dataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            no thumb
          </div>
        )}
        {badges.length > 0 && (
          <div className="absolute top-1 left-1 flex flex-col gap-0.5">{badges}</div>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Event #{thumb.eventId} / image {thumb.imageIndex}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {thumb.appealType && <>訴求: {thumb.appealType} / </>}
              {thumb.hitScore != null && <>hit: {(thumb.hitScore * 100).toFixed(0)}% / </>}
              {thumb.downloaded && 'DL済 / '}
              {thumb.aiEdited && 'AI編集済 / '}
              {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(thumb.createdAt))}
            </DialogDescription>
          </DialogHeader>
          {thumb.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb.dataUrl} alt="" className="w-full rounded max-h-[70vh] object-contain bg-muted" />
          ) : (
            <p className="text-sm text-muted-foreground">このイベントにはサムネイルが保存されていません(Phase 1 の webhook で thumbnail を送信していない旧データ)</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultCard({ result }: { result: UploadResult }) {
  if (!result.success) {
    return (
      <div className="border border-destructive/30 bg-destructive/5 p-3 rounded">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="destructive">失敗</Badge>
          <span className="font-semibold">{result.genre}</span>
        </div>
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    );
  }
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge>成功</Badge>
        <span className="font-semibold">{result.genre}</span>
        <span className="text-xs text-muted-foreground">
          {result.eventCount} 件集計
          {result.enhanced ? ` / AI 要約 (${result.model})` : ' / ルールベース'}
        </span>
      </div>
      <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
        {result.promptPreview}
      </pre>
    </div>
  );
}
