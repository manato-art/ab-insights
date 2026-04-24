// 3 ブロック自動生成システム用の型定義
// ab-insights が新規に Event を集計 → AI で 3 種のプロンプトブロックへ変換する際に共通で使う。

export type PromptBlockKind = 'success-image' | 'copy' | 'appeal-sub';

export const BLOCK_NAME_BY_KIND: Record<PromptBlockKind, string> = {
  'success-image': '【成功画像傾向】',
  'copy': '【刺さるコピー傾向】',
  'appeal-sub': '【訴求サブ選好】',
};

export const BLOCK_PRIORITY_BY_KIND: Record<PromptBlockKind, number> = {
  'success-image': 101,
  'copy': 102,
  'appeal-sub': 103,
};

/**
 * ジャンル横断の事前集計結果。
 * 3 ブロック全てが 1 回の集計で必要な情報を取れるよう、全部まとめて持つ。
 */
export type GenreSignals = {
  genre: string;
  eventCount: number;
  downloadedCount: number;
  expandedCount: number;
  aiEditedCount: number;
  avgHitScore: number | null;

  /** DL された画像のサムネ(hit_score 降順・最大 N 枚)— 成功画像ブロック用 */
  savedImages: Array<{
    dataUrl: string; // data:image/webp;base64,...
    hitScore: number | null;
    appealType: string | null;
    appealText: string | null;
  }>;

  /**
   * 刺さりシグナル(DL / 横展開)を持つ Event の appealText 傾向 — コピー傾向ブロック用
   * text: ユーザー確定文(末尾の【使用キーワード】は除去済み)
   * weight: hit_score を 0-1 の重みとして使用
   */
  hitCopies: Array<{ text: string; weight: number; appealType: string | null }>;

  /**
   * 頻出ワード(コピー統計のヒント) — 2-6 文字の日本語連続シーケンスを簡易抽出
   */
  topKeywords: Array<{ word: string; count: number }>;

  /**
   * サブラベル別 DL 率(/appeals 統計から) — 訴求サブ選好ブロック用
   */
  subLabelStats: Array<{
    subLabel: string;
    count: number;
    downloaded: number;
    avgHitScore: number | null;
  }>;

  /**
   * 書き換え top (AI 原文 → 確定文) — 訴求サブ選好ブロック用(ユーザーが好むトーン例)
   */
  topRewrites: Array<{
    originalText: string;
    rewrittenText: string;
    count: number;
    downloaded: number;
  }>;

  generatedAt: Date;
};

/** 1 ブロックの生成結果 */
export type PromptBlockDraft = {
  kind: PromptBlockKind;
  blockName: string;
  priority: number;
  content: string;
  enhanced: boolean; // AI 成功 / false ならルールベース fallback
  model: string | null;
  note: string;
  error?: string; // 個別失敗時のメッセージ
};

/** プレビュー API の戻り値 */
export type GeneratePreviewResult =
  | {
      ok: true;
      genre: string;
      blocks: PromptBlockDraft[];
      signals: {
        eventCount: number;
        downloadedCount: number;
        expandedCount: number;
        avgHitScore: number | null;
        savedImageCount: number;
      };
    }
  | { ok: false; genre: string; error: string };

/** commit API の戻り値 */
export type CommitResult =
  | { ok: true; genre: string; upsertedCount: number }
  | { ok: false; genre: string; error: string };
