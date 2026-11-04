/**
 * Treasure Hunt admin API (Project B), prefix /admin/v1/hunt.
 * QuickLook's backend sends every stall scan to us. The event logos are loaded once and count in
 * every session; each logo counts once per visitor per session.
 */
import { http, qs } from './client';

export interface HuntSession {
  sessionId: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  override: 'open' | 'closed' | null;
  openedAt?: string | null;
  closedAt?: string | null;
  pointsPerStall: number;
  winnersCount: number;
  prizes: { rank: number; prizeName: string }[];
  allowPreviousWinners: boolean;
  finalized: boolean;
  status: 'scheduled' | 'open' | 'closed';
  players?: number;
  scans?: number;
  lastScanAt?: string | null;
}

/** An event logo, loaded once from QuickLook, counts in every session */
export interface EventLogo {
  logoId: string;
  productName: string;
  companyName: string | null;
  logoCode: string | null;
  logoUrl: string | null;
}

export interface Participant {
  /** QuickLook's user ID: staff find the phone number with it in QuickLook */
  userId: string;
  playerNumber: number;
  fullName: string;
  /** Null for a disqualified player */
  rank: number | null;
  points: number;
  stalls: number;
  totalScans: number;
  reachedAt: string;
  disqualified: boolean;
  /** Set when the winners are worked out */
  winnerRank?: number | null;
}

export interface ScanRecord {
  scanKey: string;
  userId: string;
  userName: string;
  logoId: string;
  scannedAt: string;
  receivedAt: string;
  result: 'counted' | 'repeat' | 'unknown-logo' | 'no-session';
}

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
  status: 'provisional' | 'confirmed';
  confirmedBy: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
}

export interface HuntSessionInput {
  name: string;
  date: string;
  start: string;
  end: string;
  pointsPerStall: number;
  winnersCount: number;
  prizes: { rank: number; prizeName: string }[];
  allowPreviousWinners: boolean;
}

const B = '/admin/v1/hunt';
const s = (id: string) => `${B}/sessions/${encodeURIComponent(id)}`;

export const huntApi = {
  sessions: (date?: string) => http.get<{ items: HuntSession[] }>(`${B}/sessions${qs({ date })}`),
  createSession: (input: HuntSessionInput) => http.post<HuntSession>(`${B}/sessions`, input),
  updateSession: (id: string, input: HuntSessionInput) => http.put<HuntSession>(s(id), input),
  deleteSession: (id: string) => http.delete<void>(s(id)),
  startSession: (id: string) => http.post<HuntSession>(`${s(id)}/start`),
  endSession: (id: string) => http.post<HuntSession>(`${s(id)}/end`),
  logos: () => http.get<{ items: EventLogo[] }>(`${B}/logos`),
  loadLogos: () => http.post<{ loaded: number; items: EventLogo[] }>(`${B}/logos/load`),
  live: (id: string) =>
    http.get<{
      session: HuntSession;
      players: number;
      scans: number;
      lastScanAt: string | null;
      eventLogos: number;
      top: Participant[];
    }>(`${s(id)}/live`),
  participants: (id: string) => http.get<{ items: Participant[] }>(`${s(id)}/participants`),
  scans: (id: string, userId?: string) =>
    http.get<{ items: ScanRecord[] }>(`${s(id)}/scans${qs({ userId })}`),
  winners: (id: string) => http.get<{ session: HuntSession; items: Winner[] }>(`${s(id)}/winners`),
  confirm: (id: string, rank: number) => http.post<Winner>(`${s(id)}/winners/${rank}/confirm`),
  disqualify: (id: string, rank: number) =>
    http.post<{ items: Winner[] }>(`${s(id)}/winners/${rank}/disqualify`),
  collect: (id: string, rank: number) => http.post<Winner>(`${s(id)}/winners/${rank}/collect`),
  winnersOfDay: (date?: string) => http.get<{ items: Winner[] }>(`${B}/winners${qs({ date })}`),
};
