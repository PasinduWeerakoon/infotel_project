import { IconGift } from '@tabler/icons-react';
import { useState } from 'react';

/** Prize picture uploaded in the admin dashboard on a white tile, or a bright gift when there is none. */
export function PrizeImage({
  src,
  alt,
  className = 'size-40',
}: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center rounded-[28px] bg-gradient-to-br from-candy via-grape to-sky shadow-[0_16px_40px_-12px_rgb(255_79_207/0.6)] ${className}`}
      >
        <IconGift className="size-1/2 text-white drop-shadow-lg" stroke={1.6} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`rounded-[28px] bg-white object-contain p-4 shadow-[0_16px_40px_-12px_rgb(255_255_255/0.35)] ${className}`}
      decoding="async"
    />
  );
}
