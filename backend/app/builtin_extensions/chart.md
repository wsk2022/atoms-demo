---
name: chart-builder
crew: [engineer]
keywords: [图表, chart, 可视化, 统计, 饼图, 柱状图, 折线图]
---

当需要生成图表时：
- 使用 Chart.js CDN：<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
- 创建 <canvas> 元素，使用 new Chart() 初始化
- 支持的类型：bar, line, pie, doughnut, radar, polarArea
- 配色使用与页面主题一致的深色系
- 图表容器需要设置合理的 max-width 和 aspect-ratio
