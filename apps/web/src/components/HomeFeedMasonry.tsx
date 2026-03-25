'use client';

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** 与外层 `gap-4` 一致，用于列累计高度估算 */
const GAP_PX = 16;

/** 未量到高度前用占位，避免全部堆进第一列 */
const FALLBACK_ITEM_HEIGHT = 300;

export type MasonryItem = { id: string; node: ReactNode };

/**
 * 按时间/接口顺序依次放入「当前累计高度最低」的一列（小红书 / Pinterest 常用策略）。
 */
function distributeShortestColumn(heights: number[], columnCount: number): number[][] {
  const n = heights.length;
  if (n === 0) return [];
  if (columnCount <= 1) {
    return [Array.from({ length: n }, (_, i) => i)];
  }

  const cols: number[][] = Array.from({ length: columnCount }, () => []);
  const colHeights = Array(columnCount).fill(0);

  for (let i = 0; i < n; i++) {
    const h = heights[i];
    let bestCol = 0;
    for (let c = 1; c < columnCount; c++) {
      if (colHeights[c] < colHeights[bestCol]) bestCol = c;
    }
    cols[bestCol].push(i);
    colHeights[bestCol] += h + GAP_PX;
  }
  return cols;
}

function MeasureSlot({
  index,
  children,
  onHeight,
}: {
  index: number;
  children: ReactNode;
  onHeight: (index: number, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      onHeight(index, el.offsetHeight);
    });
    ro.observe(el);
    onHeight(index, el.offsetHeight);
    return () => ro.disconnect();
  }, [index, onHeight]);

  return (
    <div ref={ref} className="min-w-0 w-full">
      {children}
    </div>
  );
}

export function HomeFeedMasonry({
  items,
  columnCount,
}: {
  items: MasonryItem[];
  columnCount: number;
}) {
  const [heights, setHeights] = useState<number[]>(() => items.map(() => 0));

  useLayoutEffect(() => {
    setHeights((prev) => {
      if (prev.length === items.length) return prev;
      const next = new Array(items.length).fill(0);
      for (let i = 0; i < Math.min(prev.length, items.length); i++) next[i] = prev[i];
      return next;
    });
  }, [items.length]);

  const onHeight = useCallback((index: number, h: number) => {
    if (h <= 0) return;
    setHeights((prev) => {
      if (prev[index] === h) return prev;
      const next = [...prev];
      next[index] = h;
      return next;
    });
  }, []);

  const buckets = useMemo(() => {
    if (items.length === 0) return [];
    const cols = Math.min(columnCount, items.length);
    const effective = heights.map((h) => (h > 8 ? h : FALLBACK_ITEM_HEIGHT));
    return distributeShortestColumn(effective, cols);
  }, [heights, items.length, columnCount]);

  if (items.length === 0) return null;

  const effectiveCols = Math.min(columnCount, items.length);

  return (
    <div className="flex w-full gap-4">
      {Array.from({ length: effectiveCols }, (_, colIdx) => (
        <div key={colIdx} className="flex min-w-0 flex-1 flex-col gap-4">
          {(buckets[colIdx] ?? []).map((idx) => (
            <MeasureSlot key={items[idx].id} index={idx} onHeight={onHeight}>
              {items[idx].node}
            </MeasureSlot>
          ))}
        </div>
      ))}
    </div>
  );
}
