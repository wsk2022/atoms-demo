import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relay — 你的 AI 团队",
  description: "6 个 AI 智能体接力协作，把一句话变成可运行的应用",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
