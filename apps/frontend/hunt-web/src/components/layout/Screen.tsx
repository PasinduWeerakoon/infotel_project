/**
 * Page frame for every visitor screen, responsive:
 * - Phone: game header with glass chips, the content, and the main button pinned at the bottom.
 * - Desktop and tablet (lg): the same game column in the middle, with a "how to play" panel beside it.
 */
import type { ReactNode } from 'react';
import { BRAND } from '../../lib/brand';

interface ScreenProps {
  /** Shown in a glass chip in the header, for example the session time */
  badge?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  centered?: boolean;
}

export function Screen({ badge, children, actions, centered = false }: ScreenProps) {
  return (
    <div className="arcade-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] gap-10 lg:items-center lg:px-10">
        <HowToPlayPanel />
        <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-5 pt-[max(env(safe-area-inset-top),16px)] lg:min-h-0 lg:py-10">
          <header className="flex items-center justify-between gap-3 py-2">
            <div className="glass flex items-center gap-2 rounded-full py-1 pr-4 pl-1">
              <img src="/favicon.svg" alt="" className="size-8" />
              <span className="font-display text-[16px] font-semibold">{BRAND.product}</span>
            </div>
            {badge ? (
              <span className="glass rounded-full px-3.5 py-2 text-[12px] font-bold text-haze">{badge}</span>
            ) : null}
          </header>
          <main
            className={`flex flex-1 flex-col gap-5 py-5 animate-rise ${centered ? 'justify-center' : ''}`}
          >
            {children}
          </main>
          {actions ? (
            <footer className="sticky bottom-0 -mx-5 flex flex-col items-center gap-3 bg-gradient-to-t from-night via-night/90 to-transparent px-5 pt-8 pb-[max(env(safe-area-inset-bottom),20px)] lg:static lg:mx-0 lg:bg-none lg:px-0">
              {actions}
            </footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Desktop only: what this is and how it works, so the wide screen is not empty. */
function HowToPlayPanel() {
  return (
    <aside className="hidden w-[380px] shrink-0 flex-col gap-6 lg:flex">
      <span className="glass self-start rounded-full px-4 py-1.5 text-[12px] font-extrabold tracking-[0.18em] text-sun uppercase">
        {BRAND.event}
      </span>
      <h1 className="font-display text-[56px] leading-[1] font-bold">
        {BRAND.headline[0]}
        <br />
        <span className="rainbow-text">{BRAND.headline[1]}</span>
      </h1>
      <p className="text-[17px] leading-relaxed text-haze">{BRAND.promise}</p>
      <ol className="flex flex-col gap-3">
        {BRAND.steps.map((step, index) => (
          <li key={step.title} className="glass flex items-center gap-4 p-4">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-xl font-display text-[20px] font-bold text-night ${step.color}`}
            >
              {index + 1}
            </span>
            <span>
              <strong className="block font-display text-[18px]">{step.title}</strong>
              <span className="text-[14px] text-haze">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
