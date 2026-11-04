/** Games Event admin API (Project A), prefix /admin/v1/games. */
import { http, qs } from './client';

export type Game = 'spin' | 'lucky-dip';
export const GAMES: Game[] = ['spin', 'lucky-dip'];
/** One play in the plays report. The phone is masked, the collected fields are empty until collected */
export interface PlayRow {
  playedAt: string;
  game: Game;
  name: string;
  phone: string;
  userId: string;
  prize: string;
  reference: string;
  collectedAt: string;
  collectedBy: string;
}

export const GAME_LABELS: Record<Game, string> = { spin: 'Spin the Wheel', 'lucky-dip': 'Lucky Dip' };

export type Status = 'scheduled' | 'open' | 'closed';

export interface GameSession {
  sessionId: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  games: Game[];
  override: 'open' | 'closed' | null;
  status: Status;
  plays?: number;
}

export interface Prize {
  prizeId: string;
  name: string;
  stock: number;
  isMainPrize: boolean;
  imageKey: string | null;
  imageUrl: string | null;
  allocated?: number;
  given?: number;
  left?: number;
  /** Stock not yet allocated to any session */
  available?: number;
}

export interface Allocation {
  sessionId: string;
  game: Game;
  prizeId: string;
  allocated: number;
  remaining: number;
  given: number;
}

export interface Screen {
  screenId: string;
  name: string;
  games: Game[];
  connections: number;
  lastSeenAt: string | null;
  state?: 'idle' | 'playing';
}

export interface Settings {
  lockTimeoutSeconds: number;
  repeatWinnerRule: boolean;
  unusedPrizes: 'expire' | 'roll-over';
  paused: Record<Game, boolean>;
}

export interface Live {
  serverTime: string;
  session: (GameSession & { plays: number }) | null;
  nextSession: GameSession | null;
  games: Partial<
    Record<
      Game,
      {
        paused: boolean;
        inSession: boolean;
        prizes: (Allocation & { name: string; isMainPrize?: boolean })[];
      }
    >
  >;
  screens: Screen[];
  latestPlays: {
    entryId: string;
    game: Game;
    playedAt: string;
    userId: string;
    prizeName: string | null;
    reference: string | null;
  }[];
}

export interface ReferenceView {
  reference: string;
  userId: string;
  game: Game;
  wonAt: string;
  collectedAt: string | null;
  collectedBy: string | null;
  /** Name and phone typed on the phone (Spin the Wheel only) */
  player?: { name: string; phone: string } | null;
  prize: { prizeId: string; name: string; imageUrl: string | null } | null;
  session: { sessionId: string; name: string; date: string } | null;
}

export interface SessionInput {
  name: string;
  date: string;
  start: string;
  end: string;
  games: Game[];
}

const B = '/admin/v1/games';

export const gamesApi = {
  live: () => http.get<Live>(`${B}/live`),
  sessions: (date?: string) => http.get<{ items: GameSession[] }>(`${B}/sessions${qs({ date })}`),
  createSession: (input: SessionInput) => http.post<GameSession>(`${B}/sessions`, input),
  updateSession: (id: string, input: SessionInput) => http.put<GameSession>(`${B}/sessions/${id}`, input),
  deleteSession: (id: string) => http.delete<void>(`${B}/sessions/${id}`),
  openSession: (id: string) => http.post<GameSession>(`${B}/sessions/${id}/open`),
  closeSession: (id: string) => http.post<GameSession>(`${B}/sessions/${id}/close`),
  allocation: (id: string) =>
    http.get<{ session: GameSession; prizes: Prize[]; rows: Allocation[] }>(`${B}/sessions/${id}/allocation`),
  saveAllocation: (id: string, rows: { game: Game; prizeId: string; allocated: number }[]) =>
    http.put<{ rows: Allocation[] }>(`${B}/sessions/${id}/allocation`, { rows }),
  autoSplit: (input: {
    date: string;
    game: Game;
    totals: Record<string, number>;
    method: 'length' | 'equal' | 'custom';
    weights?: Record<string, number>;
    apply: boolean;
  }) =>
    http.post<{
      sessions: { sessionId: string; name: string; weight: number }[];
      split: Record<string, Record<string, number>>;
    }>(`${B}/allocations/auto-split`, input),
  prizes: () => http.get<{ items: Prize[] }>(`${B}/prizes`),
  createPrize: (input: Pick<Prize, 'name' | 'stock' | 'isMainPrize' | 'imageKey'>) =>
    http.post<Prize>(`${B}/prizes`, input),
  updatePrize: (id: string, input: Pick<Prize, 'name' | 'stock' | 'isMainPrize' | 'imageKey'>) =>
    http.put<Prize>(`${B}/prizes/${id}`, input),
  deletePrize: (id: string) => http.delete<void>(`${B}/prizes/${id}`),
  setPaused: (game: Game, paused: boolean) => http.put(`${B}/games/${game}/status`, { paused }),
  settings: () => http.get<Settings>(`${B}/settings`),
  saveSettings: (input: Omit<Settings, 'paused'>) => http.put<Settings>(`${B}/settings`, input),
  screens: () => http.get<{ items: Screen[] }>(`${B}/screens`),
  createScreen: (input: { name: string; games: Game[] }) =>
    http.post<{ screen: Screen; screenKey: string }>(`${B}/screens`, input),
  rotateScreenKey: (id: string) =>
    http.post<{ screen: Screen; screenKey: string }>(`${B}/screens/${id}/rotate-key`),
  deleteScreen: (id: string) => http.delete<void>(`${B}/screens/${id}`),
  releaseLock: (id: string) => http.post<{ released: boolean }>(`${B}/screens/${id}/release-lock`),
  /** Reference ID or part of a Spin the Wheel player's name */
  searchReferences: (q: string) =>
    http.get<{ items: ReferenceView[] }>(`${B}/references?q=${encodeURIComponent(q)}`),
  reference: (reference: string) =>
    http.get<ReferenceView>(`${B}/references/${encodeURIComponent(reference)}`),
  collect: (reference: string) =>
    http.post<ReferenceView>(`${B}/references/${encodeURIComponent(reference)}/collect`),
  plays: (sessionId: string) => http.get<{ items: PlayRow[] }>(`${B}/reports/plays${qs({ sessionId })}`),
  downloadPlaysCsv: (sessionId: string, filename: string) =>
    http.download(`${B}/reports/plays${qs({ sessionId, format: 'csv' })}`, filename),
};
