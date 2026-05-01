// 装飾用の背景。柔らかい色のブロブが ゆっくり浮遊する。
// Server-renderable (CSS only — JS なし)。
// 親要素に position: relative を持たせること。

// blob 配色は CSS 変数経由なので、テーマカラー切替で自動連動する。
const BLOBS = [
  {
    cls: 'blob blob-1',
    style: {
      width: '520px',
      height: '520px',
      top: '-120px',
      left: '-160px',
      background: 'var(--accent)',
    },
  },
  {
    cls: 'blob blob-2',
    style: {
      width: '420px',
      height: '420px',
      top: '20%',
      right: '-140px',
      background: 'var(--brand-orange-soft)',
    },
  },
  {
    cls: 'blob blob-3',
    style: {
      width: '380px',
      height: '380px',
      bottom: '-100px',
      left: '30%',
      background: 'var(--brand-navy-soft)',
    },
  },
  {
    cls: 'blob blob-4',
    style: {
      width: '280px',
      height: '280px',
      top: '55%',
      left: '8%',
      background: 'oklch(0.92 0.025 80)',
    },
  },
] as const;

export function BackgroundBlobs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {BLOBS.map((b) => (
        <span
          key={b.cls}
          className={b.cls}
          style={{
            position: 'absolute',
            borderRadius: '50%',
            filter: 'blur(70px)',
            opacity: 0.45,
            mixBlendMode: 'multiply',
            ...b.style,
          }}
        />
      ))}
    </div>
  );
}
