/**
 * Test mode QR codes. In production, visitors scan the logos with the QuickLook app. For testing
 * without QuickLook, the build sets the app addresses below and the screens show a QR code per
 * logo that opens our apps directly at /q/{logoId}, just like QuickLook's redirect would.
 */
import type { Logo } from '../api/screens';

const GAMES_URL = import.meta.env.VITE_QR_GAMES_URL;
const HUNT_URL = import.meta.env.VITE_QR_HUNT_URL;

/** True when this build shows QR codes (test environments only) */
export const QR_MODE = Boolean(GAMES_URL || HUNT_URL);

/** The address a logo's QR code opens, or null when the logo is not scannable in test mode */
export function qrTargetUrl(logo: Pick<Logo, 'logoId' | 'logoType'>): string | null {
  if (logo.logoType === 'game' && GAMES_URL) return `${GAMES_URL}/q/${logo.logoId}`;
  if (logo.logoType === 'stall' && HUNT_URL) return `${HUNT_URL}/q/${logo.logoId}`;
  return null;
}
