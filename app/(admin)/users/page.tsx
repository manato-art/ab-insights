// ユーザー管理ページ (Server Component)
// - グローバルデフォルト上限カード
// - ユーザー一覧テーブル: 当月使用 / 上限 / 残枚数 / 残率バー / 全期間総枚数 / DL率
// - 行クリックで詳細 Dialog (内訳・直近・月別履歴・上限編集)
//
// 注意: ab-system は一切呼ばない。すべて ab-insights の Neon DB だけで完結。

import { prisma } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  combinedCount,
  combinedUserGroups,
  combinedLatestUserName,
  combinedFindManyLite,
  combinedEndpointGroups,
  combinedFindForDailyBreakdown,
} from '@/lib/event-source';
import {
  jstMonthRange,
  jstMonthRangeOffset,
  getDefaultMonthlyImageQuota,
  resolveQuota,
  computeQuotaStatus,
} from './helpers';
import { UsersTable } from './users-table';
import { DefaultQuotaForm } from './default-quota-form';
import type {
  UserListRow,
  UserDetail,
  MonthlyHistoryRow,
} from './types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ユーザー管理 — ab-insights' };

const HISTORY_MONTHS = 6;

async function loadUsers(): Promise<{
  rows: UserListRow[];
  details: Record<string, UserDetail>;
  monthLabel: string;
  defaultQuota: number | null;
}> {
  const currentMonth = jstMonthRange();
  const monthWhere = { createdAt: { gte: currentMonth.start, lt: currentMonth.next } };

  const [allGroups, monthGroups, defaultQuota, profiles] = await Promise.all([
    combinedUserGroups({}),
    combinedUserGroups(monthWhere),
    getDefaultMonthlyImageQuota(),
    prisma.userProfile.findMany(),
  ]);

  // 過去にイベント無く UserProfile だけ存在するユーザーも一覧に出す
  const idSet = new Set<string>([
    ...allGroups.map((g) => g.abSystemUserId),
    ...monthGroups.map((g) => g.abSystemUserId),
    ...profiles.map((p) => p.abSystemUserId),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.abSystemUserId, p]));
  const allMap = new Map(allGroups.map((g) => [g.abSystemUserId, g]));
  const monthMap = new Map(monthGroups.map((g) => [g.abSystemUserId, g]));

  const ids = Array.from(idSet);

  // ユーザーごとの詳細クエリを並列実行 (件数 = 登録ユーザー数)
  const detailFetches = await Promise.all(
    ids.map(async (id) => {
      const w = { abSystemUserId: id };
      const [downloaded, latestName, byEndpoint, recentLite] = await Promise.all([
        combinedCount({ ...w, downloaded: true }),
        combinedLatestUserName(id),
        combinedEndpointGroups(w),
        combinedFindManyLite({ where: w, skip: 0, take: 10 }),
      ]);
      // 月別履歴 (直近 HISTORY_MONTHS ヶ月)
      const monthEvents = await combinedFindForDailyBreakdown({
        ...w,
        createdAt: {
          gte: jstMonthRangeOffset(HISTORY_MONTHS - 1).start,
          lt: jstMonthRangeOffset(0).next,
        },
      });
      // YYYY-MM (JST) で集計
      const histMap = new Map<string, MonthlyHistoryRow>();
      for (let i = 0; i < HISTORY_MONTHS; i++) {
        const m = jstMonthRangeOffset(i);
        histMap.set(m.ymKey, {
          ymKey: m.ymKey,
          label: m.label,
          total: 0,
          images: 0,
          downloaded: 0,
        });
      }
      for (const ev of monthEvents) {
        const k = ymKeyJst(ev.createdAt);
        const cur = histMap.get(k);
        if (!cur) continue;
        cur.total++;
        cur.images += ev.imageCount;
        if (ev.downloaded) cur.downloaded++;
      }
      const monthlyHistory = Array.from(histMap.values()).sort((a, b) =>
        a.ymKey < b.ymKey ? 1 : -1,
      );

      // 月画像枚数(MonthRange 範囲内に絞った monthEvents から計算)
      let monthImages = 0;
      let monthEventsCount = 0;
      for (const ev of monthEvents) {
        if (ev.createdAt >= currentMonth.start && ev.createdAt < currentMonth.next) {
          monthEventsCount++;
          monthImages += ev.imageCount;
        }
      }

      return {
        id,
        downloaded,
        latestName,
        byEndpoint,
        recentLite,
        monthImages,
        monthEventsCount,
        monthlyHistory,
      };
    }),
  );

  const rows: UserListRow[] = [];
  const details: Record<string, UserDetail> = {};

  for (const f of detailFetches) {
    const profile = profileMap.get(f.id);
    const all = allMap.get(f.id);
    const monthAgg = monthMap.get(f.id);

    const totalEvents = all?.total ?? 0;
    const totalImages = all?.images ?? 0;
    const monthEvents = monthAgg?.total ?? f.monthEventsCount;
    const monthImages = monthAgg?.images ?? f.monthImages;

    const resolved = resolveQuota(profile?.monthlyImageQuota ?? null, defaultQuota);
    const status = computeQuotaStatus(monthImages, resolved);

    const resolvedName = profile?.displayName ?? f.latestName ?? null;

    const row: UserListRow = {
      abSystemUserId: f.id,
      resolvedName,
      rawDisplayName: profile?.displayName ?? null,
      abSystemUserName: f.latestName,
      totalEvents,
      totalImages,
      downloaded: f.downloaded,
      monthImages,
      monthEvents,
      monthlyImageQuota: profile?.monthlyImageQuota ?? null,
      effectiveQuota: status.effective,
      isOverride: status.isOverride,
      remaining: status.remaining,
      ratio: status.ratio,
      tier: status.tier,
      note: profile?.note ?? null,
    };

    rows.push(row);

    details[f.id] = {
      ...row,
      endpointBreakdown: f.byEndpoint,
      recentEvents: f.recentLite.map((r) => ({
        id: r.displayId,
        endpoint: r.endpoint,
        genre: r.genre,
        imageCount: r.imageCount,
        downloaded: r.downloaded,
        createdAt: r.createdAt.toISOString(),
      })),
      monthlyHistory: f.monthlyHistory,
    };
  }

  // 並び順: 当月画像が多い順 → 全期間画像が多い順
  rows.sort((a, b) => {
    if (b.monthImages !== a.monthImages) return b.monthImages - a.monthImages;
    return b.totalImages - a.totalImages;
  });

  return { rows, details, monthLabel: currentMonth.label, defaultQuota };
}

const YM_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
});

function ymKeyJst(d: Date): string {
  // en-CA は YYYY-MM-DD を返すが month/year だけ指定すると YYYY-MM
  return YM_FORMATTER.format(d);
}

export default async function UsersPage() {
  const { rows, details, monthLabel, defaultQuota } = await loadUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ユーザー管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ab-system 登録ユーザーごとの作業内容と {monthLabel} の使用枚数 / 上限 (JST)。
          上限はこの画面でだけ管理され、ab-system 側には共有されません。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">グローバルデフォルト上限</CardTitle>
          <CardDescription>
            個別設定が無いユーザーに適用される月画像上限。空欄 = 上限なし。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DefaultQuotaForm initial={defaultQuota} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー一覧</CardTitle>
          <CardDescription>
            行をクリックすると詳細 (内訳・直近工程・月別履歴・上限編集)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              ユーザーデータがまだありません
            </div>
          ) : (
            <UsersTable
              rows={rows}
              details={details}
              monthLabel={monthLabel}
              defaultQuota={defaultQuota}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
