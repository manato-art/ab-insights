// Variant B — Operations Console (with Editorial Soul)
// 「分析eye 風のチャート駆動 + 上品な editorial typography + オレンジ accent」のハイブリッド。
// - 上部にツール固有ヘッダー (パン屑 / 時計 / ユーザー)
// - 左サイドバー (アイコン付き)
// - メインは カード + チャート 主体、表は補助
// - オレンジ + ネイビー + クリームの 3 色で構成

import { daily, endpoints, genres, totals, users } from './data';
import { Bars, Donut, QuotaBar, SparkLine, StackBars } from './charts';

const SERIF = '"Source Serif 4", "Iowan Old Style", Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", serif';

const c = {
  bg: '#f7f3ec',
  panel: '#ffffff',
  ink: '#16161a',
  muted: '#78736b',
  hairline: '#e6dfd0',
  orange: '#e2691f',
  orangeSoft: '#f7c89a',
  navy: '#1f2c50',
  navySoft: '#bcc4d8',
};

function CardChrome({ title, fig, children }: { title: string; fig?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] bg-white p-5" style={{ boxShadow: '0 1px 0 rgba(20,20,20,0.04), 0 0 0 1px rgba(20,20,20,0.05)' }}>
      <header className="flex items-baseline justify-between mb-4">
        <h3 className="text-[16px]" style={{ fontFamily: SERIF, fontWeight: 600 }}>{title}</h3>
        {fig && <span className="text-[10px] tracking-[0.22em] uppercase" style={{ color: c.muted }}>{fig}</span>}
      </header>
      {children}
    </section>
  );
}

export function VariantConsole() {
  return (
    <div className="flex" style={{ background: c.bg, color: c.ink, minHeight: 720 }}>
      {/* SIDEBAR */}
      <aside className="w-56 shrink-0 border-r" style={{ borderColor: c.hairline, background: c.panel }}>
        <div className="px-5 py-5 flex items-center gap-3 border-b" style={{ borderColor: c.hairline }}>
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: c.orange, color: 'white', fontFamily: SERIF, fontSize: 18, fontWeight: 700 }}>ab</div>
          <div>
            <div className="text-[15px]" style={{ fontFamily: SERIF, fontWeight: 600 }}>ab.insights</div>
            <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: c.muted }}>console</div>
          </div>
        </div>
        <nav className="py-2 text-[13px]">
          {[
            { ic: '◆', label: 'ダッシュボード', active: true },
            { ic: '○', label: 'ユーザー' },
            { ic: '○', label: '訴求ポイント' },
            { ic: '○', label: 'AI 修正指示' },
            { ic: '○', label: 'ジャンル転移' },
            { ic: '○', label: 'プロンプト' },
            { ic: '○', label: '学習アップロード' },
            { ic: '○', label: '工程履歴' },
            { ic: '○', label: 'Supabase' },
            { ic: '○', label: '設定' },
          ].map((item) => (
            <a
              key={item.label}
              className="flex items-center gap-3 px-5 py-2 transition"
              style={{
                color: item.active ? c.ink : c.ink + 'cc',
                background: item.active ? '#fbe9d7' : 'transparent',
                borderLeft: `2px solid ${item.active ? c.orange : 'transparent'}`,
                fontWeight: item.active ? 600 : 400,
              }}
            >
              <span style={{ color: item.active ? c.orange : c.muted, width: 16, display: 'inline-block' }}>{item.ic}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0">
        {/* TOPBAR */}
        <div className="flex items-center justify-between px-8 h-14 border-b" style={{ borderColor: c.hairline, background: c.panel }}>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: c.muted }}>
            <span>ダッシュボード</span>
            <span>›</span>
            <span style={{ color: c.ink }}>制作実績</span>
            <span className="ml-4 px-2 py-0.5 text-[10px] tracking-widest uppercase rounded" style={{ background: '#fce8d6', color: c.orange }}>live</span>
          </div>
          <div className="flex items-center gap-5 text-[12px]" style={{ color: c.muted }}>
            <span className="tabular-nums">2026/05/01 (金) 21:32 JST</span>
            <span className="w-px h-4" style={{ background: c.hairline }} />
            <span className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: c.navy, color: 'white', fontSize: 11, fontWeight: 600 }}>m</span>
              manato
            </span>
          </div>
        </div>

        <main className="p-8 space-y-6">
          {/* タイトル + フィルタ */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] tracking-[0.32em] uppercase" style={{ color: c.muted }}>vol. 04 / no. 18</div>
              <h1 className="mt-2 text-[34px] leading-tight" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                <span style={{ color: c.orange }}>制作実績</span>
                <span className="ml-2 text-current/40">2026年4月18日 — 5月1日</span>
              </h1>
            </div>
            <div className="flex gap-1 p-1 rounded-md" style={{ background: c.panel, border: `1px solid ${c.hairline}` }}>
              {['全期間', '本日', '今週', '今月', 'カスタム'].map((p, i) => (
                <button
                  key={p}
                  className="px-3 h-7 text-[12px] rounded"
                  style={{
                    background: i === 0 ? c.ink : 'transparent',
                    color: i === 0 ? 'white' : c.muted,
                    fontWeight: i === 0 ? 600 : 400,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* KPI 4連 */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: '生成枚数', value: '263', unit: '枚', sub: '+18% MoM', accent: c.orange },
              { label: '工程数', value: '80', unit: '', sub: '画像 / 工程 = 3.3', accent: c.ink },
              { label: 'DL 率', value: '15.0', unit: '%', sub: '12 / 80 工程', accent: c.navy },
              { label: 'AI 編集率', value: '48.8', unit: '%', sub: '39 / 80 工程', accent: c.muted },
            ].map((m, i) => (
              <div key={m.label} className="rounded-[14px] p-5 relative overflow-hidden" style={{ background: c.panel, boxShadow: '0 1px 0 rgba(20,20,20,0.04), 0 0 0 1px rgba(20,20,20,0.05)' }}>
                <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: c.muted }}>{m.label}</div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span style={{ fontFamily: SERIF, fontSize: 40, lineHeight: 1, color: m.accent, fontWeight: 500 }}>{m.value}</span>
                  <span className="text-[14px]" style={{ color: c.muted }}>{m.unit}</span>
                </div>
                <div className="mt-2 text-[12px]" style={{ color: c.muted }}>{m.sub}</div>
                <div className="absolute right-3 top-3 flex gap-1">
                  <button className="w-6 h-6 rounded text-[11px]" style={{ color: c.muted, background: '#f5f0e6' }}>↗</button>
                </div>
                <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-30" style={{ background: i === 0 ? c.orangeSoft : i === 2 ? c.navySoft : 'transparent' }} />
              </div>
            ))}
          </div>

          {/* メインチャート + ジャンル */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8">
              <CardChrome title="日次の制作量と DL" fig="fig. 1 — daily output">
                <div className="flex items-center gap-4 mb-3 text-[11px]" style={{ color: c.muted }}>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: c.navySoft }} />画像</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: c.orange }} />DL 内訳</span>
                  <span className="ml-auto">peak: 5月1日 / 39 工程</span>
                </div>
                <StackBars data={daily} fills={{ events: c.navySoft, downloads: c.orange }} height={170} />
                <div className="mt-1 grid grid-cols-7 text-[10px] tabular-nums" style={{ color: c.muted }}>
                  {daily.filter((_, i) => i % 2 === 0).map((d) => (
                    <div key={d.date}>{d.date}</div>
                  ))}
                </div>
              </CardChrome>
            </div>
            <div className="col-span-4">
              <CardChrome title="ジャンル構成" fig="fig. 2 — genre mix">
                <div className="flex items-center gap-5">
                  <div style={{ color: c.ink }}>
                    <Donut size={130} thickness={14} data={[
                      { name: '精力剤', value: 203, color: c.orange },
                      { name: '未分類', value: 36, color: c.navy },
                      { name: 'テスト', value: 24, color: c.orangeSoft },
                    ]} />
                  </div>
                  <ul className="flex-1 text-[12px]">
                    {[
                      { name: '精力剤', value: 203, c: c.orange },
                      { name: '未分類', value: 36, c: c.navy },
                      { name: 'テスト', value: 24, c: c.orangeSoft },
                    ].map((s) => (
                      <li key={s.name} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: c.hairline }}>
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.c }} />
                        <span className="flex-1">{s.name}</span>
                        <span className="tabular-nums" style={{ fontFamily: SERIF, fontSize: 14 }}>{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardChrome>
            </div>
          </div>

          {/* スパーク3連 */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '工程数 14日', field: 'events' as const, color: c.ink, fill: '#e3dfd5' },
              { label: '画像枚数 14日', field: 'images' as const, color: c.orange, fill: '#fce8d6' },
              { label: 'DL 14日', field: 'downloads' as const, color: c.navy, fill: c.navySoft },
            ].map((s) => (
              <CardChrome key={s.label} title={s.label}>
                <div style={{ color: s.color }}>
                  <SparkLine data={daily} field={s.field} accent={{ stroke: s.color, fill: s.fill }} height={70} />
                </div>
              </CardChrome>
            ))}
          </div>

          {/* ユーザー一覧 (上限バー込み) */}
          <CardChrome title="ユーザー別実績 — 5月の上限進捗" fig="tbl. 1 — by user, MTD">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ color: c.muted }}>
                  <th className="font-normal text-[10px] tracking-[0.2em] uppercase text-left pb-2">利用者</th>
                  <th className="font-normal text-[10px] tracking-[0.2em] uppercase text-right pb-2">画像 (累計)</th>
                  <th className="font-normal text-[10px] tracking-[0.2em] uppercase text-right pb-2">DL率</th>
                  <th className="font-normal text-[10px] tracking-[0.2em] uppercase text-right pb-2">5月使用</th>
                  <th className="font-normal text-[10px] tracking-[0.2em] uppercase text-left pb-2 pl-6 w-[40%]">残量</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: `1px solid ${c.hairline}` }}>
                    <td className="py-3.5">
                      <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500 }}>{u.name}</div>
                      <div className="text-[11px] font-mono" style={{ color: c.muted }}>{u.id}</div>
                    </td>
                    <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17 }}>{u.images}</td>
                    <td className="py-3.5 tabular-nums text-right">{(u.dlRate * 100).toFixed(1)}%</td>
                    <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17, color: c.orange }}>{u.mtd}</td>
                    <td className="py-3.5 pl-6">
                      <div className="flex items-center gap-3" style={{ color: c.ink }}>
                        <div className="flex-1">
                          <QuotaBar used={u.mtd} quota={u.quota} accent={c.orange} warnAccent={'#c63b1d'} />
                        </div>
                        <span className="text-[11px] tabular-nums" style={{ color: c.muted }}>
                          {u.quota ? `${u.mtd}/${u.quota}` : '上限なし'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardChrome>

          {/* 作業内訳 + ジャンル詳細 */}
          <div className="grid grid-cols-2 gap-4">
            <CardChrome title="作業内訳" fig="endpoints">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: c.muted }}>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-left pb-2">作業</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">工程</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">画像</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">画像/工程</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((e) => (
                    <tr key={e.code} style={{ borderTop: `1px solid ${c.hairline}` }}>
                      <td className="py-3">
                        <div>{e.label}</div>
                        <div className="text-[11px] font-mono" style={{ color: c.muted }}>{e.code}</div>
                      </td>
                      <td className="py-3 text-right tabular-nums" style={{ fontFamily: SERIF, fontSize: 16 }}>{e.events}</td>
                      <td className="py-3 text-right tabular-nums" style={{ fontFamily: SERIF, fontSize: 16, color: c.orange }}>{e.images}</td>
                      <td className="py-3 text-right tabular-nums">{(e.images / e.events).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardChrome>

            <CardChrome title="ジャンル別レート" fig="genre rates">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: c.muted }}>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-left pb-2">ジャンル</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">画像</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">DL率</th>
                    <th className="font-normal text-[10px] tracking-[0.18em] uppercase text-right pb-2">刺さり</th>
                  </tr>
                </thead>
                <tbody>
                  {genres.map((g) => (
                    <tr key={g.name} style={{ borderTop: `1px solid ${c.hairline}` }}>
                      <td className="py-3">{g.name}</td>
                      <td className="py-3 text-right tabular-nums" style={{ fontFamily: SERIF, fontSize: 16 }}>{g.images}</td>
                      <td className="py-3 text-right tabular-nums" style={{ fontFamily: SERIF, fontSize: 16, color: c.orange }}>
                        {(g.dlRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right tabular-nums">{g.hit == null ? <span style={{ color: c.muted }}>—</span> : g.hit.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardChrome>
          </div>
        </main>
      </div>
    </div>
  );
}
