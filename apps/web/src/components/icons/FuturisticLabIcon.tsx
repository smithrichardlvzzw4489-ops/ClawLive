'use client';

import { useId } from 'react';

/**
 * 未来科技感实验室：HUD 角标 + 锥形烧瓶 + 反应光核（紫青渐变）
 */
export function FuturisticLabIcon({ className = 'h-6 w-6' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const strokeId = `futLabStroke-${uid}`;
  const fillId = `futLabFill-${uid}`;
  const glowId = `futLabGlow-${uid}`;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={strokeId} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a5b4fc" />
          <stop offset="0.45" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#c084fc" />
        </linearGradient>
        <linearGradient id={fillId} x1="12" y1="18" x2="12" y2="7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" stopOpacity="0.14" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0.22" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* HUD 角标 */}
      <path
        d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
        stroke={`url(#${strokeId})`}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      />

      {/* 锥形瓶轮廓 + 液体区 */}
      <path
        d="M12 4.2v2.3M9 7.2h6v.85l-2.05 7.35c-.2.7-.3 1.15-.3 1.5 0 .85-.75 1.55-1.65 1.55h-.4c-.9 0-1.65-.7-1.65-1.55 0-.35-.1-.8-.3-1.5L9 8.05V7.2z"
        stroke={`url(#${strokeId})`}
        strokeWidth="1.1"
        strokeLinejoin="round"
        fill={`url(#${fillId})`}
      />

      {/* 反应核 */}
      <circle cx="12" cy="16.2" r="1.35" fill="#22d3ee" opacity={0.88} filter={`url(#${glowId})`} />
      <circle cx="12" cy="16.2" r="0.45" fill="#ecfeff" />

      {/* 扫描线点缀 */}
      <path
        d="M7.5 12h2M14.5 12h2"
        stroke={`url(#${strokeId})`}
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  );
}
