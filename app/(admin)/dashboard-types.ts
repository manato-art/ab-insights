// ダッシュボード関連の型と純関数。
// page.tsx (server) と user-stats-table.tsx (client) の両方から参照されるので、
// server-only な依存 (prisma 等) は持たないこと。

export type EndpointRow = {
  endpoint: string;
  total: number; // 工程数
  images: number; // 画像枚数
};

export type UserEndpointBreakdown = {
  endpoint: string;
  total: number;
  images: number;
};

export type UserRecentEvent = {
  id: number;
  endpoint: string;
  genre: string | null;
  imageCount: number;
  downloaded: boolean;
  createdAt: string; // ISO
};

export type UserRow = {
  abSystemUserId: string;
  abSystemUserName: string | null;
  total: number; // 工程数
  images: number; // 画像枚数
  downloaded: number; // DL 工程数
  endpointBreakdown: UserEndpointBreakdown[];
  recentEvents: UserRecentEvent[];
};

export function endpointLabel(endpoint: string): string {
  const m: Record<string, string> = {
    'generate-images': '新規生成',
    'generate-similar-one': '横展開',
    'improve-images': '改善 (AI修正)',
    'edit-region': 'AI 部分修正',
  };
  return m[endpoint] ?? endpoint;
}
