/**
 * /me — my progress (wireframes H1.2, H1.7, H1.8).
 * Live points, rank and stalls while the hunt runs, like a game's score screen. After the end:
 * final standing, and the winner card once staff confirm the winners. Refreshes in the background.
 */
import { IconClockHour4, IconMapPinFilled, IconTrophy } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { type MyProgress, huntApi } from '../../api/hunt';
import { Screen } from '../../components/layout/Screen';
import { ButtonLink } from '../../components/ui/Button';
import { Card, InfoRow } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Stat } from '../../components/ui/Stat';
import { StatusView } from '../../components/ui/StatusView';
import { useApiErrorHandler } from '../../hooks/useApiError';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { celebrate } from '../../lib/celebrate';
import { formatTime, formatWhen, sessionRange } from '../../lib/format';

export function ProgressPage() {
  const handleError = useApiErrorHandler();
  const progress = useQuery({ queryKey: ['me'], queryFn: huntApi.me, refetchInterval: 10_000, retry: false });

  useEffect(() => {
    if (progress.error) handleError(progress.error, '/me');
  }, [progress.error, handleError]);

  const data = progress.data;
  if (!data) {
    return (
      <Screen centered>
        <Spinner className="mx-auto size-9 text-sun" />
      </Screen>
    );
  }
  if (data.winner) return <WinnerCard data={data} />;
  return <Progress data={data} />;
}

function Progress({ data }: { data: MyProgress }) {
  const { session, player } = data;
  const ended = session?.state === 'closed';
  const secondsLeft = useCountdown(session && !ended ? session.endsAt : undefined);
  const total = data.totalStalls ?? 0;

  return (
    <Screen
      badge={session ? sessionRange(session) : undefined}
      actions={
        <ButtonLink to="/leaderboard" icon={<IconTrophy className="size-6" stroke={2} aria-hidden />}>
          Leaderboard
        </ButtonLink>
      }
    >
      {ended ? (
        <StatusView
          icon={IconClockHour4}
          tone="info"
          label="Time is up"
          title="This hunt session has ended"
          body={
            session?.finalized
              ? 'Winners are being confirmed. Check back here in a moment.'
              : 'Final standings are being checked.'
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[13px] font-extrabold tracking-[0.18em] text-mint uppercase">
            {session?.name ?? 'Treasure Hunt'}
          </p>
          <h1 className="font-display text-[38px] leading-none font-bold">
            {player ? `Player #${player.playerNumber}` : 'Start hunting!'}
          </h1>
          {session ? (
            <span className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-[15px] font-bold">
              <IconClockHour4 className="size-5 text-sun" stroke={2} aria-hidden />
              <span className="tabular-nums">{formatSeconds(secondsLeft)}</span>
              <span className="text-lilac">left</span>
            </span>
          ) : null}
        </div>
      )}

      {player ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Points" value={String(player.points)} highlight />
            <Stat label="Rank" value={`#${player.rank}`} />
            <Stat label="Stalls" value={total ? `${player.stalls}/${total}` : String(player.stalls)} />
          </div>
          {total ? <StallMeter found={player.stalls} total={total} /> : null}
        </>
      ) : (
        <Card className="text-center text-[16px] font-semibold text-haze">
          Scan a stall's logo with the QuickLook app to get your first points. Your progress appears here
          within about 15 seconds.
        </Card>
      )}

      {data.visits.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-[20px] font-bold">Stalls found</h2>
          <Card className="flex flex-col gap-1 p-3">
            {data.visits.map((visit) => (
              <div
                key={visit.logoId}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-[15px] font-semibold"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {visit.logoUrl ? (
                    <img
                      src={visit.logoUrl}
                      alt=""
                      className="size-8 shrink-0 rounded-lg bg-white object-contain p-0.5"
                    />
                  ) : (
                    <IconMapPinFilled className="size-5 shrink-0 text-coral" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{visit.name}</span>
                    {visit.company ? (
                      <span className="block truncate text-[12px] font-semibold text-lilac">
                        {visit.company}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="rounded-full bg-mint/20 px-2.5 py-0.5 text-[13px] font-extrabold text-mint">
                  +{session?.pointsPerStall ?? ''}
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {data.nextSession && (ended || !session) ? (
        <Card className="py-2">
          <InfoRow
            label="Next session"
            value={`${formatWhen(data.nextSession.startsAt)} to ${formatTime(data.nextSession.endsAt)}`}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

/** Row of map pins, one per stall, filled as they are found. */
function StallMeter({ found, total }: { found: number; total: number }) {
  return (
    <div
      className="glass flex flex-wrap justify-center gap-2 p-3"
      role="img"
      aria-label={`${found} of ${total} stalls found`}
    >
      {Array.from({ length: total }, (_, i) => (
        <IconMapPinFilled
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed positions
          key={i}
          className={`size-6 ${i < found ? 'text-coral drop-shadow' : 'text-white/15'}`}
          aria-hidden
        />
      ))}
    </div>
  );
}

function WinnerCard({ data }: { data: MyProgress }) {
  const winner = data.winner as NonNullable<MyProgress['winner']>;
  useEffect(() => {
    if (!winner.collectedAt) void celebrate(true);
  }, [winner.collectedAt]);

  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="rainbow-text font-display text-[44px] leading-none font-bold animate-pop">
          {winner.collectedAt ? 'COLLECTED!' : 'WINNER!'}
        </p>
        <p className="text-[15px] font-semibold text-haze">
          {winner.collectedAt ? 'Enjoy your prize' : 'Show this at the prize desk'}
        </p>
      </div>
      <div className="relative mx-auto mt-12 w-full max-w-[340px] rounded-[28px] bg-white px-6 pt-14 pb-6 text-center text-night shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] animate-pop">
        <div className="absolute -top-11 left-1/2 grid size-22 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br from-sun-light to-tangerine ring-4 ring-white">
          <IconTrophy className="size-11 text-white" stroke={2} aria-hidden />
        </div>
        <p className="text-[13px] font-extrabold tracking-[0.14em] text-tangerine uppercase">
          Rank #{winner.rank}
        </p>
        <h1 className="font-display text-[28px] leading-tight font-bold text-violet">
          {winner.prizeName ?? 'Prize'}
        </h1>
        <div className="mt-5 rounded-2xl border-2 border-dashed border-violet/30 bg-haze/40 px-4 py-3">
          <span className="block text-[12px] font-bold tracking-[0.14em] text-violet/70 uppercase">
            Player number
          </span>
          <span className="font-display text-[34px] font-bold text-night">#{winner.playerNumber}</span>
        </div>
      </div>
    </Screen>
  );
}
