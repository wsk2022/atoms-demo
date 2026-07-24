/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 深色主题
        bg: "#09090b",          // 页面底色（zinc-950）
        panel: "#0f0f12",        // 面板/卡片底
        panel2: "#16161a",       // 次级面板
        ink: "#fafafa",          // 主文字
        sub: "#a1a1aa",          // 次级文字
        faint: "#52525b",        // 更弱
        line: "#27272a",         // 边框
        soft: "#18181b",         // 浅背景（在深色里是稍亮的层）
        accent: "#34d399",       // 强调：青绿
        accent2: "#22d3ee",      // 强调2：青
        danger: "#f87171",
        warn: "#fbbf24",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(52,211,153,.25), 0 8px 40px -8px rgba(52,211,153,.35)",
        panel: "0 1px 0 0 rgba(255,255,255,.04) inset, 0 12px 40px -12px rgba(0,0,0,.6)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(52,211,153,.10), transparent 60%)",
        "grad-accent":
          "linear-gradient(135deg, #34d399 0%, #22d3ee 100%)",
      },
      keyframes: {
        pulseDot: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".4", transform: "scale(.85)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.2s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
