// GET /api/export/events.csv
// 工程履歴を CSV でエクスポート。 events ページと同じ searchParams を受け取り、
// 同じフィルタ条件で全件取得する。
// 1 行目: メタ (総工程数 / 総画像枚数 / 期間 / その他条件)
// 2 行目以降: ヘッダ + データ
//
// 認証: admin session が無いと拒否 (ブラウザから ?download で取りに来る前提)。

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import {
  buildEventsFilter,
  describeOtherConditions,
  describeRangeLabel,
  type EventsSearchParams,
} from '@/lib/event-filter';
import { formatJstDateTimeSec, JST_TIMEZONE } from '@/lib/format';
import { combinedFindManyDetail } from '@/lib/event-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CSV 1 セルをエスケープ。 改行 / カンマ / ダブルクォートを含むなら "" で囲む。
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

const HEADER = [
  'ID',
  '日時 (JST)',
  'ユーザー名',
  'ユーザーID',
  '作業種別',
  'ジャンル',
  'サブジャンル',
  '訴求タイプ',
  '訴求文',
  '画像枚数',
  'ダウンロード',
  '横展開',
  'AI編集',
  '再生成回数',
  '刺さり度',
  '評価 (1-5)',
];

const ENDPOINT_LABEL: Record<string, string> = {
  'generate-images': '新規生成',
  'generate-similar-one': '横展開',
  'improve-images': '改善',
  'edit-region': 'AI部分修正',
  'transform-image': '変形',
  'generate-reference': '参考広告ベース',
  'stylize-product': 'スタイル変換',
  'upscale-image': '画質向上',
  'resize-image': 'リサイズ',
};

export async function GET(req: NextRequest) {
  // 認証
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: '認証が必要です' },
      { status: 401 },
    );
  }

  // searchParams を SP オブジェクトに
  const sp: EventsSearchParams = {};
  for (const k of [
    'genre',
    'endpoint',
    'user',
    'userId',
    'period',
    'from',
    'to',
    'downloaded',
    'horizontallyExpanded',
  ] as const) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) sp[k] = v;
  }

  const filter = buildEventsFilter(sp);

  // Event ∪ ArchivedEvent から全件取得 → 集計
  const rows = await combinedFindManyDetail(filter.where);
  const totalEvents = rows.length;
  const totalImages = rows.reduce((s, r) => s + r.imageCount, 0);
  const rangeLabel = describeRangeLabel(filter);
  const others = describeOtherConditions(sp);

  // ===== CSV 構築 =====
  const lines: string[] = [];

  // 1 行目: 期間と総数 (ユーザー要望: 1番上には総生成数とその期間)
  lines.push(`# ab-insights 工程エクスポート`);
  lines.push(`# 期間,${csvCell(rangeLabel)}`);
  lines.push(`# 総工程数,${totalEvents}`);
  lines.push(`# 総画像枚数,${totalImages}`);
  lines.push(`# 出力日時 (JST),${csvCell(formatJstDateTimeSec(new Date()))}`);
  lines.push(`# タイムゾーン,${JST_TIMEZONE}`);
  for (const o of others) lines.push(`# ${csvCell(o)}`);
  lines.push(''); // 区切り

  // ヘッダ
  lines.push(csvRow(HEADER));

  // データ
  for (const r of rows) {
    lines.push(
      csvRow([
        r.displayId,
        formatJstDateTimeSec(r.createdAt),
        r.abSystemUserName ?? '',
        r.abSystemUserId,
        ENDPOINT_LABEL[r.endpoint] ?? r.endpoint,
        r.genre ?? '',
        r.subGenre ?? '',
        r.appealType ?? '',
        r.appealText ?? '',
        r.imageCount,
        r.downloaded ? 'はい' : '',
        r.horizontallyExpanded ? 'はい' : '',
        r.aiEdited ? 'はい' : '',
        r.regeneratedCount,
        r.hitScore !== null ? r.hitScore.toFixed(2) : '',
        r.rating ?? '',
      ]),
    );
  }

  // Excel が UTF-8 を正しく開けるよう BOM を付ける
  const body = '﻿' + lines.join('\r\n');

  // ファイル名: events_YYYYMMDD_HHmm.csv
  const stamp = formatJstDateTimeSec(new Date())
    .replace(/[/: ]/g, '')
    .replace(/(\d{8})(\d{6})/, '$1_$2');
  const filename = `events_${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
