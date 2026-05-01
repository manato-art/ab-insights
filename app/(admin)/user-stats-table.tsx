'use client';

// ユーザー別サマリー (client component)
// - テーブル: 名前 / 工程数 / 画像枚数 / DL 率
// - 行クリックで Dialog を開き、エンドポイント別内訳と直近工程を表示

import { useState } from 'react';
import Link from 'next/link';
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
import { formatJstShortDateTime } from '@/lib/format';
import { endpointLabel, type UserRow } from './dashboard-types';

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

export function UserStatsTable({ users }: { users: UserRow[] }) {
  const [active, setActive] = useState<UserRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ユーザー</TableHead>
            <TableHead className="text-right">工程数</TableHead>
            <TableHead className="text-right">画像枚数</TableHead>
            <TableHead className="text-right">DL率</TableHead>
            <TableHead className="text-right">画像/工程</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow
              key={u.abSystemUserId}
              onClick={() => setActive(u)}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <TableCell>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    {u.abSystemUserName ?? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {u.abSystemUserId}
                      </span>
                    )}
                  </span>
                  {u.abSystemUserName && (
                    <span className="text-[11px] text-muted-foreground font-mono truncate">
                      {u.abSystemUserId}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {u.total.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {u.images.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pct(u.downloaded, u.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {u.total === 0 ? '—' : (u.images / u.total).toFixed(1)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={active != null} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {active && <UserDetail user={active} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserDetail({ user }: { user: UserRow }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {user.abSystemUserName ?? user.abSystemUserId}
        </DialogTitle>
        <DialogDescription>
          {user.abSystemUserName && (
            <span className="font-mono text-xs">{user.abSystemUserId}</span>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {/* サマリー */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            サマリー
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="工程数" value={user.total.toLocaleString()} />
            <Stat
              label="画像枚数"
              value={user.images.toLocaleString()}
              accent
            />
            <Stat label="DL率" value={pct(user.downloaded, user.total)} />
          </div>
        </section>

        {/* 作業内訳 */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            作業内訳 (エンドポイント別)
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
                        <span className="text-sm">
                          {endpointLabel(b.endpoint)}
                        </span>
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
                      {e.genre ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
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
      </div>
    </>
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
