/**
 * The top three on a phone-sized podium: first place in the middle and tallest, with a bouncing
 * crown. A player who just scored glows. After the end it shows the confirmed winners with prizes.
 */
import { IconCrown } from '@tabler/icons-react';
import { playerLabel } from '../../api/hunt';

export interface PodiumRow {
  rank: number;
  playerNumber: number;
  name?: string;
  points: number;
  prizeName?: string | null;
}

const PLACES = [
  { place: 2, block: 'h-16', medal: 'from-haze to-lilac', delay: 120 },
  { place: 1, block: 'h-24', medal: 'from-sun-light to-tangerine', delay: 0 },
  { place: 3, block: 'h-11', medal: 'from-tangerine to-coral', delay: 240 },
];

export function MiniPodium({ rows, gained = new Set() }: { rows: PodiumRow[]; gained?: Set<number> }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2.5 px-1">
      {PLACES.map(({ place, block, medal, delay }) => {
        const row = rows.find((r) => r.rank === place);
        const scored = row ? gained.has(row.playerNumber) : false;
        return (
          <div
            key={place}
            className="flex min-w-0 flex-col items-center gap-1 animate-pop"
            style={{ animationDelay: `${delay}ms` }}
          >
            {place === 1 ? (
              <IconCrown
                className={`size-8 text-sun drop-shadow ${row ? 'animate-float' : 'opacity-30'}`}
                stroke={2.2}
                aria-hidden
              />
            ) : null}
            <span
              className={`max-w-full truncate font-display text-[14px] leading-tight font-bold ${row ? '' : 'text-white/35'}`}
            >
              {row ? playerLabel(row) : 'Free spot'}
            </span>
            <span
              className={`font-display text-[24px] leading-none font-bold tabular-nums ${row ? 'text-sun' : 'text-white/25'} ${scored ? 'animate-pop' : ''}`}
            >
              {row ? row.points : '-'}
            </span>
            {row?.prizeName ? (
              <span className="max-w-full truncate text-[11px] font-bold text-haze">{row.prizeName}</span>
            ) : null}
            <div
              className={`flex w-full justify-center rounded-t-2xl bg-gradient-to-b pt-1.5 shadow-[inset_0_-6px_0_rgb(0_0_0/0.15)] ${block} ${row ? medal : 'from-white/15 to-white/5'} ${scored ? 'animate-glow' : ''}`}
            >
              <span className="font-display text-[26px] leading-none font-bold text-night/75">{place}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
