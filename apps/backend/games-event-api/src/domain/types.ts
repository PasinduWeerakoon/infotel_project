/**
 * Core types of Project A (LKDR Games Event).
 * `userId` is always the opaque QuickLook user ID. No names or contact details are stored.
 */
export type Game = 'spin' | 'lucky-dip';
export const GAMES: Game[] = ['spin', 'lucky-dip'];

export type SessionStatus = 'scheduled' | 'open' | 'closed';

export interface Session {
  sessionId: string;
  name: string;
  /** Colombo date, for example `2026-11-02` */
  date: string;
  startsAt: string;
  endsAt: string;
  games: Game[];
  /** Staff can open a session early or close it early. Null follows the clock */
  override: 'open' | 'closed' | null;
  /** When staff last opened it early, so prizes are spread from that moment */
  openedAt?: string | null;
  /** True once unused prizes were moved to the next session (roll-over setting) */
  rolledOver: boolean;
  createdAt: string;
}

export interface Prize {
  prizeId: string;
  name: string;
  /** Total stock for the whole event */
  stock: number;
  isMainPrize: boolean;
  imageKey: string | null;
  createdAt: string;
}

/** Quantity of one prize for one game in one session */
export interface Allocation {
  sessionId: string;
  game: Game;
  prizeId: string;
  allocated: number;
  remaining: number;
  given: number;
}

export type EntryStatus = 'ready' | 'played' | 'expired';

export interface Entry {
  entryId: string;
  userId: string;
  sessionId: string;
  game: Game;
  scanId: string;
  /** Which stall screen lock this entry holds */
  lockKey: string;
  status: EntryStatus;
  createdAt: string;
  /** The visitor must play before this time (screen lock timeout) */
  expiresAt: string;
  playedAt: string | null;
  prizeId: string | null;
  reference: string | null;
  /** Name and phone the visitor typed before playing (not validated) */
  player?: PlayerDetails | null;
}

export interface PlayerDetails {
  name: string;
  /** Empty for a QuickLook player until they win: they type it on the result page */
  phone: string;
}

export interface Settings {
  lockTimeoutSeconds: number;
  /** One main prize per visitor per day */
  repeatWinnerRule: boolean;
  unusedPrizes: 'expire' | 'roll-over';
  paused: Record<Game, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  lockTimeoutSeconds: 60,
  repeatWinnerRule: false,
  unusedPrizes: 'expire',
  paused: { spin: false, 'lucky-dip': false },
};

/** Animation length per game. The screen lock is held until the animation can finish */
export const ANIMATION_MS: Record<Game, number> = { spin: 6000, 'lucky-dip': 6500 };
