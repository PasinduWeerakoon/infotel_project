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
  stalls?: number;
  top: { rank: number; playerNumber: number; points: number; stalls: number }[];
  winners?: { rank: number; playerNumber: number; points: number; prizeName: string | null }[];
}

export const huntApi = {
  leaderboard: () => api<Leaderboard>('/hunt/v1/leaderboard?top=10'),
};

export function signIn(returnTo: string): void {
  window.location.assign(`/auth/v1/login?app=hunt&returnTo=${encodeURIComponent(returnTo)}`);
}
