---
name: tailwind-styling
crew: [engineer, architect]
keywords: [样式, style, 美化, UI, 布局]
---

使用 Tailwind CSS CDN 进行样式设计：
- 在 index.html 的 <head> 中引入：<script src="https://cdn.tailwindcss.com"></script>
- 优先使用 Tailwind 工具类，减少自定义 CSS
- 使用深色主题：背景 bg-gray-900/bg-zinc-900，文字 text-white/text-gray-100
- 卡片使用 rounded-xl shadow-lg bg-gray-800/bg-zinc-800
- 按钮使用 rounded-lg px-4 py-2 transition-all hover:scale-105
