/**
 * Places 4 to 10 as score rows (always 7 rows, free places wait dimmed), or with `from` one later
 * page of the list (only the players on it). A player who just gained points flashes gold, and one
 * who moved up shows an arrow, so the list feels alive.
 */
import { IconArrowUp } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { playerLabel } from '../../api/hunt';

export interface RankRow {
  rank: number;
  playerNumber: number;
  name?: string;
  points: number;
  stalls: number;
}

/**
 * Player numbers that gained points or places since the last refresh, for a short flash.
 * `page` is the page the rows belong to: another page is a fresh start, not a move.
 */
export function useMovers(rows: RankRow[], page = 1): { gained: Set<number>; climbed: Set<number> } {
  const previous = useRef<{ page: number; rows: Map<number, RankRow> } | null>(null);
  const [movers, setMovers] = useState({ gained: new Set<number>(), climbed: new Set<number>() });

  useEffect(() => {
    if (rows.length === 0) return; // still loading, or nobody yet: nothing to compare with
    const before = previous.current?.page === page ? previous.current.rows : null;
    previous.current = { page, rows: new Map(rows.map((r) => [r.playerNumber, r])) };
    if (!before) return; // first load of this page: nothing moved yet
    const gained = new Set(
      rows.filter((r) => (before.get(r.playerNumber)?.points ?? -1) < r.points).map((r) => r.playerNumber),
    );
    const climbed = new Set(
      rows
        .filter((r) => {
          const old = before.get(r.playerNumber);
          return old ? old.rank > r.rank : r.rank <= 10;
        })
        .map((r) => r.playerNumber),
    );
    if (!gained.size && !climbed.size) return;
    setMovers({ gained, climbed });
    const timer = window.setTimeout(() => setMovers({ gained: new Set(), climbed: new Set() }), 2500);
    return () => window.clearTimeout(timer);
  }, [rows, page]);

  return movers;
}

export function RankRows({
  rows,
  gained,
  climbed,
  from,
}: { rows: RankRow[]; gained: Set<number>; climbed: Set<number>; from?: number }) {
  const places: (RankRow | number)[] = from
    ? rows.filter((r) => r.rank >= from)
    : Array.from({ length: 7 }, (_, i) => rows.find((r) => r.rank === i + 4) ?? i + 4);
  return (
    <ol className="flex flex-col gap-2">
      {places.map((place, index) =>
        typeof place === 'number' ? (
          <li
            key={`free-${place}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 px-3.5 py-2.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 font-display text-[16px] font-bold text-white/35">
              {place}
            </span>
            <span className="text-[14px] font-semibold text-white/35">Waiting for a player</span>
          </li>
        ) : (
          <li
            key={place.playerNumber}
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-colors duration-700 animate-rise ${
              gained.has(place.playerNumber) ? 'bg-sun/25 ring-2 ring-sun' : 'glass'
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/12 font-display text-[16px] font-bold text-lilac">
              {place.rank}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-display text-[17px] font-semibold">
              <span className="truncate">{playerLabel(place)}</span>
              {climbed.has(place.playerNumber) ? (
                <IconArrowUp
                  className="size-4 shrink-0 text-mint animate-float"
                  stroke={3}
                  aria-label="Moved up"
                />
              ) : null}
            </span>
            <span className="shrink-0 text-[12px] font-bold text-lilac">
              {place.stalls} {place.stalls === 1 ? 'stall' : 'stalls'}
            </span>
            <span className="w-12 shrink-0 text-right font-display text-[20px] font-bold text-sun tabular-nums">
              {place.points}
            </span>
          </li>
        ),
      )}
    </ol>
  );
}
