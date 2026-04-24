// ジャンル別の事前集計ロジック。
// 3 ブロック (success-image / copy / appeal-sub) 全てが 1 回の集計結果を参照する。
// Event を重複で走らせないためにここで全部まとめておく。

import { prisma } from '../db';
import type { GenreSignals } from './types';

/** vision に渡す DL 画像の最大枚数 (Hobby の 60s 制限を踏まえて控えめ) */
const MAX_VISION_IMAGES = 8;
/** コピー集計に入れる刺さり Event の最大数 */
const MAX_HIT_COPIES = 80;
/** topKeywords 抽出 n-gram の範囲 */
const NGRAM_MIN = 2;
const NGRAM_MAX = 6;

// ab-system の 7 カテゴリ × 3 サブ (docs/superpowers/specs/2026-04-09-appeal-7categories-design.md)
// appeals/page.tsx と重複だが、将来ここを single source of truth にしたい。
const SUB_LABELS_BY_CATEGORY: Record<string, readonly [string, string, string]> = {
  '課題解決・コンプレックス': ['警告・ハッとさせる', '共感・代弁', '原因の指摘'],
  '理想の未来・ベネフィット': ['物理的・具体的な変化', '感情・メンタルの変化', 'ステータス・優越感'],
  'オファー・お得感': ['ダイレクトな安さ', 'ハードルの低さ', '特典・付加価値'],
  '実績・権威性': ['大衆の支持', '専門家・プロの推薦', 'ユーザーの熱量'],
  '手軽さ・タイパ': ['時間の短縮', '労力の削減', '場所・環境の自由'],
  '限定・緊急性': ['時間・期間の限定', '数量・人数の限定', '条件の限定'],
  '新奇性・意外性': ['常識の破壊', 'トレンド・最新', '秘密・非公開'],
};

function resolveSubLabel(
  appealType: string | null | undefined,
  index: number | null | undefined,
): string | null {
  if (!appealType || !index || index < 1 || index > 3) return null;
  const exact = SUB_LABELS_BY_CATEGORY[appealType];
  if (exact) return exact[index - 1];
  for (const [cat, subs] of Object.entries(SUB_LABELS_BY_CATEGORY)) {
    if (appealType.includes(cat)) return subs[index - 1];
  }
  return null;
}

function extractPlainAppealText(appealText: string | null): string {
  if (!appealText) return '';
  return appealText.replace(/\n*【使用キーワード：[^】]*】\s*$/u, '').trim();
}

/** 日本語テキストから 2-6 文字の連続シーケンスを列挙(語境界が曖昧な日本語向けの簡易策) */
function extractNgrams(text: string): string[] {
  // 区切り文字(記号・数字・英字・空白)で分割してから ngram
  const segments = text.split(/[\s、。！？!?,.\/\\:;\-—―－「」『』【】（）()［］\[\]"'`@#$%&*+=<>|~^_0-9A-Za-z]+/u).filter(Boolean);
  const results: string[] = [];
  for (const seg of segments) {
    for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
      if (seg.length < n) continue;
      for (let i = 0; i <= seg.length - n; i++) {
        results.push(seg.slice(i, i + n));
      }
    }
  }
  return results;
}

// あまりに一般的な単語やノイズを除外(固有名詞は残す)
const STOP_NGRAMS = new Set([
  'こと', 'もの', 'それ', 'これ', 'あれ', 'して', 'です', 'ます', 'した', 'ない', 'なる', 'いる', 'ある', 'する',
  'ため', 'とき', '場合', 'よう', 'さん', 'さま',
]);

export async function aggregateGenreSignals(genre: string): Promise<GenreSignals> {
  const g = genre.trim();

  // ---- Event 全体取得 ----
  const events = await prisma.event.findMany({
    where: { genre: g },
    orderBy: [{ hitScore: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      appealType: true,
      appealText: true,
      appealOriginalText: true,
      appealSelectedIndex: true,
      downloaded: true,
      horizontallyExpanded: true,
      aiEdited: true,
      hitScore: true,
    },
  });

  const eventCount = events.length;
  const downloadedCount = events.filter((e) => e.downloaded).length;
  const expandedCount = events.filter((e) => e.horizontallyExpanded).length;
  const aiEditedCount = events.filter((e) => e.aiEdited).length;
  const hitScores = events
    .map((e) => e.hitScore)
    .filter((s): s is number => s != null);
  const avgHitScore = hitScores.length
    ? hitScores.reduce((a, b) => a + b, 0) / hitScores.length
    : null;

  // ---- DL 画像サムネ (成功画像ブロック用) ----
  const savedImagesRaw = await prisma.eventImage.findMany({
    where: {
      downloaded: true,
      thumbnail: { not: null },
      event: { genre: g },
    },
    select: {
      thumbnail: true,
      event: {
        select: {
          appealType: true,
          appealText: true,
          hitScore: true,
        },
      },
    },
    orderBy: [{ event: { hitScore: 'desc' } }, { id: 'desc' }],
    take: MAX_VISION_IMAGES,
  });
  const savedImages = savedImagesRaw
    .filter((row) => row.thumbnail)
    .map((row) => ({
      dataUrl:
        'data:image/webp;base64,' + Buffer.from(row.thumbnail!).toString('base64'),
      hitScore: row.event.hitScore,
      appealType: row.event.appealType,
      appealText: row.event.appealText
        ? extractPlainAppealText(row.event.appealText)
        : null,
    }));

  // ---- コピー傾向 (DL または 横展開の Event を hit_score で重み付け) ----
  const hitCopies: GenreSignals['hitCopies'] = [];
  for (const e of events) {
    if (!e.downloaded && !e.horizontallyExpanded) continue;
    const text = extractPlainAppealText(e.appealText);
    if (!text) continue;
    hitCopies.push({
      text,
      weight: Math.max(0, Math.min(1, e.hitScore ?? 0)),
      appealType: e.appealType,
    });
    if (hitCopies.length >= MAX_HIT_COPIES) break;
  }

  // ---- 頻出ワード(n-gram 重み付きカウント) ----
  const ngramMap = new Map<string, number>();
  for (const copy of hitCopies) {
    // 重みは 0.1 + hitScore で下駄を履かせる(DL=1 なら合計 1.1 で加算)
    const w = 0.1 + copy.weight;
    for (const gram of extractNgrams(copy.text)) {
      if (STOP_NGRAMS.has(gram)) continue;
      ngramMap.set(gram, (ngramMap.get(gram) ?? 0) + w);
    }
  }
  // 最長一致優先でまとめる: 部分文字列が同じスコアなら長い方を残す
  const sortedNgrams = [...ngramMap.entries()].sort((a, b) => b[1] - a[1]);
  const topKeywords: Array<{ word: string; count: number }> = [];
  const accepted = new Set<string>();
  for (const [word, score] of sortedNgrams) {
    // 既に採用されたキーワードの substring はスキップ
    let redundant = false;
    for (const other of accepted) {
      if (other.includes(word) || word.includes(other)) {
        // 同スコアに近いなら長い方を残す
        const otherScore = ngramMap.get(other) ?? 0;
        if (word.length > other.length && Math.abs(score - otherScore) < 0.5) {
          accepted.delete(other);
          const idx = topKeywords.findIndex((k) => k.word === other);
          if (idx >= 0) topKeywords.splice(idx, 1);
        } else {
          redundant = true;
          break;
        }
      }
    }
    if (redundant) continue;
    accepted.add(word);
    topKeywords.push({ word, count: Math.round(score * 10) / 10 });
    if (topKeywords.length >= 20) break;
  }

  // ---- サブラベル別 DL 率 (訴求サブブロック用) ----
  const subStatsMap = new Map<
    string,
    { count: number; downloaded: number; hitSum: number; hitN: number }
  >();
  for (const e of events) {
    if (!e.appealOriginalText || !e.appealSelectedIndex) continue;
    const subLabel = resolveSubLabel(e.appealType, e.appealSelectedIndex);
    if (!subLabel) continue;
    const b = subStatsMap.get(subLabel) ?? {
      count: 0,
      downloaded: 0,
      hitSum: 0,
      hitN: 0,
    };
    b.count += 1;
    if (e.downloaded) b.downloaded += 1;
    if (e.hitScore != null) {
      b.hitSum += e.hitScore;
      b.hitN += 1;
    }
    subStatsMap.set(subLabel, b);
  }
  const subLabelStats = [...subStatsMap.entries()]
    .map(([subLabel, b]) => ({
      subLabel,
      count: b.count,
      downloaded: b.downloaded,
      avgHitScore: b.hitN > 0 ? b.hitSum / b.hitN : null,
    }))
    .sort((a, b) => {
      // DL 率 → 件数の順
      const rateA = a.count > 0 ? a.downloaded / a.count : 0;
      const rateB = b.count > 0 ? b.downloaded / b.count : 0;
      if (rateA !== rateB) return rateB - rateA;
      return b.count - a.count;
    })
    .slice(0, 10);

  // ---- 書き換え top (original → rewritten) ----
  const rewriteMap = new Map<string, { count: number; downloaded: number }>();
  for (const e of events) {
    if (!e.appealOriginalText) continue;
    const orig = e.appealOriginalText.trim();
    const plainFinal = extractPlainAppealText(e.appealText);
    if (!orig || !plainFinal || plainFinal === orig) continue;
    const key = `${orig}\u0000${plainFinal}`;
    const b = rewriteMap.get(key) ?? { count: 0, downloaded: 0 };
    b.count += 1;
    if (e.downloaded) b.downloaded += 1;
    rewriteMap.set(key, b);
  }
  const topRewrites = [...rewriteMap.entries()]
    .map(([key, b]) => {
      const [originalText, rewrittenText] = key.split('\u0000');
      return {
        originalText,
        rewrittenText,
        count: b.count,
        downloaded: b.downloaded,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    genre: g,
    eventCount,
    downloadedCount,
    expandedCount,
    aiEditedCount,
    avgHitScore,
    savedImages,
    hitCopies,
    topKeywords,
    subLabelStats,
    topRewrites,
    generatedAt: new Date(),
  };
}
