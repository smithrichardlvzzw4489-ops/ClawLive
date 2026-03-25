'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_Y = 'clawlive-lobster-y-pct';

/**
 * 全局左侧：半露龙虾吉祥物，周期「冒头」，可纵向拖动；所有页面可见。
 */
export function PeekLobsterMascot() {
  const [topPct, setTopPct] = useState(48);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, startY: 0, startTopPct: 48 });
  const latestPctRef = useRef(48);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_Y);
      if (raw) {
        const n = parseFloat(raw);
        if (!Number.isNaN(n) && n >= 8 && n <= 92) {
          setTopPct(n);
          latestPctRef.current = n;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((pct: number) => {
    try {
      localStorage.setItem(STORAGE_Y, String(Math.round(pct * 10) / 10));
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { active: true, startY: e.clientY, startTopPct: latestPctRef.current };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const dh = e.clientY - drag.current.startY;
    const pxFromTop = (drag.current.startTopPct / 100) * vh + dh;
    const pct = Math.min(92, Math.max(8, (pxFromTop / vh) * 100));
    latestPctRef.current = pct;
    setTopPct(pct);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    persist(latestPctRef.current);
    setDragging(false);
  };

  return (
    <div
      className="pointer-events-none fixed left-0 z-[35] print:hidden"
      style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
      aria-hidden
    >
      <div
        role="presentation"
        className="pointer-events-auto animate-lobster-peek cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ animationPlayState: dragging ? 'paused' : 'running' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="拖我上下移动"
      >
        <Image
          src="/images/lobster-mascot.png"
          alt=""
          width={112}
          height={112}
          className="h-[4.5rem] w-[4.5rem] drop-shadow-[0_6px_16px_rgba(0,0,0,0.18)] sm:h-28 sm:w-28"
          draggable={false}
          priority={false}
        />
      </div>
    </div>
  );
}
