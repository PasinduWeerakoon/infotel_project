import type { HTMLAttributes } from 'react';

/** Frosted glass card, the base of every content block. */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass p-5 ${className}`} {...rest} />;
}

/** Label and value on one line, for small facts like "Next session". */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-2.5 text-[15px] last:border-b-0">
      <span className="font-semibold text-lilac">{label}</span>
      <span className="text-right font-bold text-white">{value}</span>
    </div>
  );
}
