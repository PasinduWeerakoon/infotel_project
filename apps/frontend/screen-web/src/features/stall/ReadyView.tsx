/**
 * G2.1: a player has just opened the game on their phone. The big screen shows the same wheel
 * (or the 3D gift boxes) straight away, so the crowd sees what is about to happen. The wheel
 * stands still at its starting angle, so the spin that follows starts from exactly this picture.
 */
import { useRef } from 'react';
import type { Game, Segment } from '../../api/screens';
import { GIFT_COLORS, GiftBox3D } from '../../components/gift/GiftBox3D';
import { formatSeconds, useCountdown } from '../../hooks/useCountdown';
import { Wheel } from './Wheel';

export function ReadyView({
  game,
  segments,
  expiresAt,
}: { game: Game; segments: Segment[]; expiresAt: string }) {
  const seconds = useCountdown(expiresAt);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  const caption = (
    <>
      <h1 className="font-display text-[8vh] leading-none font-bold uppercase">Get ready!</h1>
      <p className="mt-[2vh] text-[3vh] font-bold text-sun animate-twinkle">
        A player is about to {game === 'spin' ? 'spin the wheel' : 'pick a box'}
      </p>
      <span className="glass mt-[3vh] inline-block rounded-full px-6 py-2 text-[2.4vh] font-bold tabular-nums">
        Screen free again in {formatSeconds(seconds)}
      </span>
    </>
  );

  if (game === 'spin') {
    return (
      <div className="flex flex-1 items-center justify-center gap-[6vw]">
        <div className="h-[72vh] w-[72vh]">
          <Wheel segments={segments} wheelRef={wheelRef} />
        </div>
        <div className="max-w-[32vw]">{caption}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vh] text-center">
      <div className="flex items-end gap-[6vw] pt-[8vh]">
        {[0, 4, 2].map((color, box) => (
          <GiftBox3D
            key={color}
            size="20vh"
            colors={GIFT_COLORS[color] ?? (['#9b5cff', '#ff4fcf'] as const)}
            delay={box * 0.5}
          />
        ))}
      </div>
      <div>{caption}</div>
    </div>
  );
}
