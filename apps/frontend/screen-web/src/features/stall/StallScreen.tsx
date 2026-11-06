/**
 * /stall?key=... — the big screen at the Spin the Wheel or Lucky Dip stall, or the main display
 * that follows both games (opened from the games web address in test builds).
 *
 * Follows the server over the WebSocket: idle (logos), reserved for one player, the same
 * animation the player sees on the phone, the prize, then idle again. When the animation is
 * finished it tells the server, which frees the screen for the next visitor.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  type Game,
  type ScreenMessage,
  type Segment,
  type SessionBrief,
  screensApi,
} from '../../api/screens';
import { PrizeImage } from '../../components/PrizeImage';
import { GIFT_COLORS, GiftBox3D } from '../../components/gift/GiftBox3D';
import { useScreenSocket } from '../../hooks/useScreenSocket';
import { celebrate } from '../../lib/celebrate';
import { ReadyView } from './ReadyView';
import { ClosedView, IdleView, ReservedView, ResultView, StallFrame } from './StallViews';
import { Wheel } from './Wheel';
import { useWheelSpin } from './useWheelSpin';

type View =
  | { kind: 'idle' }
  | { kind: 'closed' }
  | { kind: 'reserved'; entryId: string; game: Game; expiresAt: string; segments: Segment[] }
  | { kind: 'playing' | 'result'; play: Extract<ScreenMessage, { type: 'play.result' }> };

const RESULT_SECONDS = 9;
/** Lucky Dip on the big screen: the box spins this long before it opens */
const DIP_SPIN_MS = 1500;
const DIP_COLORS = GIFT_COLORS[4] ?? (['#9b5cff', '#ff4fcf'] as const);

export function StallScreen() {
  const [params] = useSearchParams();
  const screenKey = params.get('key');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [session, setSession] = useState<SessionBrief | null>(null);
  const [nextSession, setNextSession] = useState<SessionBrief | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const busy = useRef(false); // true while an animation or result is on screen

  const logos = useQuery({ queryKey: ['logos'], queryFn: screensApi.logos, refetchInterval: 60_000 });

  const onMessage = useCallback(
    (message: ScreenMessage) => {
      switch (message.type) {
        case 'screen.state':
          setSession(message.session);
          setNextSession(message.nextSession);
          setGame(message.game);
          if (!busy.current) setView({ kind: message.state === 'closed' ? 'closed' : 'idle' });
          break;
        case 'entry.started':
          if (!busy.current)
            setView({
              kind: 'reserved',
              entryId: message.entryId,
              game: message.game,
              expiresAt: message.expiresAt,
              segments: message.segments ?? [],
            });
          break;
        case 'play.result':
          busy.current = true;
          setView({ kind: 'playing', play: message });
          break;
        case 'entry.ended':
          setView((current) =>
            current.kind === 'reserved' && current.entryId === message.entryId ? { kind: 'idle' } : current,
          );
          break;
        case 'refresh':
          void logos.refetch();
          break;
      }
    },
    [logos],
  );

  const { connection, send } = useScreenSocket(screenKey, onMessage);

  // After the animation: show the result for a few seconds, then free the screen
  const finishPlay = useCallback(
    (play: Extract<ScreenMessage, { type: 'play.result' }>) => {
      setView({ kind: 'result', play });
      if (play.prize) void celebrate(true);
      window.setTimeout(() => {
        busy.current = false;
        send({ type: 'animation.finished', entryId: play.entryId });
        setView({ kind: 'idle' });
      }, RESULT_SECONDS * 1000);
    },
    [send],
  );

  if (!screenKey || connection === 'rejected') {
    return (
      <div className="arcade-bg grid h-dvh place-items-center p-10 text-center">
        <div>
          <h1 className="font-display text-[5vh] font-bold">This screen is not set up</h1>
          <p className="mt-2 text-[2.6vh] text-haze">
            Please open the screen link you were given. Screen links never change.
          </p>
        </div>
      </div>
    );
  }

  const eventLogo = logos.data?.items.find((l) => l.logoType === 'display' && l.targetId === 'event');

  return (
    <StallFrame session={session} eventLogo={eventLogo} offline={connection === 'offline'}>
      {view.kind === 'idle' ? <IdleView logos={logos.data?.items ?? []} game={game} /> : null}
      {view.kind === 'closed' ? <ClosedView nextSession={nextSession} /> : null}
      {view.kind === 'reserved' && view.segments.length > 0 ? (
        <ReadyView game={view.game} segments={view.segments} expiresAt={view.expiresAt} />
      ) : null}
      {view.kind === 'reserved' && view.segments.length === 0 ? (
        <ReservedView game={view.game} expiresAt={view.expiresAt} />
      ) : null}
      {view.kind === 'playing' ? <PlayingView play={view.play} onDone={() => finishPlay(view.play)} /> : null}
      {view.kind === 'result' ? (
        <ResultView prize={view.play.prize} player={view.play.player ?? null} />
      ) : null}
    </StallFrame>
  );
}

/** G2.2 and G2.3: the same animation as on the player's phone, landing on the drawn prize. */
function PlayingView({
  play,
  onDone,
}: { play: Extract<ScreenMessage, { type: 'play.result' }>; onDone: () => void }) {
  const wheel = useWheelSpin(play.segments.length);
  const [boxOpen, setBoxOpen] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const name = play.player?.name;

  // biome-ignore lint/correctness/useExhaustiveDependencies: start once per play message
  useEffect(() => {
    if (play.game === 'spin') {
      wheel.start();
      const timer = window.setTimeout(() => wheel.land(play.target, () => done.current()), 700);
      return () => window.clearTimeout(timer);
    }
    // Lucky Dip: the box spins a moment for the crowd, then opens (GiftBox3D calls back when the prize is out)
    const timer = window.setTimeout(() => setBoxOpen(true), DIP_SPIN_MS);
    return () => window.clearTimeout(timer);
  }, [play]);

  if (play.game === 'spin') {
    return (
      <div className="flex flex-1 items-center justify-center gap-[6vw]">
        <div className="h-[72vh] w-[72vh]">
          <Wheel segments={play.segments} wheelRef={wheel.wheelRef} />
        </div>
        <div className="max-w-[32vw]">
          <h1 className="font-display text-[8vh] leading-none font-bold uppercase">Spinning!</h1>
          {name ? <p className="mt-[2vh] font-display text-[5vh] leading-tight font-bold">{name}</p> : null}
          <p className="mt-[2vh] animate-twinkle text-[3vh] font-bold text-sun">Fingers crossed...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center gap-[8vw]">
      <div className="relative h-[80vh] w-[46vh]">
        <div className="absolute top-[68%] left-1/2 -translate-x-1/2 -translate-y-1/2">
          <GiftBox3D
            size="30vh"
            colors={DIP_COLORS}
            spinning
            open={boxOpen}
            rise={1.3}
            onRevealed={() => window.setTimeout(() => done.current(), 900)}
            prize={
              play.prize ? (
                <div className="gb-prize-card">
                  <PrizeImage
                    src={play.prize.imageUrl}
                    alt=""
                    className="aspect-square w-full p-[1vh] shadow-none"
                  />
                  <span className="gb-prize-name">{play.prize.name}</span>
                </div>
              ) : null
            }
          />
        </div>
      </div>
      <div className="w-[36vw]">
        <h1 className="font-display text-[8vh] leading-none font-bold uppercase">
          {boxOpen ? 'Surprise!' : 'Opening the box...'}
        </h1>
        {name ? <p className="mt-[2vh] font-display text-[5vh] leading-tight font-bold">{name}</p> : null}
        {play.player?.phone ? (
          <p className="mt-[1vh] text-[3vh] font-bold tracking-[0.08em] text-haze tabular-nums">
            {play.player.phone}
          </p>
        ) : null}
        <p className="mt-[2vh] animate-twinkle text-[3vh] font-bold text-sun">
          {boxOpen && play.prize ? play.prize.name : 'Fingers crossed...'}
        </p>
      </div>
    </div>
  );
}
