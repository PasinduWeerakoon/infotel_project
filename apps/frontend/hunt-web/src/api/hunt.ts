/**
 * Treasure Hunt API (Project B). Visitors are shown as player numbers only. The standings follow
 * the scans QuickLook sends, as they arrive.
 */
import { api } from './client';

export interface HuntSessionBrief {
  sessionId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  state: 'scheduled' | 'open' | 'closed';
  finalized: boolean;
  pointsPerStall: number;
}

export interface Leaderboard {
  serverTime: string;
  session: HuntSessionBrief | null;
  nextSession: HuntSessionBrief | null;
  players: number;
  /** Scans received in the session */
  scans?: number;
  top: { rank: number; playerNumber: number; name?: string; points: number; stalls: number }[];
  winners?: { rank: number; playerNumber: number; name?: string; points: number; prizeName: string | null }[];
  /** With `page`: this page (10 players each, ranks carry on across pages) and how many there are */
  page?: number;
  pages?: number;
}

export const huntApi = {
  leaderboard: (page = 1) => api<Leaderboard>(`/hunt/v1/leaderboard?page=${page}`),
};

export function signIn(returnTo: string): void {
  window.location.assign(`/auth/v1/login?app=hunt&returnTo=${encodeURIComponent(returnTo)}`);
}

/** The QuickLook name on the leaderboards, or the player number when QuickLook sent no name */
export const playerLabel = (row: { playerNumber: number; name?: string }) =>
  row.name?.trim() || `Player #${row.playerNumber}`;
