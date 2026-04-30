'use client';

// API トークン管理 UI
// - 一覧表示 (無効化 / 再有効化 / 削除)
// - 新規発行 Dialog
//   - 発行成功時、平文トークンを 1 回だけ表示してコピー可能にする

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CopyIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  createApiTokenAction,
  deactivateApiTokenAction,
  activateApiTokenAction,
  deleteApiTokenAction,
} from './actions';
import { formatJstDateTime } from '@/lib/format';

export type TokenRow = {
  id: number;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  active: boolean;
};

type Props = {
  tokens: TokenRow[];
};

function formatDate(d: Date | null): string {
  return formatJstDateTime(d);
}

export default function TokenManager({ tokens }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          ab-system 等の外部アプリから /api を呼び出すためのトークンです。
          発行後は平文を二度と表示できないため、必ずコピーして保管してください。
        </p>
        <CreateTokenDialog />
      </div>

      {tokens.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          トークンはまだありません
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>発行日</TableHead>
                <TableHead>最終利用</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TokenRowItem key={t.id} token={t} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 発行ダイアログ
// ============================================================

function CreateTokenDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setName('');
    setIssued(null);
    setError(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createApiTokenAction(name);
      if (result.error || !result.token) {
        setError(result.error ?? '発行に失敗しました');
        return;
      }
      setIssued({ name: result.name!, token: result.token });
    });
  };

  const handleCopy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
      toast.success('クリップボードにコピーしました');
      setTimeout(() => setCopied(false), 2000);
    } catch (_e) {
      toast.error('コピーに失敗しました');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>新規発行</Button>
      </DialogTrigger>
      <DialogContent>
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>トークンを発行しました</DialogTitle>
              <DialogDescription>
                このトークンは<strong>一度だけ</strong>表示されます。
                いますぐコピーして安全な場所に保管してください。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>名前</Label>
              <Input value={issued.name} readOnly />
            </div>
            <div className="space-y-2">
              <Label>トークン</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={issued.token}
                  readOnly
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="コピー"
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>閉じる</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>新規 API トークンを発行</DialogTitle>
              <DialogDescription>
                識別用の名前を入力してください(例: ab-system production)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="token-name">名前</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ab-system production"
                disabled={isPending}
                autoFocus
                maxLength={80}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
                {isPending ? '発行中...' : '発行'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 行アイテム
// ============================================================

function TokenRowItem({ token }: { token: TokenRow }) {
  const [isPending, startTransition] = useTransition();

  const onToggleActive = () => {
    startTransition(async () => {
      try {
        if (token.active) {
          await deactivateApiTokenAction(token.id);
          toast.success('トークンを無効化しました');
        } else {
          await activateApiTokenAction(token.id);
          toast.success('トークンを有効化しました');
        }
      } catch (_e) {
        toast.error('更新に失敗しました');
      }
    });
  };

  const onDelete = () => {
    if (!confirm(`「${token.name}」を削除します。よろしいですか?`)) return;
    startTransition(async () => {
      try {
        await deleteApiTokenAction(token.id);
        toast.success('トークンを削除しました');
      } catch (_e) {
        toast.error('削除に失敗しました');
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{token.name}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(token.createdAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(token.lastUsedAt)}
      </TableCell>
      <TableCell>
        {token.active ? (
          <Badge variant="default">有効</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            無効
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleActive}
            disabled={isPending}
          >
            {token.active ? '無効化' : '有効化'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isPending}
          >
            削除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
