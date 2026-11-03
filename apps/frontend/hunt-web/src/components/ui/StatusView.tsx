/**
 * The message used by every "you cannot play right now" page: a glossy sticker icon,
 * a big friendly headline, one short sentence and optional facts in a glass card.
 */
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Card, InfoRow } from './Card';

export type Tone = 'info' | 'warning' | 'success' | 'danger';

const stickers: Record<Tone, string> = {
  info: 'from-sky to-grape shadow-[0_10px_30px_-8px_rgb(56_182_255/0.7)]',
  warning: 'from-sun-light to-tangerine shadow-[0_10px_30px_-8px_rgb(255_138_30/0.7)]',
  success: 'from-mint to-sky shadow-[0_10px_30px_-8px_rgb(34_217_142/0.7)]',
  danger: 'from-coral to-candy shadow-[0_10px_30px_-8px_rgb(255_84_112/0.7)]',
};

interface StatusViewProps {
  icon: Icon;
  tone?: Tone;
  /** Small label above the headline */
  label?: string;
  title: string;
  body: string;
  facts?: { label: string; value: string }[];
  children?: ReactNode;
}

export function StatusView({
  icon: IconComponent,
  tone = 'info',
  label,
  title,
  body,
  facts = [],
  children,
}: StatusViewProps) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div
        className={`grid size-24 rotate-[-6deg] place-items-center rounded-[30px] bg-gradient-to-br ring-4 ring-white/20 animate-pop ${stickers[tone]}`}
      >
        <IconComponent className="size-12 rotate-[6deg] text-white drop-shadow" stroke={2} aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        {label ? (
          <span className="text-[12px] font-extrabold tracking-[0.18em] text-sun uppercase">{label}</span>
        ) : null}
        <h1 className="text-balance font-display text-[30px] leading-tight font-bold">{title}</h1>
        <p className="text-pretty text-[16px] leading-relaxed text-haze">{body}</p>
      </div>
      {facts.length > 0 ? (
        <Card className="w-full py-2 text-left">
          {facts.map((fact) => (
            <InfoRow key={fact.label} {...fact} />
          ))}
        </Card>
      ) : null}
      {children}
    </div>
  );
}
