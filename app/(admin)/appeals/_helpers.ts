// 訴求ポイント統計 / AI 修正指示で共有する型・ユーティリティ
// (`_` プレフィックスの付いたファイルは Next.js のルーティング対象外)

export type AiEditItem = {
  kind?: string | null;
  text?: string | null;
};

export type AiEditKindRow = {
  kind: string;
  count: number;
};

export type AiEditInstructionRow = {
  kind: string;
  text: string;
  count: number;
};

export function parseAiEditJson(json: string | null): AiEditItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** AI 修正の kind を日本語に */
export function kindLabel(kind: string): string {
  const m: Record<string, string> = {
    background: '背景',
    text: 'テキスト',
    text_color: 'テキスト色',
    text_content: 'テキスト文言',
    text_size: 'テキストサイズ',
    person: '人物',
    color: '色',
    product_swap: '商品差し替え',
    remove: '削除',
  };
  return m[kind] ?? kind;
}
