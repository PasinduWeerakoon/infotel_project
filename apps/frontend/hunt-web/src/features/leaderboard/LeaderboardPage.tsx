/**
 * /leaderboard — every player, 10 per page, on the phone, game style. Page 1 is the same top 10 as
 * the big screen: a mini podium for the top three, a live countdown, then places 4 to 10 (players
 * who just scored flash, climbers get an arrow). Later pages list places 11 to 20 and so on. QuickLook names (the player number when there is no name). After the end the podium shows the confirmed winners with
 * confetti, then when the next hunt starts. Polls every 5 seconds, and not while the tab is hidden.
 */
import {
  IconChevronLeft,
  IconChevronRight,
  IconClockHour4,
  IconQrcode,
  IconUsers,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { huntApi } from '../../api/hunt';
import { Screen } from '../../components/layout/Screen';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { celebrate } from '../../lib/celebrate';
import { formatWhen, sessionRange } from '../../lib/format';
import { MiniPodium } from './MiniPodium';
import { RankRows, useMovers } from './RankRows';

export function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const board = useQuery({
    queryKey: ['leaderboard', page],
    queryFn: () => huntApi.leaderboard(page),
    refetchInterval: 5000,
    // Keep the current page on screen while the next one loads
    placeholderData: keepPreviousData,
  });
  const data = board.data;
  const session = data?.session ?? null;
  const ended = session?.state === 'closed';
  const winners = ended ? (data?.winners ?? []) : [];
  const top = data?.top ?? [];
  const shownPage = data?.page ?? 1;
  const pages = data?.pages ?? 1;
  const { gained, climbed } = useMovers(top, shownPage);

  // Fewer pages than before (a player was disqualified): go to the last one
  useEffect(() => {
    if (data && !board.isPlaceholderData && page > pages) setPage(pages);
  }, [data, board.isPlaceholderData, page, pages]);

  // Confetti once per session, when its winners appear
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (session && winners.length > 0 && celebrated.current !== session.sessionId) {
      celebrated.current = session.sessionId;
      void celebrate(true);
    }
  }, [session, winners.length]);

  return (
    <Screen badge={session ? sessionRange(session) : undefined}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="glass flex items-center gap-2 rounded-full px-3.5 py-1 text-[12px] font-extrabold tracking-[0.16em] uppercase">
          <span
            className={`size-2 rounded-full ${ended || !session ? 'bg-lilac' : 'animate-twinkle bg-mint'}`}
          />
          {!session ? 'Treasure Hunt' : ended ? (winners.length ? 'Winners' : 'Final standings') : 'Live'}
        </span>
        <h1 className="font-display text-[40px] leading-none font-bold uppercase drop-shadow-[0_4px_0_rgb(0_0_0/0.3)]">
          <span className="rainbow-text">Leaderboard</span>
        </h1>
        {session ? <p className="text-[15px] font-bold text-haze">{session.name}</p> : null}
      </div>

      {!data ? (
        <Spinner className="mx-auto size-9 text-sun" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Pill
              icon={<IconUsers className="size-4" stroke={2.4} />}
              label="Players"
              value={String(data.players)}
            />
            <Pill
              icon={<IconQrcode className="size-4" stroke={2.4} />}
              label="Scans"
              value={String(data.scans ?? 0)}
            />
            {session && !ended ? (
              <TimeLeft endsAt={session.endsAt} />
            ) : (
              <Pill
                icon={<IconClockHour4 className="size-4" stroke={2.4} />}
                label="Time"
                value={ended ? 'Ended' : '-'}
              />
            )}
          </div>

          {shownPage === 1 && top.length === 0 && winners.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 text-center">
              <span className="text-[40px] animate-wobble" aria-hidden>
                🗺️
              </span>
              <p className="font-display text-[20px] font-bold">No points yet</p>
              <p className="text-[15px] font-semibold text-haze">
                {session && !ended
                  ? 'Be the first! Scan a stall logo with QuickLook.'
                  : data.nextSession
                    ? `The next hunt starts ${formatWhen(data.nextSession.startsAt)}.`
                    : 'The hunt has not started yet.'}
              </p>
            </Card>
          ) : shownPage === 1 ? (
            <>
              <MiniPodium
                rows={winners.length ? winners : top}
                gained={winners.length ? undefined : gained}
              />
              <RankRows rows={top} gained={gained} climbed={climbed} />
            </>
          ) : (
            <RankRows rows={top} gained={gained} climbed={climbed} from={(shownPage - 1) * 10 + 1} />
          )}

          {pages > 1 ? <Pager page={page} pages={pages} onChange={setPage} /> : null}

          <Card className="flex items-center gap-3 !p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-mint font-display text-[22px] font-bold text-night">
              +{session?.pointsPerStall ?? 10}
            </span>
            <p className="text-[14px] leading-snug font-semibold text-haze">
              {ended && data.nextSession
                ? `Next hunt ${formatWhen(data.nextSession.startsAt)}. Scan stall logos with QuickLook to play.`
                : 'Points for every new stall logo you scan with QuickLook. Most stalls wins!'}
            </p>
          </Card>
        </>
      )}
    </Screen>
  );
}

/** Previous and next page, 10 players each */
function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const button =
    'glass grid size-11 place-items-center rounded-full text-white transition active:scale-95 disabled:opacity-35';
  return (
    <nav className="flex items-center justify-center gap-4" aria-label="Leaderboard pages">
      <button
        type="button"
        className={button}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <IconChevronLeft className="size-6" stroke={2.4} />
      </button>
      <span className="min-w-28 text-center font-display text-[17px] font-bold tabular-nums">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
      >
        <IconChevronRight className="size-6" stroke={2.4} />
      </button>
    </nav>
  );
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5">
      <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-[0.12em] text-lilac uppercase">
        {icon}
        {label}
      </span>
      <span className="font-display text-[22px] leading-none font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Countdown to the end; it turns coral and pulses in the last 5 minutes */
function TimeLeft({ endsAt }: { endsAt: string }) {
  const seconds = useCountdown(endsAt);
  const hurry = seconds > 0 && seconds <= 300;
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 ${hurry ? 'bg-coral/30 ring-2 ring-coral animate-glow' : 'glass'}`}
    >
      <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-[0.12em] text-lilac uppercase">
        <IconClockHour4 className="size-4" stroke={2.4} />
        Left
      </span>
      <span className="font-display text-[22px] leading-none font-bold tabular-nums">
        {formatSeconds(seconds)}
      </span>
    </div>
  );
}
