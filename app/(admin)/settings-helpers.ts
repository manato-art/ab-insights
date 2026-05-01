// ダッシュボード・設定ページで共有する read-only ヘルパー
// ※ 'use server' ファイルではないので、普通の server-side module として扱える
// ab-system 側でも GET /api 経由で同じ値を参照する想定 (後続タスク)

import { prisma } from '@/lib/db';
import { resolveTheme, type ThemePreset } from '@/lib/theme';

export const LEARNING_KEY = 'learning_enabled';
export const THEME_COLOR_KEY = 'theme_color';

/** 学習収集フラグの現在値を取得。未設定時はデフォルト true (収集 ON) */
export async function getLearningEnabled(): Promise<boolean> {
  const s = await prisma.setting.findUnique({ where: { key: LEARNING_KEY } });
  if (!s) return true;
  return s.value === 'true' || s.value === '1';
}

/** 現在のテーマカラー preset を返す。未設定時は orange (既定)。 */
export async function getThemeColor(): Promise<ThemePreset> {
  const s = await prisma.setting.findUnique({ where: { key: THEME_COLOR_KEY } });
  return resolveTheme(s?.value ?? null);
}
