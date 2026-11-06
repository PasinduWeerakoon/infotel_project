/**
 * /leaderboard — the Treasure Hunt leaderboard on the hall screen (wireframe H2), arcade style:
 * a podium for the top three and the list under it, 10 players a page (page 1 always shows 10
 * places, empty ones waiting). With more than 10 players the list moves to the next page every
 * few seconds and starts again at page 1, so everyone is shown. Refreshes every 3 seconds.
 * QuickLook names (the player number when there is no name). After the end: final standings, then the confirmed winners.
 */
import { IconClockHour4, IconCrown, IconMap2 } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { playerLabel, screensApi } from '../../api/screens';
import { ConnectionLost } from '../../components/ConnectionLost';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { formatTime, formatWhen, sessionRange } from '../../lib/format';

type Row = {
  rank: number;
  playerNumber: number;
  name?: string;
  points: number;
  stalls?: number;
  prizeName?: string | null;
};

/** Rank badge colours of the top three in the list, the same as their podium blocks */
const BADGE: Record<number, string> = {
  1: 'bg-gradient-to-b from-sun-light to-tangerine text-night',
  2: 'bg-gradient-to-b from-haze to-lilac text-night',
  3: 'bg-gradient-to-b from-tangerine to-coral text-night',
};

const PODIUM = [
  { place: 2, height: 'h-[11vh]', medal: 'from-haze to-lilac' },
  { place: 1, height: 'h-[15vh]', medal: 'from-sun-light to-tangerine' },
  { place: 3, height: 'h-[8vh]', medal: 'from-tangerine to-coral' },
];

/** How long each page of the list stays on the screen */
const PAGE_MS = 10_000;

export function LeaderboardScreen() {
  // Page 1 always: the podium, the session, the winners and the number of pages
  const board = useQuery({
    queryKey: ['leaderboard', 1],
    queryFn: () => screensApi.leaderboard(1),
    refetchInterval: 3000,
  });
  const pages = board.data?.pages ?? 1;
  const page = usePageTurner(pages);
  const later = useQuery({
    queryKey: ['leaderboard', page],
    queryFn: () => screensApi.leaderboard(page),
    refetchInterval: 3000,
    enabled: page > 1,
    placeholderData: keepPreviousData,
  });
  // A later page is shown once it has loaded, page 1 until then
  const list = page > 1 && later.data?.page === page ? later.data : board.data;
  const logos = useQuery({ queryKey: ['logos'], queryFn: screensApi.logos, refetchInterval: 60_000 });
  const data = board.data;
  const huntLogo = logos.data?.items.find((l) => l.logoType === 'display' && l.targetId === 'hunt');
  const session = data?.session ?? null;
  const ended = session?.state === 'closed';
  const showWinners = ended && (data?.winners?.length ?? 0) > 0;
  const rows: Row[] = showWinners ? (data?.winners ?? []) : (data?.top ?? []);

  return (
    <div className="arcade-bg flex h-dvh flex-col gap-[3vh] overflow-hidden px-[4vw] py-[4vh]">
      {/* Offline devices pause polling instead of failing, so a paused fetch counts as offline too */}
      <ConnectionLost
        offline={board.isError || board.fetchStatus === 'paused'}
        lastUpdate={board.dataUpdatedAt || undefined}
      />
      <header className="flex items-center justify-between gap-6">
        <h1 className="font-display text-[6vh] leading-none font-bold uppercase drop-shadow-[0_5px_0_rgb(0_0_0/0.3)]">
          Treasure Hunt <span className="rainbow-text">Leaderboard</span>
        </h1>
        <div className="flex items-center gap-3 text-[2.2vh] font-bold">
          {session ? (
            <span className="glass rounded-full px-5 py-2">
              {session.name} · {sessionRange(session)}
            </span>
          ) : null}
          {session && !ended ? <EndsIn endsAt={session.endsAt} /> : null}
          <span
            className={`flex items-center gap-2 rounded-full px-5 py-2 ${ended ? 'bg-white/15' : 'bg-mint text-night'}`}
          >
            {!ended ? <span className="size-[1.4vh] animate-twinkle rounded-full bg-night" /> : null}
            {ended ? (showWinners ? 'Winners' : 'Final standings') : 'Live'}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-[3vw]">
        <section className="flex min-w-0 flex-1 flex-col gap-[2.5vh]">
          {rows.length === 0 ? (
            <div className="glass grid flex-1 place-items-center font-display text-[4vh] font-bold text-haze">
              No points yet. Be the first to find a stall!
            </div>
          ) : (
            <>
              <Podium rows={rows} />
              <TopTen rows={list?.top ?? []} page={list?.page ?? 1} pages={pages} />
            </>
          )}
        </section>

        <aside className="flex w-[24vw] flex-col gap-[2.5vh]">
          <div className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[3vh] bg-white p-[2vh]">
            {huntLogo?.imageUrl ? (
              <img src={huntLogo.imageUrl} alt="" className="size-full object-contain" />
            ) : (
              <IconMap2 className="size-[14vh] text-mint" stroke={1.4} aria-hidden />
            )}
          </div>
          <p className="font-display text-[3.4vh] leading-tight font-bold">
            Find this logo at the stalls and scan it with <span className="text-sun">QuickLook</span>!
          </p>
          <p className="text-[2.2vh] font-semibold text-haze">
            {session ? `+${session.pointsPerStall} points` : 'Points'} for every new stall. Top players win
            prizes.
          </p>
          <div className="mt-auto grid grid-cols-2 gap-[1.5vh]">
            <Fact label="Players" value={String(data?.players ?? 0)} />
            <Fact label="Scans" value={String(data?.scans ?? 0)} />
          </div>
          {ended && data?.nextSession ? (
            <p className="text-[2.2vh] font-bold text-haze">
              Next hunt {formatWhen(data.nextSession.startsAt)} to {formatTime(data.nextSession.endsAt)}
            </p>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

/** Top three on podium blocks, first place in the middle and tallest. */
function Podium({ rows }: { rows: Row[] }) {
  return (
    <div className="flex items-end justify-center gap-[2vw]">
      {PODIUM.map(({ place, height, medal }) => {
        const row = rows.find((r) => r.rank === place);
        return (
          <div
            key={place}
            className="flex w-[14vw] flex-col items-center gap-[1vh] animate-pop"
            style={{ animationDelay: `${place * 120}ms` }}
          >
            {row ? (
              <>
                {place === 1 ? (
                  <IconCrown className="size-[5vh] text-sun drop-shadow" stroke={2} aria-hidden />
                ) : null}
                <span className="max-w-full truncate font-display text-[3.2vh] font-bold">
                  {playerLabel(row)}
                </span>
                <span className="font-display text-[4.4vh] leading-none font-bold text-sun">
                  {row.points}
                </span>
                {row.prizeName ? (
                  <span className="text-[1.9vh] font-bold text-haze">{row.prizeName}</span>
                ) : null}
              </>
            ) : null}
            <div
              className={`flex w-full items-start justify-center rounded-t-[2.5vh] bg-gradient-to-b pt-[1.5vh] ${height} ${medal}`}
            >
              <span className="font-display text-[6vh] leading-none font-bold text-night/80">{place}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The next page number every few seconds, back to 1 after the last page. Starts again at 1 when
 * the number of pages shrinks below the page shown.
 */
function usePageTurner(pages: number) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [page, pages]);
  useEffect(() => {
    if (pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p >= pages ? 1 : p + 1)), PAGE_MS);
    return () => clearInterval(timer);
  }, [pages]);
  return page;
}

/**
 * One page of 10 in two columns (1 to 5, 6 to 10 on page 1). On page 1 places nobody has reached
 * yet wait, dimmed. Later pages show only the players on them.
 */
function TopTen({ rows, page, pages }: { rows: Row[]; page: number; pages: number }) {
  const from = (page - 1) * 10 + 1;
  const places = Array.from(
    { length: 10 },
    (_, i) => rows.find((r) => r.rank === from + i) ?? (page === 1 ? from + i : null),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[1.2vh]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-[2.6vh] font-bold tracking-[0.12em] text-lilac uppercase">
          {page === 1 ? 'Top 10' : `Places ${from} to ${rows.at(-1)?.rank ?? from}`}
        </h2>
        {pages > 1 ? (
          <span className="glass rounded-full px-4 py-1 text-[2vh] font-bold tabular-nums">
            Page {page} of {pages}
          </span>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-flow-col grid-cols-2 grid-rows-5 gap-x-[1.5vw] gap-y-[1vh]">
        {places.map((place, i) =>
          place === null ? (
            <div key={`none-${from + i}`} />
          ) : typeof place === 'number' ? (
            <div
              key={`free-${place}`}
              className="flex items-center gap-[1.2vw] rounded-[2vh] border-2 border-dashed border-white/10 px-[1.2vw]"
            >
              <span className="grid size-[4.6vh] shrink-0 place-items-center rounded-full bg-white/8 font-display text-[2.4vh] font-bold text-white/40">
                {place}
              </span>
              <span className="text-[2.2vh] font-semibold text-white/35">Waiting for a player</span>
            </div>
          ) : (
            <ScoreRow key={place.playerNumber} row={place} />
          ),
        )}
      </div>
    </div>
  );
}

function ScoreRow({ row }: { row: Row }) {
  return (
    <div className="glass flex items-center gap-[1.2vw] rounded-[2vh] px-[1.2vw] animate-pop">
      <span
        className={`grid size-[4.6vh] shrink-0 place-items-center rounded-full font-display text-[2.4vh] font-bold ${BADGE[row.rank] ?? 'bg-white/15'}`}
      >
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-display text-[2.6vh] font-semibold">
        {playerLabel(row)}
      </span>
      {row.stalls !== undefined ? (
        <span className="shrink-0 text-[2vh] font-bold text-lilac">
          {row.stalls} {row.stalls === 1 ? 'stall' : 'stalls'}
        </span>
      ) : null}
      <span className="w-[5vw] shrink-0 text-right font-display text-[3vh] font-bold text-sun tabular-nums">
        {row.points}
      </span>
    </div>
  );
}

function EndsIn({ endsAt }: { endsAt: string }) {
  const seconds = useCountdown(endsAt);
  return (
    <span className="glass flex items-center gap-2 rounded-full px-5 py-2 tabular-nums">
      <IconClockHour4 className="size-[2.6vh] text-sun" stroke={2} aria-hidden />
      {formatSeconds(seconds)}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass px-[2vh] py-[1.5vh]">
      <div className="text-[1.8vh] font-extrabold tracking-[0.12em] text-lilac uppercase">{label}</div>
      <div className="font-display text-[4.4vh] font-bold">{value}</div>
    </div>
  );
}
