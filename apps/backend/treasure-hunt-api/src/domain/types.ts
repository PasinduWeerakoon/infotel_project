/**
 * Core types of Project B (Treasure Hunt).
 *
 * Visitors scan stall logos with the QuickLook app. QuickLook's backend sends every scan to our
 * API, encrypted (decision D-20). We keep every scan, count each different event logo once per
 * visitor per session, rank and pick the winners. `userId` is QuickLook's user ID: staff map it to
 * the visitor's phone number in QuickLook. The event logos are loaded once from QuickLook and count
 * in every session.
 */
export interface RankPrize {
  rank: number;
  prizeName: string;
}

/** An event logo (stall), loaded once from QuickLook, counts in every session */
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
  /** True once provisional winners were worked out after the end */
  finalized: boolean;
  createdAt: string;
}

/** One visitor's standing in a session, counted from the scans QuickLook sent */
export interface Participant {
  sessionId: string;
  /** QuickLook's user ID */
  userId: string;
  playerNumber: number;
  /** The user name QuickLook sent with the latest scan */
  fullName: string;
  /** Different event logos scanned in the session */
  stalls: number;
  points: number;
  /** Every scan received in the session, repeats included */
  totalScans: number;
  /** When the current count was reached (earlier wins a tie) */
  reachedAt: string;
  logos: { logoId: string; firstScannedAt: string }[];
  disqualified: boolean;
  /** Set when the session's winners are worked out: this participant's winning rank */
  winnerRank?: number | null;
  /** Worked out on read, never stored */
  rank?: number;
}

/** What happened to one scan QuickLook sent */
export type ScanResult = 'counted' | 'repeat' | 'unknown-logo' | 'no-session';

/** Every scan QuickLook sent, kept as received */
export interface ScanRecord {
  scanKey: string;
  sessionId: string | null;
  userId: string;
  userName: string;
  logoId: string;
  eventId: string | null;
  /** QuickLook's scan time when sent, otherwise when we received it */
  scannedAt: string;
  receivedAt: string;
  result: ScanResult;
}

/** Totals of a session, updated with every scan */
export interface SessionStats {
  sessionId: string;
  lastScanAt: string | null;
  scans: number;
}

export type WinnerStatus = 'provisional' | 'confirmed';

export interface Winner {
  sessionId: string;
  rank: number;
  userId: string;
  playerNumber: number;
  fullName: string;
  points: number;
  stalls: number;
  reachedAt: string;
  prizeName: string | null;
  status: WinnerStatus;
  confirmedBy: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
}
