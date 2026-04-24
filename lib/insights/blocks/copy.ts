// 【刺さるコピー傾向】ブロック生成
// DL / 横展開された Event の appealText と頻出ワードを gpt-4o-mini に投げてトーン要約。
// サンプルが少ない時はルールベースで TOP ワードだけ並べる。

import { callChatCompletion, hasOpenAIKey } from '../openai-client';
import {
  BLOCK_NAME_BY_KIND,
  BLOCK_PRIORITY_BY_KIND,
  type GenreSignals,
  type PromptBlockDraft,
} from '../types';

const MIN_COPIES_FOR_AI = 3;
const TEXT_MODEL = 'gpt-4o-mini';

export async function buildCopyBlock(
  signals: GenreSignals,
): Promise<PromptBlockDraft> {
  const base: Omit<PromptBlockDraft, 'content' | 'enhanced' | 'model' | 'error'> = {
    kind: 'copy',
    blockName: BLOCK_NAME_BY_KIND['copy'],
    priority: BLOCK_PRIORITY_BY_KIND['copy'],
    note: `自動生成: ${new Date().toLocaleString('ja-JP')} / 刺さりコピー: ${signals.hitCopies.length} 件 / TOP ワード: ${signals.topKeywords.length}`,
  };

  if (signals.hitCopies.length < MIN_COPIES_FOR_AI) {
    return {
      ...base,
      content: fallbackText(signals, `刺さったコピーが ${signals.hitCopies.length} 件しかない(最低 ${MIN_COPIES_FOR_AI})`),
      enhanced: false,
      model: null,
      error: '刺さったコピーのサンプル不足',
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
    'あなたは日本の広告代理店のコピーライターです。',
    `「${signals.genre}」ジャンルで実際に DL / 横展開された広告のコピー文から、共通するトーン・語彙・表現パターンを抽出し、`,
    'Gemini が同ジャンルの広告を生成する際の「刺さるコピーの作り方ガイド」を書いてください。',
    '',
    '出力要件:',
    '- 日本語 / 400〜600 文字',
    '- 先頭行: `##【刺さるコピー傾向】##`',
    '- 頻出ワード群は「できるだけそのまま使う or 近しい言い換えで」使える形で列挙する(具体語を残す)',
    '- 口調(断定調 / 問いかけ / 数字訴求 / 擬人化 等) の癖を一文で特徴付け',
    '- 禁忌語/避ける表現は最小限。実データに基づくポジティブな示唆を優先',
    '- 箇条書き + 短い解説',
  ].join('\n');

  // コピーは hit_score 降順で上位 30 件をサンプルとして見せる
  const sampleCopies = [...signals.hitCopies]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 30);

  const userText = [
    `## ジャンル: ${signals.genre}`,
    '',
    `## 頻出ワード(重み付き — 高いほど成功コピーで多用)`,
    ...signals.topKeywords.slice(0, 15).map(
      (k) => `- ${k.word} (重み=${k.count})`,
    ),
    '',
    `## 刺さったコピー例 (${sampleCopies.length} 件 / hit_score 降順)`,
    ...sampleCopies.map((c, i) => {
      const typeStr = c.appealType ? ` [${c.appealType}]` : '';
      return `${i + 1}. (w=${c.weight.toFixed(2)})${typeStr} ${c.text.slice(0, 140)}`;
    }),
    '',
    'これらを踏まえて、このジャンルで「次に刺さる」コピーの書き方を 400〜600 字でまとめてください。頻出ワードは積極的に活用する方向で。',
  ].join('\n');

  const result = await callChatCompletion({
    model: TEXT_MODEL,
    systemPrompt,
    userContent: [{ type: 'text', text: userText }],
    temperature: 0.5,
    maxTokens: 900,
    timeoutMs: 30_000,
  });

  if (!result) {
    return {
      ...base,
      content: fallbackText(signals, 'AI 要約に失敗(ルールベースへフォールバック)'),
      enhanced: false,
      model: TEXT_MODEL,
      error: 'AI 要約に失敗',
    };
  }

  return {
    ...base,
    content: result.text,
    enhanced: true,
    model: result.model,
  };
}

function fallbackText(signals: GenreSignals, reason: string): string {
  const lines = [
    '##【刺さるコピー傾向】##',
    `(${reason}のためルールベース出力)`,
    '',
  ];
  if (signals.topKeywords.length > 0) {
    lines.push(
      `- 頻出ワード(このジャンルの成功コピーで多用): ${signals.topKeywords
        .slice(0, 10)
        .map((k) => k.word)
        .join(' / ')}`,
    );
  }
  if (signals.hitCopies.length > 0) {
    lines.push(
      `- 刺さりコピーのサンプル: ${signals.hitCopies
        .slice(0, 3)
        .map((c) => `「${c.text.slice(0, 40)}」`)
        .join(' / ')}`,
    );
  } else {
    lines.push('- DL / 横展開されたコピーがまだありません。データが溜まれば自動で強化されます。');
  }
  return lines.join('\n');
}
