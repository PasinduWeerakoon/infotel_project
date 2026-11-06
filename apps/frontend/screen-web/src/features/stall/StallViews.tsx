/**
 * The pieces of the stall screen (wireframes G1 and G2) in the arcade look: the frame, the idle
 * view with the changeable logos, the reserved view, the result view and the closed view.
 * Sized in viewport units for a 16:9 TV seen from a few metres away.
 */
import { IconClockHour4, IconHandFinger, IconMoodSmile, IconPhoto, IconTrophy } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { GAME_NAMES, type Game, type Logo, type SessionBrief } from '../../api/screens';
import { ConnectionLost } from '../../components/ConnectionLost';
import { PrizeImage } from '../../components/PrizeImage';
import { QrCode } from '../../components/QrCode';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { formatTime, formatWhen } from '../../lib/format';
import { QR_MODE, qrTargetUrl } from '../../lib/qr';
import { IdleSide } from './IdleSides';

export function StallFrame({
  session,
  eventLogo,
  offline,
  children,
}: {
  session: SessionBrief | null;
  eventLogo: Logo | undefined;
  offline: boolean;
  children: ReactNode;
}) {
  return (
    <div className="arcade-bg flex h-dvh flex-col gap-[3vh] overflow-hidden px-[4vw] py-[4vh]">
      <header className="flex items-center justify-between gap-6">
        <div className="glass flex items-center gap-3 rounded-full py-[0.8vh] pr-[2vw] pl-[0.8vh]">
          <img
            src={eventLogo?.imageUrl ?? '/favicon.svg'}
            alt=""
            className="h-[6vh] w-[6vh] rounded-full bg-white object-contain"
          />
          <span className="font-display text-[3vh] font-bold">LKDR Games</span>
        </div>
        <div className="flex items-center gap-3 text-[2.2vh] font-bold">
          {session ? (
            <span className="glass flex items-center gap-2.5 rounded-full px-5 py-2">
              <span className="size-[1.4vh] rounded-full bg-mint animate-twinkle" aria-hidden />
              Open now · until {formatTime(session.endsAt)}
            </span>
          ) : null}
          {session ? <EndsIn endsAt={session.endsAt} /> : null}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col animate-rise">{children}</main>
      <ConnectionLost offline={offline} />
    </div>
  );
}

function EndsIn({ endsAt }: { endsAt: string }) {
  const seconds = useCountdown(endsAt);
  return (
    <span className="glass flex items-center gap-2 rounded-full px-5 py-2 tabular-nums">
      <IconClockHour4 className="size-[2.6vh] text-sun" stroke={2} aria-hidden />
      <span className="text-haze">Ends in</span>
      {formatSeconds(seconds)}
    </span>
  );
}

const CARD_GLOW: Record<Game, string> = {
  spin: 'from-coral via-tangerine to-sun',
  'lucky-dip': 'from-sky via-grape to-candy',
};

/** G1: waiting for a player. Logos are uploaded in the admin dashboard and can change at any time. */
export function IdleView({ logos, game }: { logos: Logo[]; game: Game | null }) {
  const gameLogos = (['spin', 'lucky-dip'] as Game[]).map((target) => ({
    target,
    logo: logos.find((l) => l.logoType === 'game' && l.targetId === target),
  }));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vh]">
      <div className="text-center">
        <h1 className="font-display text-[7vh] leading-none font-bold uppercase drop-shadow-[0_5px_0_rgb(0_0_0/0.3)]">
          Scan to <span className="rainbow-text">play & win!</span>
        </h1>
        <p className="mt-[1.5vh] text-[2.8vh] font-semibold text-haze">
          {QR_MODE
            ? 'Scan a QR code with your phone camera. One play per session.'
            : 'Visit q.lk and scan the logo of your preferred game to get started!'}
        </p>
      </div>
      <div className="flex min-h-0 items-center gap-[2vw]">
        <IdleSide side="left" />
        {/* A clear gap between the two logos, so QuickLook scans one at a time */}
        <div className="flex items-center gap-[4vw]">
          {gameLogos.map(({ target, logo }) => (
            <div
              key={target}
              className={`rounded-[4vh] bg-gradient-to-br p-[0.6vh] ${CARD_GLOW[target]} ${target === game ? 'scale-105 shadow-[0_30px_80px_-20px_rgb(255_205_31/0.6)]' : 'opacity-90'}`}
            >
              {QR_MODE && logo ? (
                <QrCard logo={logo} name={GAME_NAMES[target]} />
              ) : (
                <div className="flex w-[min(23vw,41vh)] flex-col items-center gap-[1.6vh] rounded-[3.5vh] bg-night/85 p-[2.5vh]">
                  {logo?.imageUrl ? (
                    <img
                      src={logo.imageUrl}
                      alt=""
                      className="aspect-square w-full rounded-[2.5vh] bg-white object-contain p-[2vh]"
                    />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-[2.5vh] bg-white/10 text-lilac">
                      <IconPhoto className="size-[10vh]" stroke={1.2} aria-hidden />
                    </div>
                  )}
                  <span className="font-display text-[3.8vh] leading-none font-bold">
                    {GAME_NAMES[target]}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <IdleSide side="right" />
      </div>
    </div>
  );
}

/** Test mode card: a large QR code with the uploaded logo as a badge next to the name */
export function QrCard({ logo, name, size = 'h-[36vh]' }: { logo: Logo; name: string; size?: string }) {
  const url = qrTargetUrl(logo);
  return (
    <div className="flex flex-col items-center gap-[2vh] rounded-[3.5vh] bg-night/85 p-[2.5vh]">
      {url ? <QrCode value={url} className={size} /> : null}
      <div className="flex items-center gap-[1.2vw]">
        {logo.imageUrl ? (
          <img
            src={logo.imageUrl}
            alt=""
            className="size-[7vh] rounded-[1.6vh] bg-white object-contain p-[0.5vh]"
          />
        ) : null}
        <span className="font-display text-[3.6vh] leading-none font-bold">{name}</span>
      </div>
    </div>
  );
}

/** G2.1: one visitor has the screen. */
export function ReservedView({ game, expiresAt }: { game: Game; expiresAt: string }) {
  const seconds = useCountdown(expiresAt);
  return (
    <Center
      sticker="from-sun-light to-tangerine"
      icon={<IconHandFinger className="size-[9vh] text-white" stroke={2} aria-hidden />}
    >
      <h1 className="font-display text-[7vh] leading-tight font-bold">Get ready!</h1>
      <p className="text-[3.4vh] font-semibold text-haze">
        A player is about to {game === 'spin' ? 'spin the wheel' : 'pick a box'}
      </p>
      <span className="glass rounded-full px-6 py-2 text-[2.8vh] font-bold tabular-nums">
        Screen free again in {formatSeconds(seconds)}
      </span>
    </Center>
  );
}

/** G2.4 and G2.5: the outcome. No name, phone number or reference is ever shown here. */
export function ResultView({
  prize,
  player,
}: {
  prize: { name: string; imageUrl: string | null } | null;
  player: { name: string; phone: string } | null;
}) {
  // Every play wins (project document). Kept only as a safe fallback, never with "try again"
  if (!prize) {
    return (
      <Center
        sticker="from-sky to-grape"
        icon={<IconMoodSmile className="size-[9vh] text-white" stroke={2} aria-hidden />}
      >
        <h1 className="font-display text-[8vh] font-bold">Thanks for playing!</h1>
      </Center>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      <p className="rainbow-text font-display text-[11vh] leading-none font-bold animate-pop">WINNER!</p>
      {player ? (
        <div className="flex flex-col items-center gap-[0.6vh] animate-pop">
          <p className="max-w-[80vw] truncate font-display text-[6vh] leading-none font-bold">
            {player.name}
          </p>
          {player.phone ? (
            <p className="text-[3vh] font-bold tracking-[0.08em] text-haze tabular-nums">{player.phone}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-[4vw] rounded-[4vh] bg-white px-[4vw] py-[3vh] text-night shadow-[0_40px_100px_-30px_rgb(0_0_0/0.7)] animate-pop">
        <PrizeImage src={prize.imageUrl} alt={prize.name} className="size-[26vh]" />
        <div className="flex flex-col items-start gap-[1vh]">
          <span className="flex items-center gap-2 text-[2.6vh] font-extrabold tracking-[0.14em] text-tangerine uppercase">
            <IconTrophy className="size-[3vh]" stroke={2.2} aria-hidden /> You won
          </span>
          <h2 className="max-w-[40vw] text-left font-display text-[7vh] leading-none font-bold text-violet">
            {prize.name}
          </h2>
          <p className="text-[2.4vh] font-semibold text-night/60">
            Reference on the player's phone. Collect at the prize desk.
          </p>
        </div>
      </div>
    </div>
  );
}

/** G2.6: no session, or the game is paused. */
export function ClosedView({ nextSession }: { nextSession: SessionBrief | null }) {
  return (
    <Center
      sticker="from-grape to-candy"
      icon={<IconClockHour4 className="size-[9vh] text-white" stroke={2} aria-hidden />}
    >
      <h1 className="font-display text-[7vh] font-bold">Back soon!</h1>
      <p className="text-[3.4vh] font-semibold text-haze">
        {nextSession
          ? `Next session ${formatWhen(nextSession.startsAt)} to ${formatTime(nextSession.endsAt)}`
          : 'See you at the next session'}
      </p>
    </Center>
  );
}

function Center({ sticker, icon, children }: { sticker: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      <div
        className={`grid size-[18vh] rotate-[-6deg] place-items-center rounded-[5vh] bg-gradient-to-br ring-[1vh] ring-white/20 animate-pop ${sticker}`}
      >
        {icon}
      </div>
      {children}
    </div>
  );
}
