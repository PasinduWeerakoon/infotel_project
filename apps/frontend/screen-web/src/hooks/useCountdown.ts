import { useEffect, useState } from 'react';

const secondsUntil = (iso: string | undefined) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)) : 0;

/** Seconds left until a time, updated every second. Never below zero. */
export function useCountdown(untilIso: string | undefined): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(untilIso));

  useEffect(() => {
    setSeconds(secondsUntil(untilIso));
    const timer = window.setInterval(() => setSeconds(secondsUntil(untilIso)), 1000);
    return () => window.clearInterval(timer);
  }, [untilIso]);

  return seconds;
}

/** 0:52, or 1:05:09 when an hour or more is left */
export function formatSeconds(total: number): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}:${two(minutes)}:${two(total % 60)}` : `${minutes}:${two(total % 60)}`;
}
