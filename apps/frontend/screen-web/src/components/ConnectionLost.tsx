/**
 * Shown on a venue screen when it loses its live connection, so staff can see at a glance that
 * the picture may be out of date. Appears after a short grace period (quick blips stay hidden)
 * and counts how long the screen has been offline.
 */
import { IconWifiOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { formatTime } from '../lib/format';

const GRACE_MS = 4000;

export function ConnectionLost({ offline, lastUpdate }: { offline: boolean; lastUpdate?: number }) {
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!offline) {
      setSince(null);
      return;
    }
    setSince((current) => current ?? Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [offline]);

  if (since === null || now - since < GRACE_MS) return null;
  const minutes = Math.floor((now - since) / 60_000);

  return (
    <div role="alert" className="fixed inset-x-0 bottom-[4vh] z-50 flex justify-center px-[4vw] animate-rise">
      <div className="flex items-center gap-[1.6vw] rounded-[3vh] bg-coral px-[2.4vw] py-[2vh] text-white shadow-[0_10px_0_rgb(0_0_0/0.25)]">
        <IconWifiOff className="size-[6vh] shrink-0" stroke={2} aria-hidden />
        <div className="leading-tight">
          <p className="font-display text-[3.6vh] font-bold">Connection lost. Reconnecting...</p>
          <p className="mt-[0.6vh] text-[2.2vh] font-bold text-white/85">
            {lastUpdate
              ? `Showing the last update from ${formatTime(new Date(lastUpdate).toISOString())}. `
              : ''}
            {minutes >= 1
              ? `Offline for ${minutes} min. Please check the internet connection of this screen.`
              : 'This screen will update by itself once it is back online.'}
          </p>
        </div>
      </div>
    </div>
  );
}
