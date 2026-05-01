// /design 比較ビュー用のサンプルデータ。実 DB は引かない。

export type { DailyPoint } from '@/components/charts';
import type { DailyPoint } from '@/components/charts';
export type GenreRow = { name: string; events: number; images: number; dlRate: number; hit: number | null };
export type EndpointRow = { code: string; label: string; events: number; images: number };
export type UserRow = { name: string; id: string; events: number; images: number; dlRate: number; mtd: number; quota: number | null };

export const daily: DailyPoint[] = [
  { date: '04-18', events: 12, images: 71, downloads: 3 },
  { date: '04-19', events: 4, images: 14, downloads: 1 },
  { date: '04-20', events: 9, images: 41, downloads: 2 },
  { date: '04-21', events: 11, images: 60, downloads: 1 },
  { date: '04-22', events: 6, images: 22, downloads: 0 },
  { date: '04-23', events: 14, images: 88, downloads: 4 },
  { date: '04-24', events: 16, images: 94, downloads: 3 },
  { date: '04-25', events: 8, images: 43, downloads: 4 },
  { date: '04-26', events: 8, images: 27, downloads: 1 },
  { date: '04-27', events: 6, images: 35, downloads: 2 },
  { date: '04-28', events: 3, images: 8, downloads: 1 },
  { date: '04-29', events: 0, images: 0, downloads: 0 },
  { date: '04-30', events: 0, images: 0, downloads: 0 },
  { date: '05-01', events: 39, images: 56, downloads: 1 },
];

export const endpoints: EndpointRow[] = [
  { code: 'generate-images', label: '新規生成', events: 41, images: 224 },
  { code: 'edit-region', label: 'AI 部分修正', events: 39, images: 39 },
];

export const genres: GenreRow[] = [
  { name: '精力剤', events: 37, images: 203, dlRate: 0.297, hit: 0.51 },
  { name: '未分類', events: 36, images: 36, dlRate: 0.0, hit: null },
  { name: 'テストジャンル', events: 7, images: 24, dlRate: 0.143, hit: 0.32 },
];

export const users: UserRow[] = [
  {
    name: 'manato.591324',
    id: 'u_1776915551608_gjkufp',
    events: 76,
    images: 255,
    dlRate: 0.158,
    mtd: 56,
    quota: 1000,
  },
  {
    name: 'archive-test',
    id: 'test_user_archive',
    events: 4,
    images: 8,
    dlRate: 0.0,
    mtd: 0,
    quota: 1000,
  },
];

export const totals = {
  imagesAll: 263,
  eventsAll: 80,
  imagesRange: 263,
  eventsRange: 80,
  dlRate: 0.15,
  downloadCount: 12,
};
