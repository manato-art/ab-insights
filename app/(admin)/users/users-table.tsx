'use client';

// ユーザー管理テーブル + 詳細 Dialog + 上限編集フォーム
// - server から rows + details を受け取り、 行クリックで Dialog を開く
// - 編集フォームは saveUserProfileAction 経由で UserProfile を upsert

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatJstShortDateTime } from '@/lib/format';
import { endpointLabel } from '../dashboard-types';
import type { UserListRow, UserDetail } from './types';
import { saveUserProfileAction } from './actions';

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function formatPctOrDash(ratio: number | null): string {
  if (ratio == null) return '—';
  return `${(ratio * 100).toFixed(0)}%`;
}

type Tier = UserListRow['tier'];

function tierColor(tier: Tier): string {
  switch (tier) {
    case 'over':
      return 'bg-red-500';
    case 'danger':
      return 'bg-orange-500';
    case 'warn':
      return 'bg-amber-400';
    case 'ok':
      return 'bg-emerald-500';
    default:
      return 'bg-muted-foreground/40';
  }
}

function tierBadge(tier: Tier, ratio: number | null) {
  if (tier === 'over') {
    return (
      <Badge variant="destructive" className="text-[10px]">
        上限超過
      </Badge>
    );
  }
  if (tier === 'danger') {
    return (
      <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-[10px]">
        {formatPctOrDash(ratio)} 到達
      </Badge>
    );
  }
  if (tier === 'warn') {
    return (
      <Badge className="bg-amber-400 hover:bg-amber-400 text-black text-[10px]">
        {formatPctOrDash(ratio)} 到達
      </Badge>
    );
  }
  if (tier === 'ok') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        {formatPctOrDash(ratio)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      上限未設定
    </Badge>
  );
}

function ProgressBar({
  ratio,
  tier,
}: {
  ratio: number | null;
  tier: Tier;
}) {
  if (ratio == null) {
    return (
      <div className="h-2 rounded bg-muted/60 w-full" aria-label="上限未設定" />
    );
  }
  const pctW = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="h-2 rounded bg-muted/60 w-full overflow-hidden">
      <div
        className={`h-full ${tierColor(tier)} transition-[width]`}
        style={{ width: `${pctW}%` }}
      />
    </div>
  );
}

export function UsersTable({
  rows,
  details,
  monthLabel,
  defaultQuota,
}: {
  rows: UserListRow[];
  details: Record<string, UserDetail>;
  monthLabel: string;
  defaultQuota: number | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? details[activeId] ?? null : null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ユーザー</TableHead>
            <TableHead className="text-right">{monthLabel} 使用</TableHead>
            <TableHead className="text-right">上限</TableHead>
            <TableHead className="text-right">残枚数</TableHead>
            <TableHead className="w-[160px]">残率</TableHead>
            <TableHead className="text-right">全期間 画像</TableHead>
            <TableHead className="text-right">DL率</TableHead>
            <TableHead>状態</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow
              key={u.abSystemUserId}
              onClick={() => setActiveId(u.abSystemUserId)}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <TableCell>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    {u.resolvedName ?? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {u.abSystemUserId}
                      </span>
                    )}
                  </span>
                  {u.resolvedName && (
                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                      {u.abSystemUserId}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {u.monthImages.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {u.effectiveQuota == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span>
                    {u.effectiveQuota.toLocaleString()}
                    {!u.isOverride && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        (既定)
                      </span>
                    )}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {u.remaining == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  u.remaining.toLocaleString()
                )}
              </TableCell>
              <TableCell>
                <ProgressBar ratio={u.ratio} tier={u.tier} />
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {u.totalImages.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {pct(u.downloaded, u.totalEvents)}
              </TableCell>
              <TableCell>{tierBadge(u.tier, u.ratio)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={active != null} onOpenChange={(o) => !o && setActiveId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {active && (
            <UserDetailView
              user={active}
              monthLabel={monthLabel}
              defaultQuota={defaultQuota}
              onSaved={() => setActiveId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserDetailView({
  user,
  monthLabel,
  defaultQuota,
  onSaved,
}: {
  user: UserDetail;
  monthLabel: string;
  defaultQuota: number | null;
  onSaved: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {user.resolvedName ?? user.abSystemUserId}
        </DialogTitle>
        <DialogDescription>
          {user.resolvedName && (
            <span className="font-mono text-xs">{user.abSystemUserId}</span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* 当月の使用状況 */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {monthLabel} の使用状況
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="使用枚数" value={user.monthImages.toLocaleString()} accent />
            <Stat
              label="上限"
              value={
                user.effectiveQuota == null
                  ? '—'
                  : `${user.effectiveQuota.toLocaleString()}${
                      user.isOverride ? '' : ' (既定)'
                    }`
              }
            />
            <Stat
              label="残枚数"
              value={
                user.remaining == null
                  ? '—'
                  : user.remaining.toLocaleString()
              }
            />
          </div>
          <div className="mt-3">
            <ProgressBar ratio={user.ratio} tier={user.tier} />
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums mt-1">
              <span>{tierBadge(user.tier, user.ratio)}</span>
              <span>{user.monthEvents.toLocaleString()} 工程</span>
            </div>
          </div>
        </section>

        {/* サマリー (全期間) */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            全期間サマリー
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="工程数" value={user.totalEvents.toLocaleString()} />
            <Stat label="画像枚数" value={user.totalImages.toLocaleString()} accent />
            <Stat label="DL率" value={pct(user.downloaded, user.totalEvents)} />
          </div>
        </section>

        {/* 期間指定エクスポート */}
        <ExportSection userId={user.abSystemUserId} />

        {/* 月別履歴 */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            月別履歴 (直近)
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>月</TableHead>
                <TableHead className="text-right">工程数</TableHead>
                <TableHead className="text-right">画像枚数</TableHead>
                <TableHead className="text-right">DL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.monthlyHistory.map((m) => (
                <TableRow key={m.ymKey}>
                  <TableCell className="font-mono text-xs">{m.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.total.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {m.images.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.downloaded.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* 作業内訳 */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            作業内訳 (エンドポイント別 / 全期間)
          </h3>
          {user.endpointBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">(データなし)</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>種別</TableHead>
                  <TableHead className="text-right">工程数</TableHead>
                  <TableHead className="text-right">画像枚数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.endpointBreakdown.map((b) => (
                  <TableRow key={b.endpoint}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{endpointLabel(b.endpoint)}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {b.endpoint}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {b.images.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* 直近工程 */}
        <section>
          <div className="flex items-end justify-between mb-2 gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              直近の工程 (最新 10 件)
            </h3>
            <Button variant="outline" size="xs" asChild>
              <Link
                href={`/events?userId=${encodeURIComponent(user.abSystemUserId)}`}
              >
                全工程を見る →
              </Link>
            </Button>
          </div>
          {user.recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">(データなし)</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead>ジャンル</TableHead>
                  <TableHead className="text-right">枚数</TableHead>
                  <TableHead className="text-right">DL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.recentEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {formatJstShortDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {endpointLabel(e.endpoint)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.genre ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {e.imageCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.downloaded ? (
                        <Badge variant="default" className="text-[10px]">
                          DL済
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* 編集フォーム */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            プロフィール / 月上限
          </h3>
          <ProfileForm
            user={user}
            defaultQuota={defaultQuota}
            onSaved={onSaved}
          />
        </section>
      </div>
    </>
  );
}

function ProfileForm({
  user,
  defaultQuota,
  onSaved,
}: {
  user: UserDetail;
  defaultQuota: number | null;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.rawDisplayName ?? '');
  const [quota, setQuota] = useState<string>(
    user.monthlyImageQuota == null ? '' : String(user.monthlyImageQuota),
  );
  const [note, setNote] = useState(user.note ?? '');
  const [pending, startTransition] = useTransition();

  const dirty =
    (displayName.trim() || null) !== (user.rawDisplayName ?? null) ||
    (quota.trim() === ''
      ? user.monthlyImageQuota != null
      : Number(quota) !== user.monthlyImageQuota) ||
    (note.trim() || null) !== (user.note ?? null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const quotaTrimmed = quota.trim();
    let quotaNum: number | null = null;
    if (quotaTrimmed !== '') {
      const n = Number(quotaTrimmed);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        toast.error('月上限は 0 以上の整数で指定してください');
        return;
      }
      quotaNum = n;
    }

    startTransition(async () => {
      const res = await saveUserProfileAction({
        abSystemUserId: user.abSystemUserId,
        displayName: displayName.trim() || null,
        monthlyImageQuota: quotaNum,
        note: note.trim() || null,
      });
      if (res.ok) {
        toast.success('保存しました');
        onSaved();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`displayName-${user.abSystemUserId}`} className="text-xs">
            表示名 (空欄で ab-system の名前を使用)
          </Label>
          <Input
            id={`displayName-${user.abSystemUserId}`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.abSystemUserName ?? '(未設定)'}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`quota-${user.abSystemUserId}`} className="text-xs">
            月画像上限 (空欄で既定値: {defaultQuota == null ? '上限なし' : defaultQuota.toLocaleString()})
          </Label>
          <Input
            id={`quota-${user.abSystemUserId}`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            placeholder={defaultQuota == null ? '上限なし' : String(defaultQuota)}
            className="h-9"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`note-${user.abSystemUserId}`} className="text-xs">
          メモ (任意)
        </Label>
        <Textarea
          id={`note-${user.abSystemUserId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="例: 部署、契約プラン等。ab-system には共有されません"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}

function ExportSection({ userId }: { userId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildHref = (base: string): string => {
    const p = new URLSearchParams();
    p.set('userId', userId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return `${base}?${p.toString()}`;
  };

  const csvHref = buildHref('/api/export/events.csv');
  const printHref = buildHref('/events/print');
  const hasRange = from !== '' || to !== '';
  // to >= from バリデーション (どちらも入っているときだけ判定)
  const invalidRange = from !== '' && to !== '' && to < from;

  return (
    <section>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        期間指定エクスポート
      </h3>
      <div className="rounded-md ring-1 ring-border p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label htmlFor={`exp-from-${userId}`} className="text-[11px]">
              開始日 (JST)
            </Label>
            <Input
              id={`exp-from-${userId}`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-to-${userId}`} className="text-[11px]">
              終了日 (JST, この日を含む)
            </Label>
            <Input
              id={`exp-to-${userId}`}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
              className="h-9"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            disabled={!hasRange}
          >
            クリア
          </Button>
        </div>

        {invalidRange && (
          <p className="text-xs text-destructive">
            終了日は開始日以降の日付を指定してください
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild disabled={invalidRange}>
            <a
              href={csvHref}
              download
              onClick={(e) => {
                if (invalidRange) e.preventDefault();
              }}
            >
              CSV ダウンロード
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild disabled={invalidRange}>
            <Link
              href={printHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (invalidRange) e.preventDefault();
              }}
            >
              印刷 / PDF 保存
            </Link>
          </Button>
          <span className="text-[11px] text-muted-foreground self-center ml-auto">
            {hasRange ? '指定範囲のみ出力' : '期間未指定 = 全期間を出力'}
          </span>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md ring-1 ring-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-xl tabular-nums pt-1 ${
          accent ? 'font-bold' : 'font-semibold'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
