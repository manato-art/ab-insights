// Variant A — Editorial Briefing
// 「データを資料として読ませる」 NYT/FT を意識した分析誌風。
// - serif 見出し / 大きい余白 / hairline ルール / オレンジ アクセントを差し色で点で使う
// - 表もストライプを排し、行間を広く取る

import { daily, endpoints, genres, totals, users } from './data';
import { Bars, Donut, SparkLine } from './charts';

const SERIF = '"Source Serif 4", "Iowan Old Style", Georgia, "Times New Roman", "Hiragino Mincho ProN", "Yu Mincho", serif';

const accent = {
  ink: '#1a1813',
  paper: '#faf6ee',
  rule: '#e1d9c6',
  muted: '#7c7468',
  orange: '#dc6a26',
  orangeSoft: '#f3d6bd',
};

export function VariantEditorial() {
  return (
    <article
      className="px-12 py-10"
      style={{
        background: accent.paper,
        color: accent.ink,
        fontFeatureSettings: '"liga", "kern", "tnum"',
      }}
    >
      {/* マストヘッド */}
      <header className="border-b border-current/10 pb-6">
        <div className="flex items-baseline justify-between gap-6">
          <div>
            <div className="text-[11px] tracking-[0.32em] uppercase" style={{ color: accent.muted }}>
              ab-insights — vol. 04 / no. 18
            </div>
            <h1 className="mt-3 text-[44px] leading-[1.05] font-medium" style={{ fontFamily: SERIF, letterSpacing: '-0.01em' }}>
              <span style={{ color: accent.orange }}>制作実績ブリーフ</span>
              <span className="ml-3 text-current/40">/ 2026年4月18日 — 5月1日 (JST)</span>
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-current/70">
              直近2週間で <strong className="text-current">263枚</strong> の画像を <strong className="text-current">80工程</strong> で制作。
              <span className="mx-1">DL</span>確定は <strong className="text-current">15.0%</strong>、 主要ジャンルは「精力剤」 (203枚 / 29.7% DL)。
            </p>
          </div>
          <div className="text-right text-[11px] tracking-widest uppercase" style={{ color: accent.muted }}>
            edited<br />ab.insights
          </div>
        </div>
      </header>

      {/* 主要指標 4 連 */}
      <section className="grid grid-cols-4 gap-0 mt-8">
        {[
          { key: 'images', label: '生成枚数 (期間)', value: totals.imagesRange.toLocaleString(), unit: '枚', sub: `工程 ${totals.eventsRange}` },
          { key: 'all', label: '累計', value: totals.imagesAll.toLocaleString(), unit: '枚', sub: `全期間 / 工程 ${totals.eventsAll}` },
          { key: 'dl', label: 'ダウンロード率', value: `${(totals.dlRate * 100).toFixed(1)}`, unit: '%', sub: `${totals.downloadCount} / ${totals.eventsRange} 工程` },
          { key: 'rate', label: '画像 / 工程', value: (totals.imagesRange / Math.max(1, totals.eventsRange)).toFixed(1), unit: '', sub: '生成密度' },
        ].map((m, i) => (
          <div
            key={m.key}
            className="px-6 py-5"
            style={{ borderLeft: i === 0 ? 'none' : `1px solid ${accent.rule}` }}
          >
            <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: accent.muted }}>{m.label}</div>
            <div className="mt-3 flex items-baseline gap-1.5" style={{ fontFamily: SERIF }}>
              <span className="text-[42px] leading-none tabular-nums">{m.value}</span>
              <span className="text-[14px] text-current/60">{m.unit}</span>
            </div>
            <div className="mt-1.5 text-[12px] tabular-nums" style={{ color: accent.muted }}>
              {m.sub}
            </div>
          </div>
        ))}
      </section>

      <hr className="my-10" style={{ borderColor: accent.rule }} />

      {/* メインチャート + ジャンル */}
      <section className="grid grid-cols-12 gap-10">
        {/* 日別推移 */}
        <div className="col-span-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
              日次の制作量
            </h2>
            <span className="text-[11px] tracking-widest uppercase" style={{ color: accent.muted }}>
              fig. 1 — daily output
            </span>
          </div>
          <p className="mt-1 text-[13px] text-current/60">
            5月1日に 39 工程 / 56 枚で再加速。前週比 +83%。
          </p>
          <div className="mt-5" style={{ color: accent.orange }}>
            <Bars
              data={daily}
              field="images"
              height={150}
              accent={accent.orangeSoft}
              highlight={daily.length - 1}
              highlightAccent={accent.orange}
            />
          </div>
          <div className="mt-1 grid grid-cols-7 text-[10px] tabular-nums" style={{ color: accent.muted }}>
            {daily.filter((_, i) => i % 2 === 0).map((d) => (
              <div key={d.date}>{d.date}</div>
            ))}
          </div>
        </div>

        {/* 構成比 (ジャンル) */}
        <aside className="col-span-4">
          <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
            ジャンル構成
          </h2>
          <p className="mt-1 text-[13px] text-current/60">画像枚数ベース。</p>
          <div className="mt-5 flex items-center gap-6">
            <div style={{ color: accent.ink }}>
              <Donut
                size={140}
                thickness={14}
                data={[
                  { name: '精力剤', value: 203, color: accent.orange },
                  { name: '未分類', value: 36, color: accent.muted },
                  { name: 'テスト', value: 24, color: accent.orangeSoft },
                ]}
              />
            </div>
            <ul className="flex-1 text-[13px]">
              {[
                { name: '精力剤', value: 203, c: accent.orange },
                { name: '未分類', value: 36, c: accent.muted },
                { name: 'テスト', value: 24, c: accent.orangeSoft },
              ].map((s) => (
                <li key={s.name} className="flex items-center gap-2.5 py-1.5 border-b border-current/10 last:border-0">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.c }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="tabular-nums" style={{ fontFamily: SERIF }}>{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <hr className="my-10" style={{ borderColor: accent.rule }} />

      {/* ユーザー一覧 */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
            利用者
          </h2>
          <span className="text-[11px] tracking-widest uppercase" style={{ color: accent.muted }}>
            tbl. 1 — by user
          </span>
        </div>
        <table className="mt-5 w-full text-[13px]">
          <thead>
            <tr className="text-left" style={{ color: accent.muted }}>
              <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2">利用者</th>
              <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">工程</th>
              <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">画像</th>
              <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">DL率</th>
              <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 pl-6">5月の進捗 (上限 1,000枚)</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const ratio = u.quota ? Math.min(1, u.mtd / u.quota) : 0;
              return (
                <tr key={u.id} style={{ borderTop: `1px solid ${accent.rule}` }}>
                  <td className="py-4">
                    <div style={{ fontFamily: SERIF, fontSize: 16 }}>{u.name}</div>
                    <div className="text-[11px] font-mono" style={{ color: accent.muted }}>{u.id}</div>
                  </td>
                  <td className="py-4 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 18 }}>
                    {u.events}
                  </td>
                  <td className="py-4 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 18 }}>
                    {u.images}
                  </td>
                  <td className="py-4 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 18 }}>
                    {(u.dlRate * 100).toFixed(1)}<span className="text-[12px]" style={{ color: accent.muted }}>%</span>
                  </td>
                  <td className="py-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1 rounded" style={{ background: accent.rule }}>
                        <div className="h-full rounded" style={{ width: `${ratio * 100}%`, background: accent.orange }} />
                      </div>
                      <span className="tabular-nums text-[12px]" style={{ color: accent.muted }}>
                        {u.mtd.toLocaleString()} / {u.quota?.toLocaleString() ?? '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <hr className="my-10" style={{ borderColor: accent.rule }} />

      {/* エンドポイント / ジャンル詳細 */}
      <section className="grid grid-cols-2 gap-10">
        <div>
          <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>作業内訳</h2>
          <p className="mt-1 text-[13px] text-current/60">エンドポイント別の工程数 / 画像枚数。</p>
          <table className="mt-5 w-full text-[13px]">
            <thead>
              <tr style={{ color: accent.muted }}>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-left">作業</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">工程</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">画像</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">画像/工程</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.code} style={{ borderTop: `1px solid ${accent.rule}` }}>
                  <td className="py-3.5">
                    <div>{e.label}</div>
                    <div className="text-[11px] font-mono" style={{ color: accent.muted }}>{e.code}</div>
                  </td>
                  <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17 }}>{e.events}</td>
                  <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17, color: accent.orange }}>{e.images}</td>
                  <td className="py-3.5 tabular-nums text-right text-current/70">{(e.images / e.events).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-[22px]" style={{ fontFamily: SERIF, fontWeight: 500 }}>ジャンル別レート</h2>
          <p className="mt-1 text-[13px] text-current/60">DL率 / 平均刺さり度。</p>
          <table className="mt-5 w-full text-[13px]">
            <thead>
              <tr style={{ color: accent.muted }}>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-left">ジャンル</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">画像</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">DL率</th>
                <th className="font-normal text-[10px] tracking-[0.18em] uppercase pb-2 text-right">刺さり</th>
              </tr>
            </thead>
            <tbody>
              {genres.map((g) => (
                <tr key={g.name} style={{ borderTop: `1px solid ${accent.rule}` }}>
                  <td className="py-3.5">{g.name}</td>
                  <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17 }}>{g.images}</td>
                  <td className="py-3.5 tabular-nums text-right" style={{ fontFamily: SERIF, fontSize: 17, color: accent.orange }}>
                    {(g.dlRate * 100).toFixed(1)}<span className="text-[12px]" style={{ color: accent.muted }}>%</span>
                  </td>
                  <td className="py-3.5 tabular-nums text-right">
                    {g.hit == null ? <span style={{ color: accent.muted }}>—</span> : g.hit.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* スパーク 3連 */}
      <section className="mt-12 grid grid-cols-3 gap-8 pt-6" style={{ borderTop: `1px solid ${accent.rule}` }}>
        {[
          { label: '工程', field: 'events' as const, c: accent.ink },
          { label: '画像', field: 'images' as const, c: accent.orange },
          { label: 'DL', field: 'downloads' as const, c: accent.muted },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: accent.muted }}>14日推移 — {s.label}</div>
            <div className="mt-2" style={{ color: s.c }}>
              <SparkLine data={daily} field={s.field} accent={{ stroke: s.c, fill: 'transparent' }} />
            </div>
          </div>
        ))}
      </section>
    </article>
  );
}
