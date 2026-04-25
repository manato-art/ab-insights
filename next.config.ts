import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev mode の右下に出る Next.js インジケーター(N アイコン)を非表示。
  // Next.js 公式 UI なのでラベル日本語化できないため、まるごと隠す方針。
  devIndicators: false,
};

export default nextConfig;
