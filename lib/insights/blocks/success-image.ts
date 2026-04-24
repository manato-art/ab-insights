// 【成功画像傾向】ブロック生成
// DL された画像(hit_score 降順)を gpt-4o-mini vision に投げて共通特徴を抽出する。
// 画像が足りない場合はルールベースの短文フォールバック。

import { callChatCompletion, hasOpenAIKey } from '../openai-client';
import {
  BLOCK_NAME_BY_KIND,
  BLOCK_PRIORITY_BY_KIND,
  type GenreSignals,
  type PromptBlockDraft,
} from '../types';

const MIN_IMAGES_FOR_AI = 3;
const VISION_MODEL = 'gpt-4o-mini';

export async function buildSuccessImageBlock(
  signals: GenreSignals,
): Promise<PromptBlockDraft> {
  const base: Omit<PromptBlockDraft, 'content' | 'enhanced' | 'model' | 'error'> = {
    kind: 'success-image',
    blockName: BLOCK_NAME_BY_KIND['success-image'],
    priority: BLOCK_PRIORITY_BY_KIND['success-image'],
    note: noteFor(signals),
  };

  const imageCount = signals.savedImages.length;

  // 画像不足 → フォールバック
  if (imageCount < MIN_IMAGES_FOR_AI) {
    return {
      ...base,
      content: fallbackText(signals, `DL 画像が ${imageCount} 枚しか無く視覚解析に不十分(最低 ${MIN_IMAGES_FOR_AI} 枚必要)`),
      enhanced: false,
      model: null,
      error: imageCount === 0 ? 'DL 画像が 0 枚' : '画像不足でルールベース出力',
    };
  }

  if (!hasOpenAIKey()) {
    return {
      ...base,
      content: fallbackText(signals, 'OPENAI_API_KEY が未設定'),
      enhanced: false,
      model: null,
      error: 'OpenAI キー未設定',
    };
  }

  const systemPrompt = [
    'あなたは日本の広告代理店のシニア広告デザイナー兼プロンプトエンジニアです。',
    `「${signals.genre}」ジャンルで、ユーザーが実際にダウンロードした(= 成功した)広告バナー画像を分析し、`,
    '次回 Gemini に生成させる際の「視覚的ガイドライン」を作成してください。',
    '',
    '出力要件:',
    '- 日本語 / 500〜800 文字',
    '- 先頭行: `##【成功画像傾向】##`',
    '- 抽象的な形容詞(おしゃれ/プロ仕様等)を避け、具体的な数値や色や配置を書く',
    '- ポジティブな方向指示(〜を使う / 〜を配置する)を優先し、禁止は最小限',
    '- 以下を必ずカバー:',
    '  1. 配色(主色・差し色を具体名 or 16進で)',
    '  2. 構図・レイアウト(被写体の位置 / 余白比 / 要素の階層)',
    '  3. タイポグラフィ(フォント印象 / サイズ比 / 色)',
    '  4. 被写体・モチーフの共通点(人物の有無 / ポーズ / 商品の見せ方)',
    '  5. CTA / キャッチコピーの配置と書き方の癖',
    '- 画像間で共通しない要素は「揺らしてよい」と明記',
  ].join('\n');

  const userText = [
    `## 対象ジャンル: ${signals.genre}`,
    `## 集計サマリ`,
    `- 総 Event 数: ${signals.eventCount}`,
    `- DL 数: ${signals.downloadedCount} (率 ${pct(signals.downloadedCount, signals.eventCount)})`,
    `- 横展開数: ${signals.expandedCount}`,
    `- 平均 hit_score: ${signals.avgHitScore != null ? signals.avgHitScore.toFixed(3) : 'N/A'}`,
    '',
    `## 解析対象画像 (${imageCount} 枚 — ユーザーが DL した成功例・hit_score 降順)`,
    ...signals.savedImages.map((img, i) => {
      const bits: string[] = [`画像${i + 1}:`];
      if (img.hitScore != null) bits.push(`hit=${(img.hitScore * 100).toFixed(0)}%`);
      if (img.appealType) bits.push(`訴求タイプ=${img.appealType}`);
      if (img.appealText) bits.push(`訴求文=${img.appealText.slice(0, 60)}`);
      return bits.join(' / ');
    }),
    '',
    `上記の画像群に共通する視覚的成功パターンを抽出し、Gemini に直接渡せる形で 500〜800 字の「視覚ガイドライン」を書いてください。`,
  ].join('\n');

  const userContent: Parameters<typeof callChatCompletion>[0]['userContent'] = [
    { type: 'text', text: userText },
  ];
  for (const img of signals.savedImages) {
    userContent.push({
      type: 'image_url',
      image_url: { url: img.dataUrl, detail: 'low' },
    });
  }

  const result = await callChatCompletion({
    model: VISION_MODEL,
    systemPrompt,
    userContent,
    temperature: 0.4,
    maxTokens: 1200,
    timeoutMs: 50_000,
  });

  if (!result) {
    return {
      ...base,
      content: fallbackText(signals, 'Vision 解析に失敗(タイムアウト or API エラー)'),
      enhanced: false,
      model: VISION_MODEL,
      error: 'Vision 解析に失敗',
    };
  }

  return {
    ...base,
    content: result.text,
    enhanced: true,
    model: result.model,
  };
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function noteFor(signals: GenreSignals): string {
  const parts: string[] = [
    `自動生成: ${new Date().toLocaleString('ja-JP')}`,
    `対象 Event: ${signals.eventCount} 件`,
    `DL 画像: ${signals.savedImages.length} 枚`,
  ];
  return parts.join(' / ');
}

function fallbackText(signals: GenreSignals, reason: string): string {
  const lines = [
    '##【成功画像傾向】##',
    `(${reason}のためルールベース出力)`,
    `- 対象ジャンル: ${signals.genre}`,
    `- DL 画像枚数: ${signals.savedImages.length}`,
    `- 平均 hit_score: ${signals.avgHitScore != null ? signals.avgHitScore.toFixed(2) : 'N/A'}`,
    '- データが溜まり次第、次回更新時に視覚ガイドラインが自動生成されます。',
  ];
  return lines.join('\n');
}
