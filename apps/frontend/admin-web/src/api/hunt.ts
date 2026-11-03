/**
 * Treasure Hunt admin API (Project B), prefix /admin/v1/hunt.
 * QuickLook counts the scans. Each session lists the QuickLook logos that count, and the standings
 * are read from QuickLook's Leaderboard API about every 15 seconds while the session runs.
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
  logos: EventLogo[];
  finalized: boolean;
  status: 'scheduled' | 'open' | 'closed';
  players?: number;
  sync?: SyncStatus | null;
}

/** A QuickLook logo taking part in a session */
export interface EventLogo {
  logoId: string;
  productName: string;
  companyName: string | null;
  logoCode: string | null;
  logoUrl: string | null;
}

/** The last read from QuickLook for a session */
export interface SyncStatus {
  lastSyncAt: string | null;
  participants: number;
  unknownLogoIds: string[];
  error: string | null;
}

export interface Participant {
  userId: string;
  playerNumber: number;
  fullName: string;
  mobile: string;
  rank: number;
  points: number;
  stalls: number;
  totalScans: number;
  reachedAt: string;
  disqualified: boolean;
}

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
  /** Only when creating: the logos to start with */
  logos?: EventLogo[];
}

export interface LogoPage {
  page: number;
  total: number;
  totalPages: number;
  items: EventLogo[];
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
  setLogos: (id: string, logos: EventLogo[]) => http.put<HuntSession>(`${s(id)}/logos`, { logos }),
  searchLogos: (input: {
    name?: string;
    company?: string;
    logoCode?: string;
    page: number;
    pageSize: number;
  }) => http.get<LogoPage>(`${B}/quicklook-logos${qs(input)}`),
  sync: (id: string) => http.post<{ sync: SyncStatus }>(`${s(id)}/sync`),
  live: (id: string) =>
    http.get<{ session: HuntSession; players: number; sync: SyncStatus | null; top: Participant[] }>(
      `${s(id)}/live`,
    ),
  participants: (id: string) => http.get<{ items: Participant[] }>(`${s(id)}/participants`),
  winners: (id: string) => http.get<{ session: HuntSession; items: Winner[] }>(`${s(id)}/winners`),
  confirm: (id: string, rank: number) => http.post<Winner>(`${s(id)}/winners/${rank}/confirm`),
  disqualify: (id: string, rank: number) =>
    http.post<{ items: Winner[] }>(`${s(id)}/winners/${rank}/disqualify`),
  collect: (id: string, rank: number) => http.post<Winner>(`${s(id)}/winners/${rank}/collect`),
  winnersOfDay: (date?: string) => http.get<{ items: Winner[] }>(`${B}/winners${qs({ date })}`),
};
