"use client";

// 品牌图标：三节点串联，呼应"智能体接力"主题
export default function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* 连线 */}
      <path
        d="M6 7 L12 12 L18 17"
        stroke="url(#relay-line)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* 三个节点 */}
      <circle cx="6" cy="7" r="3" fill="url(#relay-n1)" />
      <circle cx="12" cy="12" r="3.2" fill="url(#relay-n2)" />
      <circle cx="18" cy="17" r="3" fill="url(#relay-n1)" />
      <defs>
        <linearGradient id="relay-line" x1="6" y1="7" x2="18" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="relay-n1" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="relay-n2" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
