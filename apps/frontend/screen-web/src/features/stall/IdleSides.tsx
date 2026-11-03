/**
 * The playful side columns of the idle screen: three or four words per sticker, readable from
 * across the room. Stickers pop in one after another, tilt a little and float, so the screen
 * feels alive while it waits. Shown on landscape screens only (16:9 TVs and laptops).
 */
import {
  IconConfetti,
  IconDeviceMobile,
  IconGift,
  IconHandFinger,
  IconRosetteDiscountCheck,
  IconScan,
  type TablerIcon,
} from '@tabler/icons-react';

interface Sticker {
  icon: TablerIcon;
  /** First line, big */
  title: string;
  /** Second line, small */
  hint: string;
  /** Gradient of the round icon badge */
  badge: string;
}

const HOW_TO_PLAY: Sticker[] = [
  { icon: IconScan, title: 'Scan', hint: 'any code', badge: 'from-sky to-grape' },
  { icon: IconHandFinger, title: 'Spin or pick', hint: 'on your phone', badge: 'from-candy to-grape' },
  { icon: IconGift, title: 'Win!', hint: 'grab a prize', badge: 'from-sun to-tangerine' },
];

const GOOD_TO_KNOW: Sticker[] = [
  { icon: IconDeviceMobile, title: 'One play', hint: 'every session', badge: 'from-mint to-sky' },
  { icon: IconRosetteDiscountCheck, title: 'Always fair', hint: 'drawn by us', badge: 'from-grape to-candy' },
  { icon: IconConfetti, title: 'Prize desk', hint: 'show your code', badge: 'from-coral to-tangerine' },
];

export function IdleSide({ side }: { side: 'left' | 'right' }) {
  const left = side === 'left';
  const stickers = left ? HOW_TO_PLAY : GOOD_TO_KNOW;
  return (
    <aside
      className={`hidden w-[19vw] flex-col gap-[3vh] landscape:flex ${left ? 'items-end' : 'items-start'}`}
      aria-label={left ? 'How to play' : 'Good to know'}
    >
      <span
        className={`rounded-full px-[1.6vw] py-[0.8vh] font-display text-[2.4vh] font-bold tracking-[0.12em] text-night uppercase shadow-[0_6px_0_rgb(0_0_0/0.25)] animate-pop ${left ? 'rotate-[-4deg] bg-sun' : 'rotate-[4deg] bg-mint'}`}
      >
        {left ? 'How to play' : 'Psst!'}
      </span>
      {stickers.map((sticker, i) => (
        <StickerChip key={sticker.title} sticker={sticker} index={i} left={left} />
      ))}
    </aside>
  );
}

function StickerChip({ sticker, index, left }: { sticker: Sticker; index: number; left: boolean }) {
  const Icon = sticker.icon;
  // Alternate the tilt and nudge every other sticker inwards, like stickers slapped on a wall
  const tilt = (index % 2 === 0) === left ? '-rotate-2' : 'rotate-2';
  const nudge = index % 2 === 1 ? (left ? 'mr-[2vw]' : 'ml-[2vw]') : '';
  return (
    <div className={`animate-pop ${nudge}`} style={{ animationDelay: `${150 + index * 160}ms` }}>
      <div className="animate-float" style={{ animationDelay: `${index * 0.5}s` }}>
        <div
          className={`glass flex items-center gap-[1vw] rounded-full py-[1vh] ${tilt} ${left ? 'flex-row-reverse pr-[1vh] pl-[1.8vw] text-right' : 'pr-[1.8vw] pl-[1vh]'}`}
        >
          <span
            className={`grid size-[7vh] shrink-0 place-items-center rounded-full bg-gradient-to-br ring-[0.5vh] ring-white/25 ${sticker.badge}`}
          >
            <Icon className="size-[3.8vh] text-white" stroke={2.2} aria-hidden />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[3.2vh] font-bold">{sticker.title}</span>
            <span className="mt-[0.6vh] text-[2vh] font-bold text-haze">{sticker.hint}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
