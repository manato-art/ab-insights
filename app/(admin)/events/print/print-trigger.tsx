'use client';

// 「印刷 / PDF 保存」 ボタン。 ブラウザの印刷ダイアログを開く。
// ユーザーは印刷先で「PDF として保存」 を選ぶと PDF 化できる。

export default function PrintTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
    >
      印刷 / PDF 保存
    </button>
  );
}
