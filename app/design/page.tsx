// /design — UI 比較ビュー
// editorial / console の 2 案を縦に並べる。クエリ ?v=editorial / ?v=console で単独表示にも切り替え可能。

import Link from 'next/link';
import { VariantEditorial } from './editorial';
import { VariantConsole } from './console';

export const dynamic = 'force-static';

type SP = Promise<{ v?: string }>;

export default async function DesignPage({ searchParams }: { searchParams: SP }) {
  const { v } = await searchParams;
  const showEditorial = !v || v === 'editorial' || v === 'all';
  const showConsole = !v || v === 'console' || v === 'all';

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* セクションナビ */}
      <div className="sticky top-0 z-50 bg-white border-b border-neutral-200">
        <div className="px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] tracking-[0.32em] uppercase text-neutral-500">ab.insights / design lab</span>
            <span className="text-neutral-300">·</span>
            <span className="text-[12px] text-neutral-700">UI 比較ビュー — モックデータ</span>
          </div>
          <nav className="flex items-center gap-1 text-[12px]">
            <NavTab href="/design" label="両方" active={!v || v === 'all'} />
            <NavTab href="/design?v=editorial" label="A · Editorial" active={v === 'editorial'} />
            <NavTab href="/design?v=console" label="B · Console" active={v === 'console'} />
            <span className="ml-3 text-neutral-300">|</span>
            <Link href="/" className="ml-3 text-[11px] text-neutral-500 hover:text-neutral-900">本番 ↗</Link>
          </nav>
        </div>
      </div>

      {showEditorial && (
        <SectionLabel title="案 A — Editorial Briefing" subtitle="制作実績を「分析誌」のように読ませる。serif / 余白 / hairline / オレンジ点アクセント。" />
      )}
      {showEditorial && (
        <div className="border-y border-neutral-200">
          <VariantEditorial />
        </div>
      )}

      {showConsole && (
        <SectionLabel title="案 B — Operations Console" subtitle="分析eye 系のチャート駆動 + editorial typography のハイブリッド。オレンジ + ネイビーの 3 色構成。" />
      )}
      {showConsole && (
        <div className="border-y border-neutral-200">
          <VariantConsole />
        </div>
      )}

      <footer className="px-6 py-8 text-[11px] text-neutral-500">
        コピー / 2026 ab.insights design lab — frontend-design + baseline-ui を踏まえた比較案
      </footer>
    </div>
  );
}

function NavTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="px-3 h-8 inline-flex items-center rounded transition"
      style={{
        background: active ? '#1a1813' : 'transparent',
        color: active ? '#fff' : '#525252',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </Link>
  );
}

function SectionLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-neutral-100 px-6 py-6">
      <div className="text-[10px] tracking-[0.32em] uppercase text-neutral-500">変更案</div>
      <h2 className="mt-1 text-[20px] font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 text-[13px] text-neutral-600 max-w-[80ch]">{subtitle}</p>
    </div>
  );
}
