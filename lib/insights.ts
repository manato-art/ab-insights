// ============================================================
// ジャンル別学習データ集計
// ============================================================
// Event テーブルから「このジャンルで何が刺さっているか」を集計し、
// ab-system 側の Gemini プロンプトに注入する学習済みブロックテキストを生成する。
//
// 集計ルール:
//   - 「刺さり」シグナル: downloaded / horizontallyExpanded
//   - 「刺さらない」シグナル: aiEdited (編集された = 満足してなかった kind を記録) /
//                             regeneratedCount (再生成されすぎた)
//   - hit_score 上位を"成功例"として抽出
// ============================================================

import { prisma } from './db';

export type GenreLearning = {
  genre: string;
  eventCount: number;
  downloadedCount: number;
  expandedCount: number;
  avgHitScore: number | null;
  topAppealTypes: Array<{ appealType: string; count: number; avgHit: number }>;
  topStyles: Array<{ axis: string; value: string; count: number }>;
  platformDistribution: Array<{ platform: string; count: number }>;
  editKindDistribution: Array<{ kind: string; count: number }>;
  /** 保存された(DL された)画像のサムネイルとメタ — Vision 解析で学習に活かす */
  savedImages: Array<{
    dataUrl: string; // data:image/webp;base64,...
    appealType: string | null;
    appealText: string | null;
  }>;
  promptText: string; // ab-system に渡す学習済みブロック本文
  generatedAt: Date;
};

/** Vision 解析に渡す保存画像の最大数 (コスト/レイテンシ上限) */
const MAX_SAVED_IMAGES_FOR_VISION = 8;

/**
 * 指定ジャンルの学習データを集計して prompt テキストに変換する
 * (enabled=true の GenrePrompt として保存される本文)
 */
export async function computeGenreLearning(genre: string): Promise<GenreLearning> {
  // 対象ジャンルの Event をまとめて取得 (hit_score 上位重視)
  const events = await prisma.event.findMany({
    where: { genre },
    include: { aiEdits: { select: { kind: true } } },
    orderBy: [{ hitScore: 'desc' }, { createdAt: 'desc' }],
    take: 500, // 上限
  });

  const eventCount = events.length;
  const downloadedCount = events.filter((e) => e.downloaded).length;
  const expandedCount = events.filter((e) => e.horizontallyExpanded).length;
  const hitScores = events.map((e) => e.hitScore).filter((s): s is number => s != null);
  const avgHitScore = hitScores.length
    ? hitScores.reduce((a, b) => a + b, 0) / hitScores.length
    : null;

  // 訴求タイプ × hit_score
  const appealMap = new Map<string, { count: number; totalHit: number }>();
  for (const e of events) {
    if (!e.appealType) continue;
    const key = e.appealType.trim();
    if (!key) continue;
    const bucket = appealMap.get(key) ?? { count: 0, totalHit: 0 };
    bucket.count += 1;
    bucket.totalHit += e.hitScore ?? 0;
    appealMap.set(key, bucket);
  }
  const topAppealTypes = [...appealMap.entries()]
    .map(([appealType, b]) => ({
      appealType,
      count: b.count,
      avgHit: b.count > 0 ? b.totalHit / b.count : 0,
    }))
    .sort((a, b) => b.avgHit - a.avgHit || b.count - a.count)
    .slice(0, 5);

  // スタイル軸(JSON) の頻出パターン
  const styleAxisMap = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (!e.styleAxesJson) continue;
    try {
      const parsed = JSON.parse(e.styleAxesJson) as Record<string, unknown>;
      for (const [axis, val] of Object.entries(parsed)) {
        if (val == null || typeof val === 'object') continue;
        const valStr = String(val);
        if (!valStr) continue;
        if (!styleAxisMap.has(axis)) styleAxisMap.set(axis, new Map());
        const m = styleAxisMap.get(axis)!;
        m.set(valStr, (m.get(valStr) ?? 0) + 1);
      }
    } catch {
      // skip malformed
    }
  }
  const topStyles = [...styleAxisMap.entries()]
    .flatMap(([axis, m]) =>
      [...m.entries()].map(([value, count]) => ({ axis, value, count }))
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // プラットフォーム分布
  const platMap = new Map<string, number>();
  for (const e of events) {
    if (!e.platform) continue;
    platMap.set(e.platform, (platMap.get(e.platform) ?? 0) + 1);
  }
  const platformDistribution = [...platMap.entries()]
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // AI編集 kind 分布(ユーザーが直したがる部分 = 初期出力で弱い箇所)
  const editMap = new Map<string, number>();
  for (const e of events) {
    for (const ed of e.aiEdits) {
      editMap.set(ed.kind, (editMap.get(ed.kind) ?? 0) + 1);
    }
  }
  const editKindDistribution = [...editMap.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);

  // ===== プロンプトテキスト生成 =====
  // 短く・具体的に・ポジティブ形で。Gemini の既存プロンプトに追記される前提。
  const lines: string[] = [
    `##【このジャンルの学習済み傾向(直近 ${eventCount} 件の成果データ)】##`,
  ];

  if (topAppealTypes.length) {
    lines.push(
      `- 刺さり率が高い訴求タイプ: ` +
        topAppealTypes
          .slice(0, 3)
          .map((a) => `${a.appealType}(${(a.avgHit * 100).toFixed(0)}%)`)
          .join(' / ')
    );
  }

  if (topStyles.length) {
    const byAxis = new Map<string, string[]>();
    for (const s of topStyles) {
      if (!byAxis.has(s.axis)) byAxis.set(s.axis, []);
      byAxis.get(s.axis)!.push(`${s.value}(${s.count})`);
    }
    for (const [axis, values] of byAxis) {
      lines.push(`- スタイル軸「${axis}」の頻出値: ${values.slice(0, 3).join(' / ')}`);
    }
  }

  if (platformDistribution.length > 0) {
    lines.push(
      `- このジャンルでよく使われるプラットフォーム: ` +
        platformDistribution
          .slice(0, 3)
          .map((p) => `${p.platform}(${p.count}件)`)
          .join(' / ')
    );
  }

  if (editKindDistribution.length > 0) {
    const readable = editKindDistribution.map((e) => {
      const label =
        e.kind === 'text'
          ? 'テキスト'
          : e.kind === 'person'
          ? '人物'
          : e.kind === 'background'
          ? '背景'
          : e.kind === 'color'
          ? '色調'
          : e.kind === 'product_swap'
          ? '商品差替'
          : e.kind === 'remove'
          ? '削除'
          : e.kind;
      return `${label}(${e.count})`;
    });
    lines.push(
      `- ユーザーが後から修正することが多い要素(初期出力で特に丁寧に作るべき部分): ` +
        readable.slice(0, 3).join(' / ')
    );
  }

  lines.push(
    `- 以上の実データ傾向を踏まえ、該当訴求・スタイル・プラットフォームに親和性の高い広告バナーを仕上げる。`
  );

  const promptText = lines.join('\n');

  // 保存された(DLされた)画像のサムネイルを最大 N 枚取得 — Vision 解析で学習に活かす
  const savedImagesRaw = await prisma.eventImage.findMany({
    where: {
      downloaded: true,
      thumbnail: { not: null },
      event: { genre },
    },
    select: {
      thumbnail: true,
      event: { select: { appealType: true, appealText: true, hitScore: true } },
    },
    orderBy: [{ event: { hitScore: 'desc' } }, { id: 'desc' }],
    take: MAX_SAVED_IMAGES_FOR_VISION,
  });
  const savedImages = savedImagesRaw
    .filter((row) => row.thumbnail)
    .map((row) => ({
      dataUrl:
        'data:image/webp;base64,' + Buffer.from(row.thumbnail!).toString('base64'),
      appealType: row.event.appealType,
      appealText: row.event.appealText,
    }));

  return {
    genre,
    eventCount,
    downloadedCount,
    expandedCount,
    avgHitScore,
    topAppealTypes,
    topStyles,
    platformDistribution,
    editKindDistribution,
    savedImages,
    promptText,
    generatedAt: new Date(),
  };
}

/**
 * 集計結果を OpenAI (GPT-4o-mini) で「広告デザイナー視点の具体指示」に変換する。
 * ルールベース出力と比べて、Gemini が参照するプロンプトとしての効き目が大幅に上がる。
 *
 * 失敗時はルールベースの promptText をそのまま返す(デグレード動作)。
 * OPENAI_API_KEY が未設定なら即座にルールベース出力を返す。
 */
export async function summarizeWithAI(
  learning: GenreLearning
): Promise<{ text: string; model: string | null; enhanced: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: learning.promptText, model: null, enhanced: false };
  }
  // サンプル数が少なすぎる時は AI 要約せずルールベース
  if (learning.eventCount < 3) {
    return { text: learning.promptText, model: null, enhanced: false };
  }

  // 動的 import (Edge runtime 等で安全)
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });

  // 保存画像(DL済)が 1 枚でもあれば Vision 解析つきのモデルに切替
  const hasImages = learning.savedImages.length > 0;
  const model = hasImages ? 'gpt-4o' : 'gpt-4o-mini';

  const systemPrompt = [
    'あなたは日本の広告代理店に所属するシニア広告デザイナー兼プロンプトエンジニアです。',
    'これから、画像生成 AI (Google Gemini 3.1 Flash Image) で広告バナーを生成する際に、',
    '特定のジャンルで「より刺さる」出力にするための追加プロンプトブロックを作成してもらいます。',
    hasImages
      ? '添付された画像は「ユーザーが実際にダウンロード(保存)した広告バナー = 成功例」です。これらの画像から具体的な共通要素(レイアウト・タイポグラフィ・文字サイズ比・配色・トーン&マナー・人物の有無やポーズ・商品の見せ方・キャッチコピーの書き方・CTA の位置/形状/色)を抽出し、プロンプトブロックに必ず反映してください。'
      : '',
    '出力は以下を厳守してください:',
    '- 日本語',
    hasImages ? '- 600〜1000 文字程度' : '- 400〜700 文字程度',
    '- Gemini に直接渡す「追加指示セクション」として書く(指示形・命令形)',
    '- ネガティブ指示(「〜禁止」)を乱発せず、ポジティブな方向指示を優先',
    '- 統計データと画像観察から「この傾向だからこうする」という因果を短く示す',
    '- 「プロ仕様」「クオリティ高く」等の抽象語ではなく、具体的なデザイン要素(配色・構図・タイポ・光の当て方・文言パターン)を指示',
    hasImages
      ? '- 画像から読み取れる文言・フレーズの癖、色の傾向(#16進や具体的な色名)、余白比、情報階層を必ず明記する'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPromptLines = [
    `## ジャンル: ${learning.genre}`,
    `## 実データサマリ(直近 ${learning.eventCount} 件)`,
    `- DL 率: ${learning.downloadedCount}/${learning.eventCount} (${((learning.downloadedCount / Math.max(1, learning.eventCount)) * 100).toFixed(1)}%)`,
    `- 横展開率: ${learning.expandedCount}/${learning.eventCount} (${((learning.expandedCount / Math.max(1, learning.eventCount)) * 100).toFixed(1)}%)`,
    `- 平均 hit_score: ${learning.avgHitScore != null ? learning.avgHitScore.toFixed(3) : 'N/A'}`,
    '',
    `## 刺さり率が高い訴求タイプ TOP`,
    ...learning.topAppealTypes.slice(0, 5).map(
      (a) => `- ${a.appealType}: hit=${(a.avgHit * 100).toFixed(0)}% (n=${a.count})`
    ),
    '',
    `## スタイル軸の頻出値`,
    ...learning.topStyles.slice(0, 10).map(
      (s) => `- ${s.axis}=${s.value}: ${s.count}件`
    ),
    '',
    `## よく使われるプラットフォーム`,
    ...learning.platformDistribution.map((p) => `- ${p.platform}: ${p.count}件`),
    '',
    `## ユーザーが後から修正することが多い要素(= 初期出力の弱点)`,
    ...learning.editKindDistribution.slice(0, 6).map((e) => `- ${e.kind}: ${e.count}件`),
    '',
  ];

  if (hasImages) {
    userPromptLines.push(
      `## 保存された成功画像 (${learning.savedImages.length} 枚 — ユーザーが DL / 完成ダウンロードした実績あり)`,
      ...learning.savedImages.map((img, i) => {
        const bits: string[] = [`画像${i + 1}:`];
        if (img.appealType) bits.push(`訴求タイプ=${img.appealType}`);
        if (img.appealText) bits.push(`訴求文=${img.appealText.slice(0, 80)}`);
        return bits.join(' / ');
      }),
      '',
      '上記の成功画像から、レイアウト/タイポ/配色/文言パターン/商品の見せ方を抽出して学習ブロックに反映してください。',
    );
  }

  userPromptLines.push(
    '---',
    `上記の実データ傾向${hasImages ? 'と成功画像群の観察' : ''}を踏まえ、「${learning.genre}」ジャンルの広告バナーを生成する際に Gemini に追加で渡す`,
    `${hasImages ? '600〜1000' : '400〜700'} 文字のプロンプトブロックを書いてください。ヘッダーは \`##【学習済み傾向: ${learning.genre}】##\` で始めてください。`,
  );

  const userText = userPromptLines.join('\n');

  // Vision 用 multimodal content を組み立て
  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }
  > = [{ type: 'text', text: userText }];
  if (hasImages) {
    for (const img of learning.savedImages) {
      userContent.push({
        type: 'image_url',
        image_url: { url: img.dataUrl, detail: 'low' },
      });
    }
  }

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return { text: learning.promptText, model, enhanced: false };
    }
    return { text, model, enhanced: true };
  } catch (e) {
    console.warn('[insights] AI summarize failed, fallback to rule-based:', (e as Error).message);
    return { text: learning.promptText, model: 'gpt-4o-mini', enhanced: false };
  }
}

/** 存在するジャンル一覧(Event に記録されたもの) */
export async function listKnownGenres(): Promise<Array<{ genre: string; count: number }>> {
  const rows = await prisma.event.groupBy({
    by: ['genre'],
    _count: true,
    where: { genre: { not: null } },
    orderBy: { _count: { genre: 'desc' } },
  });
  return rows
    .filter((r): r is typeof r & { genre: string } => r.genre != null)
    .map((r) => ({ genre: r.genre, count: r._count as unknown as number }));
}
