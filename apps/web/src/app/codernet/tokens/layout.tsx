import { Suspense } from 'react';

export default function CodernetTokensLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[40vh] bg-[#06080f]" aria-hidden />}>{children}</Suspense>
  );
}
