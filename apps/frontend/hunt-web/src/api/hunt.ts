/**
 * Treasure Hunt API (Project B) and sign in. Visitors are shown as player numbers only.
 * Progress follows QuickLook's count of the stall logos scanned, read about every 15 seconds.
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

export interface MyProgress {
  serverTime: string;
  session: HuntSessionBrief | null;
  nextSession: HuntSessionBrief | null;
  player: { playerNumber: number; points: number; stalls: number; rank: number; players: number } | null;
  /** Stall logos found, with the time each was first scanned */
  visits: {
    logoId: string;
    name: string;
    company: string | null;
    logoUrl: string | null;
    scannedAt: string;
  }[];
  totalStalls?: number;
  /** When the standings were last read from QuickLook */
  updatedAt?: string | null;
  winner: { rank: number; prizeName: string | null; playerNumber: number; collectedAt: string | null } | null;
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
  me: () => api<MyProgress>('/hunt/v1/me'),
  leaderboard: () => api<Leaderboard>('/hunt/v1/leaderboard?top=10'),
};

export function signIn(returnTo: string): void {
  window.location.assign(`/auth/v1/login?app=hunt&returnTo=${encodeURIComponent(returnTo)}`);
}
