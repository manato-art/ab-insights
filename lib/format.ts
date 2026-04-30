// 日時フォーマッタ (JST 強制)
//
// Vercel 本番は UTC 稼働 / 管理者は日本のため、表示は常に Asia/Tokyo に固定する。
// Server Component / Client Component / Server Action から共通で呼べるよう純関数。
//
// `Intl.DateTimeFormat` に `timeZone: 'Asia/Tokyo'` を渡すことで実行環境に依らず JST 表示。
// (`getHours()` 等の Date メソッドはローカル TZ 依存なので使わない)

export const JST_TIMEZONE = 'Asia/Tokyo';

const FORMATTER_DATE = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATTER_DATE_TIME = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const FORMATTER_DATE_TIME_SEC = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const FORMATTER_SHORT_DT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST_TIMEZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY/MM/DD HH:mm (JST) */
export function formatJstDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return FORMATTER_DATE_TIME.format(d);
}

/** YYYY/MM/DD HH:mm:ss (JST) */
export function formatJstDateTimeSec(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return FORMATTER_DATE_TIME_SEC.format(d);
}

/** YYYY/MM/DD (JST) */
export function formatJstDate(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return FORMATTER_DATE.format(d);
}

/** MM/DD HH:mm (JST) — テーブル等の省スペース用 */
export function formatJstShortDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return FORMATTER_SHORT_DT.format(d);
}

/** YYYY-MM-DD (JST) — `<input type="date">` の value 用 */
export function jstDateInputValue(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return '';
  // ja-JP の '2-digit' は 2-digit になるが ISO の YYYY-MM-DD が欲しいので en-CA を使う
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
