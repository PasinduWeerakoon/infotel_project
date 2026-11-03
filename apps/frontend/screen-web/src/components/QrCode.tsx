/**
 * A QR code drawn in the browser (no request to any QR service). Dark modules use the arcade
 * night colour on a white tile so phone cameras read it easily from a distance.
 */
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function QrCode({ value, className = '' }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 640, color: { dark: '#170e3f', light: '#ffffff' } })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [value]);

  return (
    <div className={`aspect-square rounded-[2vh] bg-white p-[1.2vh] ${className}`}>
      {src ? <img src={src} alt="QR code" className="size-full [image-rendering:pixelated]" /> : null}
    </div>
  );
}
