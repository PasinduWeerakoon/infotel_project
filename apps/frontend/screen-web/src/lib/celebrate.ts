/**
 * Win effects: confetti (loaded only when needed) and a short vibration on Android.
 * iPhones do not allow websites to vibrate, so that part is skipped there.
 */
export async function celebrate(big: boolean): Promise<void> {
  navigator.vibrate?.(big ? [60, 40, 120] : 80);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#ffcd1f', '#ff5470', '#22d98e', '#38b6ff', '#ff4fcf', '#9b5cff', '#ff8a1e'];
  confetti({
    particleCount: big ? 140 : 80,
    spread: 75,
    origin: { y: 0.35 },
    colors,
    disableForReducedMotion: true,
  });
  if (big) {
    setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0 }, colors }), 250);
    setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1 }, colors }), 400);
  }
}
