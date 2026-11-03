/**
 * The prize wheel, drawn as SVG like an arcade wheel: bright candy segments with white
 * dividers, a thick orange rim with twinkling bulbs, a red pointer and a white hub.
 * The motion lives in useWheelSpin.
 */
import type { RefObject } from 'react';
import type { Segment } from '../../api/games';

const SIZE = 360;
const C = SIZE / 2;
const RIM = C - 6;
const R = C - 26; // segment radius, inside the rim
const LABEL_RADIUS = R * 0.62;
const BULBS = 24;

/** Segment colours and the label colour that reads best on each */
const PALETTE = [
  { fill: '#ff5470', ink: '#ffffff' },
  { fill: '#ff8a1e', ink: '#ffffff' },
  { fill: '#ffcd1f', ink: '#3a2400' },
  { fill: '#22d98e', ink: '#063d26' },
  { fill: '#38b6ff', ink: '#ffffff' },
  { fill: '#9b5cff', ink: '#ffffff' },
  { fill: '#ff4fcf', ink: '#ffffff' },
];

function slicePath(index: number, count: number): string {
  const slice = (2 * Math.PI) / count;
  const a0 = index * slice - Math.PI / 2; // clockwise from the top
  const a1 = a0 + slice;
  const p = (a: number) => `${C + R * Math.cos(a)},${C + R * Math.sin(a)}`;
  return `M${C},${C} L${p(a0)} A${R},${R} 0 ${slice > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
}

/** Labels run outwards from the hub. On the left half they turn half a turn more, so none is upside down. */
function labelTransform(midDeg: number): string {
  const flip = midDeg > 180 ? ` rotate(180 ${C + LABEL_RADIUS} ${C})` : '';
  return `rotate(${midDeg - 90} ${C} ${C})${flip}`;
}

const shortName = (name: string) => (name.length > 13 ? `${name.slice(0, 12)}…` : name);

export function Wheel({
  segments,
  wheelRef,
}: { segments: Segment[]; wheelRef: RefObject<HTMLDivElement | null> }) {
  const count = Math.max(segments.length, 2);
  const slice = 360 / count;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      {/* Rim with bulbs: does not turn */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 size-full drop-shadow-[0_20px_40px_rgb(0_0_0/0.45)]"
        aria-hidden="true"
      >
        <title>Wheel rim</title>
        <defs>
          <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb547" />
            <stop offset="1" stopColor="#ff7a00" />
          </linearGradient>
        </defs>
        <circle cx={C} cy={C} r={RIM} fill="url(#rim)" />
        <circle cx={C} cy={C} r={RIM - 4} fill="none" stroke="#ffe08a" strokeWidth="2" opacity="0.7" />
        {Array.from({ length: BULBS }, (_, i) => {
          const a = (i / BULBS) * 2 * Math.PI;
          return (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decoration
              key={i}
              cx={C + (RIM - 10) * Math.cos(a)}
              cy={C + (RIM - 10) * Math.sin(a)}
              r="3.6"
              fill="#fffbe6"
              className="animate-twinkle"
              style={{ animationDelay: `${(i % 2) * 0.7}s` }}
            />
          );
        })}
      </svg>

      {/* The turning part */}
      <div ref={wheelRef} className="absolute inset-0 will-change-transform">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" role="img" aria-label="Prize wheel">
          <title>Prize wheel</title>
          {segments.map((segment, i) => {
            const tryAgain = segment.id === 'try-again';
            const colour = tryAgain
              ? { fill: '#2b2268', ink: '#d9d2ff' }
              : (PALETTE[i % PALETTE.length] as (typeof PALETTE)[number]);
            const mid = i * slice + slice / 2;
            return (
              <g key={segment.id}>
                <path
                  d={slicePath(i, count)}
                  fill={colour.fill}
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                <text
                  x={C + LABEL_RADIUS}
                  y={C}
                  transform={labelTransform(mid)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colour.ink}
                  fontSize={count > 8 ? 13 : 16}
                  fontWeight={700}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {shortName(segment.name)}
                </text>
              </g>
            );
          })}
          {/* Soft shine across the top half */}
          <path d={`M${C - R},${C} A${R},${R} 0 0 1 ${C + R},${C} Z`} fill="white" opacity="0.08" />
        </svg>
      </div>

      {/* Pointer */}
      <svg
        className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 drop-shadow-[0_4px_4px_rgb(0_0_0/0.4)]"
        width="34"
        height="48"
        viewBox="0 0 34 48"
        aria-hidden="true"
      >
        <title>Pointer</title>
        <path
          d="M17 46 L3 12 A14 14 0 1 1 31 12 Z"
          fill="#ff3355"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="17" cy="14" r="5" fill="#ffffff" />
      </svg>

      {/* Hub */}
      <div className="absolute top-1/2 left-1/2 grid size-[17%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_4px_12px_rgb(0_0_0/0.35)]">
        <span className="size-1/2 rounded-full bg-gradient-to-br from-grape to-violet ring-4 ring-haze" />
      </div>
    </div>
  );
}
