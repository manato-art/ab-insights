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
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

/** 後追いで送られる AI 編集履歴 1 件 */
export const aiEditSchema = z.object({
  kind: z.string().min(1),
  instruction: z.string().min(1),
  /** 対象画像の index (1-based)。undefined なら「どの画像か不明・Event レベル」扱い */
  imageIndex: z.number().int().nonnegative().optional(),
});

/** 個別画像のシグナル(どの絵柄が刺さったかの粒度情報) */
export const imageSignalSchema = z.object({
  imageIndex: z.number().int().nonnegative(),
  downloaded: z.boolean().optional(),
  aiEdited: z.boolean().optional(),
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
  })
  .refine(
    (v) =>
      v.downloaded !== undefined ||
      v.horizontallyExpanded !== undefined ||
      v.aiEdited !== undefined ||
      v.regeneratedCount !== undefined ||
      (v.aiEdits !== undefined && v.aiEdits.length > 0) ||
      (v.imageSignals !== undefined && v.imageSignals.length > 0),
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
