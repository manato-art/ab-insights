'use client';

// 管理者パスワード管理 UI
// - 一覧 (ラベル / 状態 / 最終ログイン)
// - 新規発行 Dialog (ラベル + パスワード + 確認)
// - 自分の行は「(自分)」バッジを表示、無効化/削除はガード
// - 別タブで自分のパスワード変更 (PasswordChangeForm)

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
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
import { formatJstDateTime } from '@/lib/format';
import {
  createAdminPasswordAction,
  setAdminActiveAction,
  deleteAdminPasswordAction,
  renameAdminAction,
} from './actions';

export type AdminRow = {
  id: number;
  name: string;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

type Props = {
  admins: AdminRow[];
  /** ログイン中のセッションが紐づく adminId (legacy セッションは null) */
  currentAdminId: number | null;
};

export default function AdminManager({ admins, currentAdminId }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          管理画面にログインできるパスワードを複数発行できます。
          各行は独立で、ラベルで識別 (例: 「manato」「共有」)。
          ログイン画面はパスワードのみで、 一致した行で認証されます。
        </p>
        <CreateAdminDialog />
      </div>

      {admins.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          管理者パスワードはまだありません
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ラベル</TableHead>
                <TableHead>発行日</TableHead>
                <TableHead>最終ログイン</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((a) => (
                <AdminRowItem
                  key={a.id}
                  admin={a}
                  isSelf={a.id === currentAdminId}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 行 (ラベル編集 + 有効/無効 + 削除)
// ============================================================

function AdminRowItem({ admin, isSelf }: { admin: AdminRow; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleActive() {
    startTransition(async () => {
      const res = await setAdminActiveAction(admin.id, !admin.active);
      if (res.ok) {
        toast.success(admin.active ? '無効化しました' : '有効化しました');
      } else {
        toast.error(res.error ?? '操作に失敗しました');
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      const res = await deleteAdminPasswordAction(admin.id);
      if (res.ok) {
        toast.success('削除しました');
        setConfirmDelete(false);
      } else {
        toast.error(res.error ?? '削除に失敗しました');
      }
    });
  }

  return (
    <TableRow className={!admin.active ? 'opacity-60' : undefined}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{admin.name}</span>
          {isSelf && (
            <Badge variant="outline" className="text-[10px]">
              自分
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatJstDateTime(admin.createdAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {admin.lastLoginAt ? formatJstDateTime(admin.lastLoginAt) : '—'}
      </TableCell>
      <TableCell>
        {admin.active ? (
          <Badge variant="secondary" className="text-[10px]">
            有効
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            無効
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <RenameDialog
            admin={admin}
            open={renameOpen}
            onOpenChange={setRenameOpen}
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={toggleActive}
            disabled={pending || (isSelf && admin.active)}
            title={isSelf && admin.active ? '自分自身は無効化できません' : ''}
          >
            {admin.active ? '無効化' : '有効化'}
          </Button>
          <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={pending || isSelf}
                title={isSelf ? '自分自身は削除できません' : ''}
                className={!isSelf ? 'text-destructive hover:text-destructive' : ''}
              >
                削除
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>パスワードを削除</DialogTitle>
                <DialogDescription>
                  「{admin.name}」のパスワードを完全に削除します。 関連セッションも切断されます。 この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                >
                  キャンセル
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={doDelete}
                  disabled={pending}
                >
                  {pending ? '削除中…' : '削除する'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RenameDialog({
  admin,
  open,
  onOpenChange,
  disabled,
}: {
  admin: AdminRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState(admin.name);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await renameAdminAction(admin.id, name);
      if (res.ok) {
        toast.success('ラベルを更新しました');
        onOpenChange(false);
      } else {
        toast.error(res.error ?? '更新に失敗しました');
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setName(admin.name);
        onOpenChange(o);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="xs" disabled={disabled}>
          ラベル
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>ラベルを変更</DialogTitle>
          <DialogDescription>
            この管理者を識別する表示名 (60 文字以内)。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`rename-${admin.id}`} className="text-xs">
            ラベル
          </Label>
          <Input
            id={`rename-${admin.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending || !name.trim() || name.trim() === admin.name}
          >
            {pending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 新規発行ダイアログ
// ============================================================

function CreateAdminDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setPw('');
    setPwConfirm('');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAdminPasswordAction(name, pw, pwConfirm);
      if (res.ok) {
        toast.success(`「${name.trim()}」を発行しました`);
        reset();
        setOpen(false);
      } else {
        toast.error(res.error ?? '発行に失敗しました');
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          新規発行
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>管理者パスワードを発行</DialogTitle>
            <DialogDescription>
              ラベルとパスワードのペアを 1 件追加します。 ログイン画面はパスワードのみ — ラベルは管理用の識別名です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-admin-name" className="text-xs">
                ラベル (例: manato / 共有)
              </Label>
              <Input
                id="new-admin-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="manato"
                disabled={pending}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-admin-pw" className="text-xs">
                パスワード (8 文字以上)
              </Label>
              <Input
                id="new-admin-pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-admin-pw-confirm" className="text-xs">
                パスワード (確認)
              </Label>
              <Input
                id="new-admin-pw-confirm"
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                disabled={pending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !name.trim() || pw.length < 8 || pw !== pwConfirm}
            >
              {pending ? '発行中…' : '発行'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
