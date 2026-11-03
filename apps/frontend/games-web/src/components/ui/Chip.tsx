import type { ReactNode } from 'react';

/** Small glass pill for short facts. */
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' }) {
  return (
    <span
      className={`glass inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-bold ${
        tone === 'gold' ? 'text-sun' : 'text-haze'
      }`}
    >
      {children}
    </span>
  );
}
