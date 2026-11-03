/**
 * Core types of Project B (Treasure Hunt).
 *
 * Visitors scan stall logos with the QuickLook app. QuickLook counts the scans and ranks the
 * visitors (Leaderboard API). We store the logos the admin selected for each session, what we
 * read from QuickLook (standings) and the winners. `userId` is QuickLook's user ID, the same ID
 * our sign-in receives.
 */
export interface RankPrize {
  rank: number;
  prizeName: string;
}

/** A QuickLook logo taking part in a session, as the admin selected it */
export interface EventLogo {
  logoId: string;
  productName: string;
  companyName: string | null;
  logoCode: string | null;
  logoUrl: string | null;
}

export interface HuntSession {
  sessionId: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  /** Staff can start early or end early. Null follows the clock */
  override: 'open' | 'closed' | null;
  /** When staff started or ended the session early (the scan period follows these) */
  openedAt?: string | null;
  closedAt?: string | null;
  pointsPerStall: number;
  winnersCount: number;
  prizes: RankPrize[];
  /** When false, a visitor who already won in an earlier session today cannot win again */
  allowPreviousWinners: boolean;
  /** The QuickLook logos that count in this session */
  logos: EventLogo[];
  /** True once provisional winners were worked out after the end */
  finalized: boolean;
  createdAt: string;
}

/** One visitor's standing in a session, as last read from QuickLook */
export interface Participant {
  sessionId: string;
  userId: string;
  playerNumber: number;
  fullName: string;
  mobile: string;
  /** QuickLook's rank (ties already broken by who reached the count first) */
  rank: number;
  /** Different selected logos scanned */
  stalls: number;
  points: number;
  totalScans: number;
  /** When the current count was reached (earlier wins a tie) */
  reachedAt: string;
  logos: { logoId: string; firstScannedAt: string }[];
  disqualified: boolean;
}

/** The last read from QuickLook for a session */
export interface SyncStatus {
  sessionId: string;
  lastSyncAt: string | null;
  /** Everyone with at least one counted scan, from QuickLook */
  participants: number;
  unknownLogoIds: string[];
  error: string | null;
}

export type WinnerStatus = 'provisional' | 'confirmed';

export interface Winner {
  sessionId: string;
  rank: number;
  userId: string;
  playerNumber: number;
  fullName: string;
  mobile: string;
  points: number;
  stalls: number;
  reachedAt: string;
  prizeName: string | null;
  status: WinnerStatus;
  confirmedBy: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
}
