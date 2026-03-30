'use client';

import { useLayoutEffect, useState } from 'react';

/** 与实验室首页一致：窄屏单列；sm～lg 三列；lg+ 五列 */
export function useFeedGridColumnCount(): number {
  const [n, setN] = useState(1);
  useLayoutEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1024) setN(5);
      else if (w >= 640) setN(3);
      else setN(1);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return n;
}
