// /users 関連の型 (server / client 両方から参照されるので server-only に依存しない)

import type { UserEndpointBreakdown, UserRecentEvent } from '../dashboard-types';

export type MonthlyHistoryRow = {
  ymKey: string; // YYYY-MM (JST)
  label: string; // "2026年5月"
  total: number; // 工程数
  images: number; // 画像枚数
  downloaded: number;
};

export type UserListRow = {
  abSystemUserId: string;
  /** UserProfile.displayName を最優先、無ければ最新 Event の abSystemUserName */
  resolvedName: string | null;
  rawDisplayName: string | null; // UserProfile.displayName の生値 (編集用)
  abSystemUserName: string | null; // Event 由来 (フォールバック表示用)

  // 全期間
  totalEvents: number;
  totalImages: number;
  downloaded: number;

  // 当月
  monthImages: number;
  monthEvents: number;

  // 上限
  monthlyImageQuota: number | null; // UserProfile.monthlyImageQuota 生値
  effectiveQuota: number | null;    // null = 上限なし
  isOverride: boolean;
  remaining: number | null;
  ratio: number | null;
  tier: 'none' | 'ok' | 'warn' | 'danger' | 'over';

  note: string | null;
};

export type UserDetail = UserListRow & {
  endpointBreakdown: UserEndpointBreakdown[];
  recentEvents: UserRecentEvent[];
  monthlyHistory: MonthlyHistoryRow[];
};
