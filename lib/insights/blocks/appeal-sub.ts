// 【訴求サブ選好】ブロック生成
// - サブラベル別 DL 率 TOP
// - 頻出の書き換えパターン(AI 原文 → ユーザー確定文)
// gpt-4o-mini で短文整形(統計不足時はルールベース)

import { callChatCompletion, hasOpenAIKey } from '../openai-client';
import {
  BLOCK_NAME_BY_KIND,
  BLOCK_PRIORITY_BY_KIND,
  type GenreSignals,
  type PromptBlockDraft,
} from '../types';
import { formatJstDateTime } from '@/lib/format';

const TEXT_MODEL = 'gpt-4o-mini';

export async function buildAppealSubBlock(
  signals: GenreSignals,
): Promise<PromptBlockDraft> {
  const base: Omit<PromptBlockDraft, 'content' | 'enhanced' | 'model' | 'error'> = {
    kind: 'appeal-sub',
    blockName: BLOCK_NAME_BY_KIND['appeal-sub'],
    priority: BLOCK_PRIORITY_BY_KIND['appeal-sub'],
    note: `自動生成: ${formatJstDateTime(new Date())} / サブラベル統計: ${signals.subLabelStats.length} 件 / 書き換え: ${signals.topRewrites.length} 件`,
  };

  const hasAny =
    signals.subLabelStats.length > 0 || signals.topRewrites.length > 0;
  if (!hasAny) {
    return {
      ...base,
      content: fallbackText(signals, '訴求ポイント統計と書き換えパターンがまだありません'),
      enhanced: false,
      model: null,
      error: '訴求統計なし',
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
    'あなたは日本の広告代理店の広告プランナーです。',
    `「${signals.genre}」ジャンルで、ユーザーが実際に選んだ訴求サブ項目と、AI 提案を書き換えた結果から、`,
    'このジャンルで「選ばれやすい訴求の方向」と「ユーザーが好むトーン例」をまとめてください。',
    '',
    '出力要件:',
    '- 日本語 / 400〜600 文字',
    '- 先頭行: `##【訴求サブ選好】##`',
    '- 2 部構成:',
    '  (a) このジャンルで DL 率が高い訴求サブ TOP 3-5 を列挙して、なぜ刺さっているか一言ずつ',
    '  (b) ユーザーが好むトーン例 TOP 3-5 を「AI 原文 → 確定文」のペアで示して、どう書き換わる傾向かを一文でまとめる',
    '- Gemini の①②③提案生成時に直接活きる「方向性の指示」として書く',
    '- 抽象語(魅力的・印象的等)ではなく具体的な語彙・構文を残す',
  ].join('\n');

  const userText = [
    `## ジャンル: ${signals.genre}`,
    '',
    `## サブラベル別統計 (DL 率降順 / 上位 ${Math.min(10, signals.subLabelStats.length)} 件)`,
    ...(signals.subLabelStats.length > 0
      ? signals.subLabelStats.map((s) => {
          const rate = s.count > 0 ? ((s.downloaded / s.count) * 100).toFixed(1) : '—';
          const hit = s.avgHitScore != null ? `/ 平均hit=${s.avgHitScore.toFixed(2)}` : '';
          return `- ${s.subLabel}: 選択${s.count}回 / DL${s.downloaded}回 (率 ${rate}%) ${hit}`;
        })
      : ['(データなし)']),
    '',
    `## 書き換えパターン (AI 原文 → ユーザー確定文 / 上位 ${Math.min(8, signals.topRewrites.length)} 件)`,
    ...(signals.topRewrites.length > 0
      ? signals.topRewrites.map((r, i) => {
          const dlRate = r.count > 0 ? ((r.downloaded / r.count) * 100).toFixed(0) : '0';
          return `${i + 1}. (n=${r.count} / DL率 ${dlRate}%)\n   原文: ${r.originalText.slice(0, 100)}\n   確定: ${r.rewrittenText.slice(0, 100)}`;
        })
      : ['(データなし)']),
    '',
    `上記を踏まえて、このジャンルの「選ばれやすい訴求の方向」と「ユーザーが好むトーン例」を 400〜600 字でまとめてください。`,
  ].join('\n');

  const result = await callChatCompletion({
    model: TEXT_MODEL,
    systemPrompt,
    userContent: [{ type: 'text', text: userText }],
    temperature: 0.45,
    maxTokens: 900,
    timeoutMs: 30_000,
  });

  if (!result) {
    return {
      ...base,
      content: fallbackText(signals, 'AI 要約に失敗'),
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
  const lines = ['##【訴求サブ選好】##', `(${reason}のためルールベース出力)`, ''];
  if (signals.subLabelStats.length > 0) {
    lines.push('- DL 率 TOP (サブラベル):');
    for (const s of signals.subLabelStats.slice(0, 5)) {
      const rate = s.count > 0 ? ((s.downloaded / s.count) * 100).toFixed(0) : '0';
      lines.push(`  • ${s.subLabel} — ${s.count}回 / DL率 ${rate}%`);
    }
  }
  if (signals.topRewrites.length > 0) {
    lines.push('- 頻出書き換え:');
    for (const r of signals.topRewrites.slice(0, 3)) {
      lines.push(`  • 「${r.originalText.slice(0, 40)}」→ 「${r.rewrittenText.slice(0, 40)}」 (${r.count}回)`);
    }
  }
  if (signals.subLabelStats.length === 0 && signals.topRewrites.length === 0) {
    lines.push('- データが溜まれば自動で強化されます。');
  }
  return lines.join('\n');
}
