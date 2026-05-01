// テーマカラー定義。ID → CSS 変数値マッピング。
// Setting テーブル (key='theme_color') に id を保存し、admin layout で
// <style> 経由で :root の --brand-orange / --brand-orange-soft / --accent /
// --accent-foreground を上書きする。他の派生変数 (--primary, --ring, --chart-*,
// --sidebar-primary, --sidebar-ring) は CSS 内で上記を参照しているので自動連動。

export type ThemeColorId =
  | 'orange'
  | 'coral'
  | 'emerald'
  | 'teal'
  | 'indigo'
  | 'violet'
  | 'slate';

export type ThemePreset = {
  id: ThemeColorId;
  /** 設定画面に出すラベル */
  label: string;
  /** 主役色 (oklch) — `--brand-orange` を上書き */
  brand: string;
  /** 主役色の淡い派生 — `--brand-orange-soft` を上書き */
  brandSoft: string;
  /** UI コンポーネントの accent — `--accent` を上書き */
  accent: string;
  /** accent の前景色 — `--accent-foreground` を上書き */
  accentForeground: string;
  /** 設定画面のスウォッチ表示用 (CSS color string) */
  swatch: string;
};

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'orange',
    label: 'オレンジ (既定)',
    brand: 'oklch(0.66 0.16 50)',
    brandSoft: 'oklch(0.86 0.07 60)',
    accent: 'oklch(0.93 0.05 60)',
    accentForeground: 'oklch(0.32 0.1 50)',
    swatch: 'oklch(0.66 0.16 50)',
  },
  {
    id: 'coral',
    label: 'コーラル',
    brand: 'oklch(0.66 0.18 22)',
    brandSoft: 'oklch(0.86 0.07 25)',
    accent: 'oklch(0.93 0.05 25)',
    accentForeground: 'oklch(0.32 0.12 22)',
    swatch: 'oklch(0.66 0.18 22)',
  },
  {
    id: 'emerald',
    label: 'エメラルド',
    brand: 'oklch(0.6 0.13 155)',
    brandSoft: 'oklch(0.86 0.05 155)',
    accent: 'oklch(0.93 0.04 155)',
    accentForeground: 'oklch(0.3 0.08 155)',
    swatch: 'oklch(0.6 0.13 155)',
  },
  {
    id: 'teal',
    label: 'ティール',
    brand: 'oklch(0.6 0.1 200)',
    brandSoft: 'oklch(0.86 0.04 200)',
    accent: 'oklch(0.93 0.03 200)',
    accentForeground: 'oklch(0.3 0.07 200)',
    swatch: 'oklch(0.6 0.1 200)',
  },
  {
    id: 'indigo',
    label: 'インディゴ',
    brand: 'oklch(0.55 0.16 270)',
    brandSoft: 'oklch(0.86 0.06 270)',
    accent: 'oklch(0.93 0.04 270)',
    accentForeground: 'oklch(0.32 0.12 270)',
    swatch: 'oklch(0.55 0.16 270)',
  },
  {
    id: 'violet',
    label: 'バイオレット',
    brand: 'oklch(0.55 0.18 305)',
    brandSoft: 'oklch(0.86 0.06 305)',
    accent: 'oklch(0.93 0.04 305)',
    accentForeground: 'oklch(0.32 0.12 305)',
    swatch: 'oklch(0.55 0.18 305)',
  },
  {
    id: 'slate',
    label: 'スレート (モノクロ)',
    brand: 'oklch(0.45 0.02 280)',
    brandSoft: 'oklch(0.85 0.01 280)',
    accent: 'oklch(0.93 0.005 280)',
    accentForeground: 'oklch(0.3 0.02 280)',
    swatch: 'oklch(0.45 0.02 280)',
  },
];

const PRESET_BY_ID = new Map(THEME_PRESETS.map((p) => [p.id, p]));

export const DEFAULT_THEME_ID: ThemeColorId = 'orange';

export function resolveTheme(id: string | null | undefined): ThemePreset {
  if (!id) return PRESET_BY_ID.get(DEFAULT_THEME_ID)!;
  return PRESET_BY_ID.get(id as ThemeColorId) ?? PRESET_BY_ID.get(DEFAULT_THEME_ID)!;
}

export function isValidThemeId(id: string): id is ThemeColorId {
  return PRESET_BY_ID.has(id as ThemeColorId);
}

/** :root に適用する CSS テキストを生成 */
export function themeCssVars(t: ThemePreset): string {
  return `:root{--brand-orange:${t.brand};--brand-orange-soft:${t.brandSoft};--accent:${t.accent};--accent-foreground:${t.accentForeground};}`;
}
