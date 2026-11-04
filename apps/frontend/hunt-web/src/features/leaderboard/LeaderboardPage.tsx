/**
 * /leaderboard — the same top 10 as the big screen, on the phone. Player numbers only.
 * The top three get podium medals.
 */
import { IconCrown } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { huntApi } from '../../api/hunt';
import { Screen } from '../../components/layout/Screen';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { sessionRange } from '../../lib/format';

const MEDALS = ['from-sun-light to-tangerine', 'from-haze to-lilac', 'from-tangerine to-coral'];

export function LeaderboardPage() {
  const board = useQuery({ queryKey: ['leaderboard'], queryFn: huntApi.leaderboard, refetchInterval: 5000 });
  const data = board.data;

  return (
    <Screen badge={data?.session ? sessionRange(data.session) : undefined}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="glass flex items-center gap-2 rounded-full px-3.5 py-1 text-[12px] font-extrabold tracking-[0.16em] uppercase">
          <span
            className={`size-2 rounded-full ${data?.session?.state === 'closed' ? 'bg-lilac' : 'animate-twinkle bg-mint'}`}
          />
          {data?.session?.state === 'closed' ? 'Final standings' : 'Live'}
        </span>
        <h1 className="font-display text-[38px] leading-none font-bold uppercase">Leaderboard</h1>
        {data ? <p className="text-[15px] font-semibold text-haze">{data.players} players hunting</p> : null}
      </div>
      {!data ? (
        <Spinner className="mx-auto size-9 text-sun" />
      ) : data.top.length === 0 ? (
        <Card className="text-center text-[16px] font-semibold text-haze">
          No points yet. Be the first to find a stall!
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {data.top.map((row) => (
            <div
              key={row.playerNumber}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${row.rank <= 3 ? 'bg-white/15 ring-1 ring-white/20' : 'glass'}`}
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-[18px] font-bold ${
                  row.rank <= 3
                    ? `bg-gradient-to-br text-night ${MEDALS[row.rank - 1]}`
                    : 'bg-white/10 text-lilac'
                }`}
              >
                {row.rank === 1 ? <IconCrown className="size-5" stroke={2.2} aria-hidden /> : row.rank}
              </span>
              <span className="flex-1 font-display text-[18px] font-semibold">
                Player #{row.playerNumber}
              </span>
              <span className="text-[13px] font-bold text-lilac">
                {row.stalls} {row.stalls === 1 ? 'stall' : 'stalls'}
              </span>
              <span className="w-14 text-right font-display text-[22px] font-bold text-sun tabular-nums">
                {row.points}
              </span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
