// ab-system からの webhook / 内部 API 用 zod スキーマ
// ほとんどのフィールドは optional(ab-system の自由度を確保)。
// 必須は「どのイベントか」を一意に識別する最小限のみ。
import { z } from 'zod';

/** 画像 1 枚分のメタ情報(webhook payload) */
export const eventImageSchema = z.object({
  imageIndex: z.number().int().nonnegative(),
  /** 64x64 WebP サムネを base64 エンコードした文字列。data: URL プレフィクスは不可。 */
  thumbnail: z.string().min(1).optional().nullable(),
  /** 元画像の SHA-256 16 進文字列(重複検出用)。 */
  fullHash: z.string().min(1).optional().nullable(),
});

/** POST /api/events のリクエスト body */
export const createEventSchema = z.object({
  abSystemUserId: z.string().min(1, 'abSystemUserId は必須です'),
  abSystemUserName: z.string().optional().nullable(),
  endpoint: z.string().min(1, 'endpoint は必須です'),
  model: z.string().optional().nullable(),

  // 入力コンテキスト(全 optional)
  genre: z.string().optional().nullable(),
  subGenre: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  ageGroup: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  appealType: z.string().optional().nullable(),
  appealText: z.string().optional().nullable(),
  /** AI が最初に提案した訴求文(書き換え検出用)。未送信なら「書き換え情報なし」扱い。 */
  appealOriginalText: z.string().optional().nullable(),
  /** 選んだ①②③のどれか(1-based)。 */
  appealSelectedIndex: z.number().int().min(1).max(3).optional().nullable(),
  additionalNote: z.string().optional().nullable(),

  /**
   * AI 修正時の指示配列。ab-system の /api/edit-region の items[] と同形式。
   * kind: 'background' | 'text' | 'text_color' | 'person' | 'product_swap' | 'remove' | ...
   * text: ユーザーが入力した指示文。
   * region: 省略可(画像全体のとき)。
   * endpoint='edit-region' のときのみ送られる想定。
   */
  aiEditInstructions: z
    .array(
      z.object({
        kind: z.string().optional().nullable(),
        text: z.string().optional().nullable(),
        region: z.record(z.string(), z.unknown()).optional().nullable(),
      })
    )
    .optional()
    .nullable(),

  // styleAxes は任意のオブジェクト(JSON 文字列化して保存)
  styleAxes: z.record(z.string(), z.unknown()).optional().nullable(),

  urlAnalysisSummary: z.string().optional().nullable(),
  promptFull: z.string().optional().nullable(),

  imageCount: z.number().int().nonnegative().optional().default(0),
  images: z.array(eventImageSchema).optional().default([]),

  // ===== ② 文脈入力 (生成時に form から / プロンプト非注入・データ保存のみ) =====
  campaignGoal: z.enum(['cv', 'awareness', 'lead', 'retargeting']).optional().nullable(),
  /** 興味関心タグの配列 */
  targetInterests: z.array(z.string()).optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  targetIncomeRange: z.string().optional().nullable(),
  budgetRange: z.string().optional().nullable(),
  targetCpa: z.number().nonnegative().optional().nullable(),
  landingPageUrl: z.string().optional().nullable(),
  cvPointType: z.enum(['purchase', 'signup', 'call', 'download', 'other']).optional().nullable(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** 後追いで送られる AI 編集履歴 1 件 */
export const aiEditSchema = z.object({
  kind: z.string().min(1),
  instruction: z.string().min(1),
  /** 対象画像の index (1-based)。undefined なら「どの画像か不明・Event レベル」扱い */
  imageIndex: z.number().int().nonnegative().optional(),
  /** ⑥ ネガティブ学習: この編集の結果が破棄されたか */
  discarded: z.boolean().optional(),
});

/** 個別画像のシグナル(どの絵柄が刺さったかの粒度情報) */
export const imageSignalSchema = z.object({
  imageIndex: z.number().int().nonnegative(),
  downloaded: z.boolean().optional(),
  aiEdited: z.boolean().optional(),
  /** ① DL された時刻(ISO 文字列) */
  downloadedAt: z.string().optional().nullable(),
  /** ① DL 順位(1 = 最初) */
  downloadRank: z.number().int().positive().optional().nullable(),
  /** ⑤ ホバー時間(ms) */
  hoverMs: z.number().int().nonnegative().optional().nullable(),
  /** ⑤ 拡大表示回数 */
  viewCount: z.number().int().nonnegative().optional().nullable(),
});

/** POST /api/events/[id]/signal のリクエスト body */
export const updateSignalSchema = z
  .object({
    // Event レベルのシグナル (これまで通り)
    downloaded: z.boolean().optional(),
    horizontallyExpanded: z.boolean().optional(),
    aiEdited: z.boolean().optional(),
    regeneratedCount: z.number().int().nonnegative().optional(),
    aiEdits: z.array(aiEditSchema).optional(),
    // 個別画像シグナル (B オプション: どの絵柄が DL / 編集されたか)
    imageSignals: z.array(imageSignalSchema).optional(),

    // ===== ① 信号粒度・評価 (late update) =====
    /** 生成 → 初回 DL までの経過 ms */
    decisionTimeMs: z.number().int().nonnegative().optional(),
    /** 再生成理由ラベル */
    regenerationReason: z
      .enum(['color', 'person', 'background', 'copy', 'layout', 'appeal', 'quality', 'other'])
      .optional(),
    /** ★1-5 評価 */
    rating: z.number().int().min(1).max(5).optional(),
    /** 評価コメント */
    ratingComment: z.string().optional(),
    /** タグ(配列) */
    tags: z.array(z.string()).optional(),

    // ===== ⑤ 暗黙シグナル(Event レベル集計値) =====
    sessionDurationMs: z.number().int().nonnegative().optional(),
    totalHoverMs: z.number().int().nonnegative().optional(),
    zoomCount: z.number().int().nonnegative().optional(),
    tabSwitchCount: z.number().int().nonnegative().optional(),
    comparisonViewMs: z.number().int().nonnegative().optional(),
    rightClickSaveCount: z.number().int().nonnegative().optional(),

    // ===== ⑥ ネガティブ学習 =====
    /** 編集後に結果を破棄した(= 直らなかった) */
    discardedAfterEdit: z.boolean().optional(),
    /** 再生成で何を変えたか(JSON をそのまま文字列化して送る想定) */
    regenerationDiff: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.downloaded !== undefined ||
      v.horizontallyExpanded !== undefined ||
      v.aiEdited !== undefined ||
      v.regeneratedCount !== undefined ||
      (v.aiEdits !== undefined && v.aiEdits.length > 0) ||
      (v.imageSignals !== undefined && v.imageSignals.length > 0) ||
      v.decisionTimeMs !== undefined ||
      v.regenerationReason !== undefined ||
      v.rating !== undefined ||
      v.ratingComment !== undefined ||
      (v.tags !== undefined && v.tags.length > 0) ||
      v.sessionDurationMs !== undefined ||
      v.totalHoverMs !== undefined ||
      v.zoomCount !== undefined ||
      v.tabSwitchCount !== undefined ||
      v.comparisonViewMs !== undefined ||
      v.rightClickSaveCount !== undefined ||
      v.discardedAfterEdit !== undefined ||
      v.regenerationDiff !== undefined,
    { message: '更新するフィールドが指定されていません' }
  );

export type UpdateSignalInput = z.infer<typeof updateSignalSchema>;

/**
 * 行動シグナルから hitScore を算出(0〜1)。
 *   downloaded:           +0.5
 *   horizontallyExpanded: +0.4
 *   aiEdited:             +0.1
 *   regeneratedCount>0:   -0.05 * min(regeneratedCount, 4)
 * 上下限でクランプ。
 */
export function computeHitScore(signals: {
  downloaded: boolean;
  horizontallyExpanded: boolean;
  aiEdited: boolean;
  regeneratedCount: number;
}): number {
  const { downloaded, horizontallyExpanded, aiEdited, regeneratedCount } = signals;
  let score = 0;
  if (downloaded) score += 0.5;
  if (horizontallyExpanded) score += 0.4;
  if (aiEdited) score += 0.1;
  if (regeneratedCount > 0) score -= 0.05 * Math.min(regeneratedCount, 4);
  return Math.max(0, Math.min(1, score));
}

/**
 * zod v4 のエラーを { field: [messages...] } 形式に整形。
 * 400 応答の body に入れる用。
 */
export function formatZodError(err: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path =
      issue.path.length > 0
        ? issue.path.map((p) => String(p)).join('.')
        : '_root';
    (fieldErrors[path] ||= []).push(issue.message);
  }
  return fieldErrors;
}
