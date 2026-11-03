/**
 * Lucky Dip: nine 3D gift boxes. The visitor taps one: it flies forward to the middle of the
 * screen and spins while the server draws the prize, then slows down, the lid opens and the
 * prize rises out. Which box is tapped does not change the result.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Prize } from '../../api/games';
import { GIFT_COLORS, GiftBox3D, type GiftColors } from '../../components/gift/GiftBox3D';
import { PrizeImage } from '../../components/ui/PrizeImage';

export type DipPhase = 'pick' | 'opening' | 'revealed';

/** Box edge in the grid, and in the middle once picked */
const GRID_BOX = 58;
const STAGE_BOX = 116;
/** The flight to the middle, before the spin starts */
const FLIGHT_MS = 650;

interface LuckyDipProps {
  boxes: number;
  phase: DipPhase;
  picked: number | null;
  prize: Prize | null;
  /** False until the player has typed their name and phone */
  canPick: boolean;
  onPick: (index: number) => void;
  /** The prize is fully out of the box */
  onRevealed: () => void;
}

/** Where the picked box starts its flight, relative to the middle of the stage */
interface Flight {
  dx: number;
  dy: number;
  arrived: boolean;
}

export function LuckyDip({ boxes, phase, picked, prize, canPick, onPick, onRevealed }: LuckyDipProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [landed, setLanded] = useState(false);

  const pick = (index: number, button: HTMLButtonElement) => {
    const area = areaRef.current?.getBoundingClientRect();
    const from = button.getBoundingClientRect();
    if (area) {
      setFlight({
        dx: from.left + from.width / 2 - (area.left + area.width / 2),
        dy: from.top + from.height * 0.62 - (area.top + area.height * 0.74),
        arrived: false,
      });
    }
    onPick(index);
  };

  // Start the flight on the next frame, so the box is first drawn where it was tapped
  const flying = flight !== null;
  useLayoutEffect(() => {
    if (!flying) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setFlight((f) => (f ? { ...f, arrived: true } : f))),
    );
    const timer = window.setTimeout(() => setLanded(true), FLIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flying]);

  const colors = (index: number): GiftColors =>
    GIFT_COLORS[index % GIFT_COLORS.length] ?? ['#ff5470', '#ff4fcf'];
  const startScale = GRID_BOX / STAGE_BOX;

  return (
    <div ref={areaRef} className="relative">
      <div className="grid grid-cols-3 gap-x-2 gap-y-1">
        {Array.from({ length: boxes }, (_, index) => {
          const isPicked = picked === index;
          const faded = picked !== null && !isPicked;
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: boxes are fixed positions
              key={index}
              type="button"
              aria-label={`Box ${index + 1}`}
              disabled={phase !== 'pick' || !canPick}
              onClick={(event) => pick(index, event.currentTarget)}
              style={{ animationDelay: `${index * 60}ms` }}
              className={`grid h-[104px] animate-pop place-items-center pt-6 ${phase === 'pick' ? 'active:scale-95' : ''}`}
            >
              {/* The fade sits inside, because the pop animation would override it on the button */}
              <div
                className={`transition-[opacity,filter,scale] duration-500 ${faded ? 'scale-75 opacity-15 blur-[2px]' : ''} ${isPicked ? 'opacity-0' : ''}`}
              >
                <GiftBox3D size={`${GRID_BOX}px`} colors={colors(index)} delay={index * 0.35} />
              </div>
            </button>
          );
        })}
      </div>

      {picked !== null && flight ? (
        <div
          className="pointer-events-none absolute top-[74%] left-1/2 z-10"
          style={{
            transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            transform: flight.arrived
              ? 'translate(-50%, -50%)'
              : `translate(calc(-50% + ${flight.dx}px), calc(-50% + ${flight.dy}px)) scale(${startScale})`,
          }}
        >
          <GiftBox3D
            size={`${STAGE_BOX}px`}
            colors={colors(picked)}
            spinning={landed}
            open={landed && phase === 'revealed' && Boolean(prize)}
            onRevealed={onRevealed}
            rise={1.3}
            prize={
              prize ? (
                <div className="gb-prize-card">
                  <PrizeImage src={prize.imageUrl} alt="" className="aspect-square w-full p-1 shadow-none" />
                  <span className="gb-prize-name">{prize.name}</span>
                </div>
              ) : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}
