/**
 * A 3D gift box (CSS 3D, see gift-box-3d.css).
 *
 * The parent only says what it wants: `spinning` while the server draws the prize, then `open`
 * with the prize. The box finishes its current turn, slows down onto its resting angle (no jump),
 * opens the lid and lifts the prize out. `onRevealed` runs once the prize is fully out.
 */
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import './gift-box-3d.css';

export type GiftColors = readonly [string, string];

/** Candy colours shared by the phone and the big screens */
export const GIFT_COLORS: GiftColors[] = [
  ['#ff5470', '#ff4fcf'],
  ['#38b6ff', '#9b5cff'],
  ['#ffcd1f', '#ff8a1e'],
  ['#22d98e', '#38b6ff'],
  ['#9b5cff', '#ff4fcf'],
  ['#ff8a1e', '#ff5470'],
  ['#ff4fcf', '#9b5cff'],
  ['#ffe066', '#22d98e'],
  ['#38b6ff', '#5a3ad1'],
];

type Stage = 'idle' | 'spin' | 'settle' | 'open';

/** How long the lid and the prize take after the box starts opening */
const REVEAL_MS = 1700;

/** Sparkle directions around the opened box, as multiples of the box size */
const SPARKS = [
  [-1.1, -1.3],
  [1.2, -1.1],
  [-1.5, -0.2],
  [1.5, 0.1],
  [-0.7, -1.9],
  [0.8, -1.8],
  [0, -2.2],
  [-1.3, 0.6],
  [1.3, 0.7],
] as const;

interface GiftBox3DProps {
  /** Box edge, any CSS length (for example 64px or 30vh) */
  size: string;
  colors: GiftColors;
  spinning?: boolean;
  open?: boolean;
  /** Shown rising out of the box when it opens */
  prize?: ReactNode;
  /** Idle bobbing offset, so a row of boxes does not move in step */
  delay?: number;
  /** How far the prize rises above the box, in box sizes */
  rise?: number;
  onRevealed?: () => void;
  className?: string;
}

export function GiftBox3D({
  size,
  colors,
  spinning = false,
  open = false,
  prize,
  delay = 0,
  rise = 1.6,
  onRevealed,
  className = '',
}: GiftBox3DProps) {
  const [stage, setStage] = useState<Stage>('idle');
  const wantsOpen = useRef(open);
  wantsOpen.current = open;
  const revealed = useRef(onRevealed);
  revealed.current = onRevealed;

  // Start spinning, or open straight away when there was no spin
  useEffect(() => {
    if (spinning && stage === 'idle') setStage('spin');
    if (open && !spinning && stage === 'idle') setStage('open');
  }, [spinning, open, stage]);

  // Reduced motion: no turning, the box opens as soon as the prize is known
  useEffect(() => {
    if (open && stage === 'spin' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStage('open');
    }
  }, [open, stage]);

  // Once open, wait for the lid and the prize, then tell the parent
  useEffect(() => {
    if (stage !== 'open') return;
    const timer = window.setTimeout(() => revealed.current?.(), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // A turn ends on the resting angle, so switching here never jumps
  const onTurnEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (stage === 'spin' && wantsOpen.current) setStage('settle');
    else if (stage === 'settle') setStage('open');
  };

  const style = {
    '--s': size,
    '--c1': colors[0],
    '--c2': colors[1],
    '--delay': `${delay}s`,
    '--rise': rise,
  } as CSSProperties;

  return (
    <div className={`gb-scene ${className}`} style={style} data-open={stage === 'open'}>
      <div className="gb-shadow" />
      <div className="gb" data-state={stage} onAnimationIteration={onTurnEnd} onAnimationEnd={onTurnEnd}>
        <div className="gb-face gb-back" />
        <div className="gb-face gb-left" />
        <div className="gb-face gb-bottom" />
        <div className="gb-inside" />
        <div className="gb-beam" />
        {prize ? <div className="gb-prize">{prize}</div> : null}
        <div className="gb-face gb-right" />
        <div className="gb-face gb-front" />
        <div className="gb-lid">
          <div className="gb-lid-under" />
          <div className="gb-lid-face gb-lid-back" />
          <div className="gb-lid-face gb-lid-left" />
          <div className="gb-lid-face gb-lid-right" />
          <div className="gb-lid-face gb-lid-front" />
          <div className="gb-lid-top" />
          <div className="gb-bow">
            <span className="gb-knot" />
          </div>
        </div>
      </div>
      <div className="gb-sparks" aria-hidden>
        {SPARKS.map(([x, y], index) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decoration
            key={index}
            style={
              {
                left: '50%',
                top: '30%',
                '--x': `calc(var(--s) * ${x})`,
                '--y': `calc(var(--s) * ${y})`,
                animationDelay: `${0.25 + index * 0.05}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
