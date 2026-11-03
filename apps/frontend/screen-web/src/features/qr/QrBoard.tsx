/**
 * /qr  Test mode QR board for one 16:9 display: both game logos with their QR codes, so a test
 * round can be played from a single screen. Treasure Hunt stalls have no QR codes: visitors scan
 * the real logos with the QuickLook app.
 * Logos come from the platform, so new or changed logos appear without a rebuild.
 */
import { useQuery } from '@tanstack/react-query';
import { screensApi } from '../../api/screens';
import { QR_MODE } from '../../lib/qr';
import { QrCard } from '../stall/StallViews';

const ORDER = ['game'];

export function QrBoard() {
  const logos = useQuery({ queryKey: ['logos'], queryFn: screensApi.logos, refetchInterval: 60_000 });
  const scannable = (logos.data?.items ?? [])
    .filter((logo) => ORDER.includes(logo.logoType))
    .sort((a, b) => ORDER.indexOf(a.logoType) - ORDER.indexOf(b.logoType) || a.name.localeCompare(b.name));

  return (
    <div className="arcade-bg flex h-dvh flex-col gap-[3vh] overflow-hidden px-[3vw] py-[4vh]">
      <header className="text-center">
        <h1 className="font-display text-[6vh] leading-none font-bold uppercase drop-shadow-[0_5px_0_rgb(0_0_0/0.3)]">
          Scan to <span className="rainbow-text">play & win!</span>
        </h1>
        <p className="mt-[1.2vh] text-[2.4vh] font-semibold text-haze">
          {QR_MODE
            ? 'Point your phone camera at a code. One play per session.'
            : 'QR codes are shown in test environments only.'}
        </p>
      </header>
      {QR_MODE ? (
        <main className="flex min-h-0 flex-1 items-center justify-center gap-[6vw]">
          {scannable.map((logo) => (
            <QrCard key={logo.logoId} logo={logo} name={logo.name} size="h-[44vh]" />
          ))}
        </main>
      ) : null}
    </div>
  );
}
