/**
 * Wheel motion without waiting moments:
 * 1. `start()` spins up at once when the visitor taps (before the server answers)
 * 2. `land(target)` eases into the winning segment once the server's result arrives
 *
 * The angle is written straight to the element's transform on each animation frame,
 * so React does not re-render 60 times a second (smooth on mid-range phones).
 */
import { useCallback, useEffect, useRef } from 'react';

const SPIN_SPEED = 720; // degrees per second while waiting for the result
const SPIN_UP_MS = 500;
const MIN_EXTRA_TURNS = 3;

export function useWheelSpin(segmentCount: number) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const angle = useRef(0);
  const frame = useRef(0);

  const apply = useCallback(() => {
    if (wheelRef.current) wheelRef.current.style.transform = `rotate(${angle.current}deg)`;
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** Free spin, accelerating from rest. Keeps going until `land` is called. */
  const start = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const startedAt = performance.now();
    let last = startedAt;
    const tick = (now: number) => {
      const ramp = Math.min(1, (now - startedAt) / SPIN_UP_MS);
      angle.current += (SPIN_SPEED * ramp * (now - last)) / 1000;
      last = now;
      apply();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [apply]);

  /**
   * Eases from the current speed into the centre of the target segment (with a small random offset
   * so it looks natural). Ease-out cubic starting at the free-spin speed, so there is no jump.
   */
  const land = useCallback(
    (target: number, onDone: () => void) => {
      cancelAnimationFrame(frame.current);
      const slice = 360 / segmentCount;
      const jitter = (Math.random() - 0.5) * slice * 0.5;
      // The pointer is at the top. Segment i sits under it when the wheel is turned by -(i + 0.5) slices.
      const targetMod = (((-(target + 0.5) * slice + jitter) % 360) + 360) % 360;
      const from = angle.current;
      let to = from - (from % 360) + targetMod;
      while (to < from + MIN_EXTRA_TURNS * 360) to += 360;

      const distance = to - from;
      const duration = (3 * distance * 1000) / SPIN_SPEED; // matches the current speed at the start
      const startedAt = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / duration);
        angle.current = from + distance * (1 - (1 - t) ** 3);
        apply();
        if (t < 1) frame.current = requestAnimationFrame(tick);
        else onDone();
      };
      frame.current = requestAnimationFrame(tick);
    },
    [segmentCount, apply],
  );

  /** Stops where it is (used when the play request fails). */
  const stop = useCallback(() => cancelAnimationFrame(frame.current), []);

  return { wheelRef, start, land, stop };
}
