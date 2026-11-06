/**
 * Games Event API (Project A) and the sign-in endpoints of the shared platform.
 */
import { api, post } from './client';

export type Game = 'spin' | 'lucky-dip';

export interface SessionBrief {
  sessionId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  games?: Game[];
}

export interface Segment {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Prize {
  prizeId: string;
  name: string;
  imageUrl: string | null;
  isMainPrize: boolean;
}

export interface PlayerDetails {
  name: string;
  phone: string;
}

export interface EntryView {
  entryId: string;
  game: Game;
  status: 'ready' | 'played' | 'expired';
  expiresAt: string;
  session: SessionBrief | null;
  nextSession: SessionBrief | null;
  display: { segments: Segment[]; boxes: number };
  result: {
    prize: Prize | null;
    reference: string | null;
    playedAt: string;
    collectedAt: string | null;
    /** A QuickLook winner still has to give a phone for the prize desk */
    phoneNeeded?: boolean;
    animation: { target: number; durationMs: number };
  } | null;
}

export interface Logo {
  logoId: string;
  name: string;
  logoType: string;
  targetId: string | null;
  imageUrl: string | null;
}

export const gamesApi = {
  session: () =>
    api<{ firstName: string; nameLocked: boolean; phone?: string | null; expiresAt: string }>(
      '/auth/v1/session',
    ),
  createEntry: (scanId: string) => post<EntryView>('/games/v1/entries', { scanId }),
  entry: (entryId: string) => api<EntryView>(`/games/v1/entries/${encodeURIComponent(entryId)}`),
  play: (entryId: string, player?: PlayerDetails) =>
    post<EntryView>(`/games/v1/entries/${encodeURIComponent(entryId)}/play`, player ? { player } : {}),
  saveWinnerPhone: (entryId: string, phone: string) =>
    post<EntryView>(`/games/v1/entries/${encodeURIComponent(entryId)}/phone`, { phone }),
  logos: () => api<{ items: Logo[] }>('/platform/v1/logos'),
};

/** Full-page redirect to QuickLook sign in. Comes back to `returnTo` on this app. */
export function signIn(returnTo: string): void {
  window.location.assign(`/auth/v1/login?app=games&returnTo=${encodeURIComponent(returnTo)}`);
}

export const GAME_NAMES: Record<Game, string> = { spin: 'Spin the Wheel', 'lucky-dip': 'Lucky Dip' };
