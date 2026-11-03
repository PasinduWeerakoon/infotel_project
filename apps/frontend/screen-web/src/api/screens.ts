/**
 * Data for the venue screens: logos (platform), the stall screen messages (Games API WebSocket)
 * and the leaderboard (Treasure Hunt API). Screens never receive names or reference IDs.
 */
import { api } from './client';

export type Game = 'spin' | 'lucky-dip';

export interface Segment {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface SessionBrief {
  sessionId: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export type ScreenMessage =
  | {
      type: 'screen.state';
      state: 'idle' | 'busy' | 'closed';
      game: Game | null;
      session: SessionBrief | null;
      nextSession: SessionBrief | null;
    }
  | { type: 'entry.started'; entryId: string; game: Game; expiresAt: string; segments?: Segment[] }
  | {
      type: 'play.result';
      entryId: string;
      game: Game;
      segments: Segment[];
      target: number;
      prize: { name: string; imageUrl: string | null } | null;
      /** Spin the Wheel player, the phone already masked by the server */
      player?: { name: string; phone: string } | null;
      durationMs: number;
    }
  | { type: 'entry.ended'; entryId: string }
  | { type: 'refresh' };

export interface Logo {
  logoId: string;
  name: string;
  logoType: string;
  targetId: string | null;
  imageUrl: string | null;
}

export interface Leaderboard {
  serverTime: string;
  session:
    | (SessionBrief & { state: 'scheduled' | 'open' | 'closed'; finalized: boolean; pointsPerStall: number })
    | null;
  nextSession: SessionBrief | null;
  players: number;
  stalls?: number;
  top: { rank: number; playerNumber: number; points: number; stalls: number }[];
  winners?: { rank: number; playerNumber: number; points: number; prizeName: string | null }[];
}

export const screensApi = {
  logos: () => api<{ items: Logo[] }>('/platform/v1/logos'),
  leaderboard: () => api<Leaderboard>('/hunt/v1/leaderboard?top=10'),
};

/** WebSocket address of the stall screen API. Set at build time for AWS, same host in development. */
export function screensSocketUrl(screenKey: string): string {
  const base =
    import.meta.env.VITE_SCREENS_WS_URL ??
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/screens`;
  return `${base}?screenKey=${encodeURIComponent(screenKey)}`;
}

export const GAME_NAMES: Record<Game, string> = { spin: 'Spin the Wheel', 'lucky-dip': 'Lucky Dip' };
