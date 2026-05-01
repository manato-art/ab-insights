// 印刷ビュー (Server Component)
// /events ページと同じ searchParams を受け取り、 全件 + メタを 1 ページレイアウトで出す。
// 「ブラウザの印刷 → PDF として保存」 で PDF 化する想定。
//
// 印刷時は @media print で余分な UI を消し、 ヘッダ/タイトル/総数を 1 番上に固定する。

import Link from 'next/link';
import { prisma } from '@/lib/db';
import {
  buildEventsFilter,
  describeOtherConditions,
  describeRangeLabel,
  type EventsSearchParams,
} from '@/lib/event-filter';
import { formatJstDateTimeSec, formatJstShortDateTime } from '@/lib/format';
import PrintTrigger from './print-trigger';

export const dynamic = 'force-dynamic';
export const metadata = { title: '工程レポート (印刷) — ab-insights' };

const ENDPOINT_LABEL: Record<string, string> = {
  'generate-images': '新規生成',
  'generate-similar-one': '横展開',
  'improve-images': '改善',
  'edit-region': 'AI部分修正',
};

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<EventsSearchParams>;
}) {
  const sp = await searchParams;
  const filter = buildEventsFilter(sp);

  const [totalEvents, imageAgg, rows] = await Promise.all([
    prisma.event.count({ where: filter.where }),
    prisma.event.aggregate({
      where: filter.where,
      _sum: { imageCount: true },
    }),
    prisma.event.findMany({
      where: filter.where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        abSystemUserId: true,
        abSystemUserName: true,
        endpoint: true,
        genre: true,
        appealType: true,
        appealText: true,
        imageCount: true,
        downloaded: true,
        horizontallyExpanded: true,
        aiEdited: true,
        hitScore: true,
      },
    }),
  ]);

  const totalImages = imageAgg._sum.imageCount ?? 0;
  const rangeLabel = describeRangeLabel(filter);
  const others = describeOtherConditions(sp);

  return (
    <div className="print-root max-w-[1080px] mx-auto p-6 text-[12px] leading-relaxed text-black bg-white">
      {/* 印刷用 CSS。 サイドバー等の UI を消し、ページ全体を A4 横向き相当で印刷。 */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { background: #fff !important; }
          .print-hide { display: none !important; }
          aside, header, nav { display: none !important; }
          .print-root { padding: 0 !important; max-width: none !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

      {/* 操作バー (印刷時は非表示) */}
      <div className="print-hide flex items-center gap-3 mb-4">
        <PrintTrigger />
        <Link
          href="/events"
          className="h-8 inline-flex items-center px-3 rounded-md border border-input text-xs hover:bg-accent"
        >
          ← 一覧に戻る
        </Link>
        <span className="text-xs text-muted-foreground">
          ブラウザの印刷から「PDF として保存」で出力できます
        </span>
      </div>

      {/* ヘッダ: 1番上に総生成数と期間 (ユーザー要望) */}
      <header className="border-b-2 border-black pb-3 mb-4">
        <h1 className="text-[18px] font-bold mb-2">ab-insights 工程レポート</h1>
        <div className="grid grid-cols-3 gap-3">
          <Box label="期間 (JST)" value={rangeLabel} />
          <Box label="総工程数" value={`${totalEvents.toLocaleString()} 工程`} />
          <Box
            label="総生成画像枚数"
            value={`${totalImages.toLocaleString()} 枚`}
            accent
          />
        </div>
        {others.length > 0 && (
          <div className="mt-3 text-[11px] text-gray-700">
            <strong>絞り込み:</strong> {others.join(' / ')}
          </div>
        )}
        <div className="mt-1 text-[10px] text-gray-500">
          出力日時 (JST): {formatJstDateTimeSec(new Date())}
        </div>
      </header>

      {/* 工程テーブル */}
      {rows.length === 0 ? (
        <p className="text-center text-gray-500 py-10">
          条件に合致する工程はありません
        </p>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b-2 border-black bg-gray-100">
              <Th>ID</Th>
              <Th>日時 (JST)</Th>
              <Th>ユーザー</Th>
              <Th>種別</Th>
              <Th>ジャンル</Th>
              <Th>訴求</Th>
              <Th className="text-right">枚数</Th>
              <Th>シグナル</Th>
              <Th className="text-right">刺さり度</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-300">
                <Td className="font-mono text-gray-500">#{r.id}</Td>
                <Td className="font-mono whitespace-nowrap">
                  {formatJstShortDateTime(r.createdAt)}
                </Td>
                <Td>{r.abSystemUserName ?? r.abSystemUserId}</Td>
                <Td>{ENDPOINT_LABEL[r.endpoint] ?? r.endpoint}</Td>
                <Td>{r.genre ?? '—'}</Td>
                <Td className="max-w-[260px] truncate">
                  {r.appealType ? `[${r.appealType}] ` : ''}
                  {r.appealText ?? '—'}
                </Td>
                <Td className="text-right tabular-nums font-semibold">
                  {r.imageCount}
                </Td>
                <Td className="whitespace-nowrap">
                  {[
                    r.downloaded && 'DL',
                    r.horizontallyExpanded && '横展開',
                    r.aiEdited && 'AI編集',
                  ]
                    .filter(Boolean)
                    .join(' / ') || '—'}
                </Td>
                <Td className="text-right tabular-nums">
                  {r.hitScore !== null ? r.hitScore.toFixed(2) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-4 pt-2 border-t border-gray-300 text-[10px] text-gray-500 text-center">
        ab-insights / 工程数 {totalEvents.toLocaleString()} 件 / 画像{' '}
        {totalImages.toLocaleString()} 枚
      </footer>
    </div>
  );
}

function Box({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-gray-400 rounded p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-600">
        {label}
      </div>
      <div
        className={`tabular-nums pt-0.5 ${
          accent ? 'text-[18px] font-bold' : 'text-[14px] font-semibold'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`text-left font-semibold px-2 py-1.5 ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-2 py-1 align-top ${className}`}>{children}</td>;
}
