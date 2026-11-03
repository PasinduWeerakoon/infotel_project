/**
 * /play/:entryId — the game itself (wireframes G3.2, G3.3, G4.1 to G4.3).
 *
 * Ready: game logo, rules, the screen reservation countdown and one big button.
 * Both games first ask for the player's name and phone in a popup.
 * Spin the Wheel: the wheel starts on tap, the server draws the prize meanwhile, the wheel lands on it.
 * Lucky Dip: pick a 3D box, it flies forward and spins while the server draws, then opens.
 * Back and refresh never give a second play: the server returns the same result.
 */
import { IconClockHour4, IconHandFinger } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { type EntryView, GAME_NAMES, type PlayerDetails, gamesApi } from '../../api/games';
import { Screen } from '../../components/layout/Screen';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useApiErrorHandler } from '../../hooks/useApiError';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { entryKey, useEntry } from '../../hooks/useEntry';
import { sessionBadge } from '../status/messages';
import { type DipPhase, LuckyDip } from './LuckyDip';
import { PlayerDetailsSheet } from './PlayerDetailsSheet';
import { Wheel } from './Wheel';
import { useWheelSpin } from './useWheelSpin';

export function GamePage() {
  const { entryId = '' } = useParams();
  const entry = useEntry(entryId);
  const handleError = useApiErrorHandler();

  useEffect(() => {
    if (entry.error) handleError(entry.error);
  }, [entry.error, handleError]);

  if (!entry.data) {
    return (
      <Screen centered>
        <Spinner className="mx-auto size-9 text-sun" />
      </Screen>
    );
  }
  if (entry.data.status === 'played') return <Navigate to={`/result/${entryId}`} replace />;
  if (entry.data.status === 'expired') return <Navigate to="/status/ENTRY_EXPIRED" replace />;
  return <ReadyGame entry={entry.data} />;
}

type Stage = 'ready' | 'playing' | 'done';

function ReadyGame({ entry }: { entry: EntryView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleError = useApiErrorHandler();
  const secondsLeft = useCountdown(entry.expiresAt);
  const lockSeconds = useRef(Math.max(secondsLeft, 1)).current;
  const [stage, setStage] = useState<Stage>('ready');
  const [dipPhase, setDipPhase] = useState<DipPhase>('pick');
  const [picked, setPicked] = useState<number | null>(null);
  const wheel = useWheelSpin(entry.display.segments.length);
  const isSpin = entry.game === 'spin';
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const done = useRef(false);

  const logos = useQuery({ queryKey: ['logos'], queryFn: gamesApi.logos, staleTime: 60_000 });
  const logo = logos.data?.items.find((l) => l.logoType === 'game' && l.targetId === entry.game);

  const play = useMutation({
    mutationFn: () => gamesApi.play(entry.entryId, player ?? undefined),
    onError: (error) => {
      wheel.stop();
      handleError(error, `/play/${entry.entryId}`);
    },
  });

  const showResult = () => {
    if (done.current) return;
    done.current = true;
    setStage('done');
    // Cache the played entry only now, so this page does not jump to the result mid-animation
    if (play.data) queryClient.setQueryData(entryKey(entry.entryId), play.data);
    navigate(`/result/${entry.entryId}`, { replace: true, viewTransition: true });
  };

  // When the result arrives, finish the animation, then open the result page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per server result only
  useEffect(() => {
    const result = play.data?.result;
    if (!result) return;
    if (isSpin) wheel.land(result.animation.target, showResult);
    else setDipPhase('revealed'); // the box opens, then calls showResult
  }, [play.data]);

  // The screen reservation ran out before the visitor started
  if (secondsLeft === 0 && stage === 'ready') return <Navigate to="/status/ENTRY_EXPIRED" replace />;

  const startSpin = () => {
    if (!player) return;
    setStage('playing');
    wheel.start(); // spin at once, the result lands later
    play.mutate();
  };

  const pickBox = (index: number) => {
    if (!player) return;
    setPicked(index);
    setDipPhase('opening');
    play.mutate();
  };

  const badge = sessionBadge(entry.session);
  const watching = (
    <p className="animate-twinkle text-[14px] font-extrabold tracking-[0.16em] text-sun uppercase">
      Watch the big screen!
    </p>
  );

  if (isSpin) {
    return (
      <Screen
        badge={badge}
        actions={
          stage === 'ready' ? (
            <Button
              onClick={startSpin}
              disabled={!player}
              icon={<IconHandFinger className="size-6" stroke={2} aria-hidden />}
            >
              Spin!
            </Button>
          ) : (
            watching
          )
        }
      >
        <GameHeader
          title={GAME_NAMES.spin}
          logoUrl={logo?.imageUrl ?? null}
          seconds={stage === 'ready' ? secondsLeft : null}
          total={lockSeconds}
        />
        <div className="px-1 py-3">
          <Wheel segments={entry.display.segments} wheelRef={wheel.wheelRef} />
        </div>
        <Bubble>
          {stage !== 'ready'
            ? 'Spinning... fingers crossed!'
            : player
              ? `Tap SPIN and good luck, ${player.name}!`
              : 'Tap SPIN and good luck!'}
        </Bubble>
        {stage === 'ready' && !player ? <PlayerDetailsSheet onDone={setPlayer} /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      badge={badge}
      actions={
        stage === 'ready' ? (
          <Bubble>{player ? `Tap any box, ${player.name}!` : 'Tap any box to open it'}</Bubble>
        ) : (
          watching
        )
      }
    >
      <GameHeader
        title={GAME_NAMES['lucky-dip']}
        logoUrl={logo?.imageUrl ?? null}
        seconds={stage === 'ready' ? secondsLeft : null}
        total={lockSeconds}
      />
      <h2 className="text-center font-display text-[24px] font-bold">
        {dipPhase === 'pick' ? 'Pick a box!' : 'Opening your box...'}
      </h2>
      <LuckyDip
        boxes={entry.display.boxes}
        phase={stage === 'ready' && dipPhase === 'pick' ? 'pick' : dipPhase}
        picked={picked}
        prize={play.data?.result?.prize ?? null}
        canPick={Boolean(player)}
        onPick={(index) => {
          setStage('playing');
          pickBox(index);
        }}
        onRevealed={showResult}
      />
      {stage === 'ready' && !player ? <PlayerDetailsSheet onDone={setPlayer} /> : null}
    </Screen>
  );
}

/** Big game title with the logo, and the screen reservation timer as a glass chip with a draining bar. */
function GameHeader({
  title,
  logoUrl,
  seconds,
  total,
}: { title: string; logoUrl: string | null; seconds: number | null; total: number }) {
  const urgent = seconds !== null && seconds <= 10;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="size-16 rounded-2xl bg-white object-contain p-1.5 shadow-lg animate-pop"
        />
      ) : null}
      <h1 className="font-display text-[34px] leading-none font-bold tracking-wide uppercase drop-shadow-[0_3px_0_rgb(0_0_0/0.25)]">
        {title}
      </h1>
      {seconds !== null ? (
        <div className="glass flex w-full max-w-[300px] items-center gap-3 rounded-full px-4 py-2">
          <IconClockHour4
            className={`size-5 shrink-0 ${urgent ? 'text-coral' : 'text-sun'}`}
            stroke={2}
            aria-hidden
          />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-coral' : 'bg-gradient-to-r from-sun to-tangerine'}`}
              style={{ width: `${Math.min(100, (seconds / total) * 100)}%` }}
            />
          </div>
          <span
            className={`font-display text-[17px] font-bold tabular-nums ${urgent ? 'text-coral' : 'text-white'}`}
          >
            {formatSeconds(seconds)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Speech bubble style hint, like the game's own voice. */
function Bubble({ children }: { children: string }) {
  return (
    <p className="glass mx-auto rounded-2xl px-5 py-3 text-center font-display text-[17px] font-semibold">
      {children}
    </p>
  );
}
