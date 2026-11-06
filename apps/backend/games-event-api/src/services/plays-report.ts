/**
 * The plays report of one session (admin table and CSV export): time, game, player name, masked
 * phone, QuickLook user ID, prize, reference and whether the prize was collected.
 *
 * Repeat players are found across the whole event: plays that share a QuickLook account, a phone
 * or a name belong to one person. Each row says how many plays that person made in the event,
 * whether a winner gave no phone (not verified), and whether the prize was taken back.
 */
import { listPrizes } from '../data/catalog-repo.js';
import { getReferences, listAllPlays } from '../data/reports-repo.js';
import { listAllSessions } from '../data/sessions-repo.js';
import { type PlayIdentity, personKeys, playsPerPerson } from '../domain/identity.js';
import { maskPhone } from '../domain/player.js';
import type { PlayRow } from '../domain/plays-csv.js';
import type { Entry, Session } from '../domain/types.js';

const identityOf = (e: Entry): PlayIdentity => ({
  entryId: e.entryId,
  userId: e.userId,
  name: e.player?.name ?? '',
  phone: e.player?.phone ?? '',
});

/** A winner who gave no phone: tagged Not verified (staff decide, it can still be collected) */
export const phoneMissing = (e: Entry) => Boolean(e.prizeId && e.player && !e.player.phone && !e.voided);

/** Every play of the event, with the sessions and who is the same person */
export async function eventPlays() {
  const sessions = await listAllSessions();
  const plays = (await Promise.all(sessions.map((s) => listAllPlays(s.sessionId)))).flat();
  const keys = personKeys(plays.map(identityOf));
  return { sessions, plays, keys, counts: playsPerPerson(keys) };
}

export type EventPlays = Awaited<ReturnType<typeof eventPlays>>;

export async function playRows(sessionId: string): Promise<PlayRow[]> {
  const [event, prizes] = await Promise.all([eventPlays(), listPrizes()]);
  const plays = event.plays
    .filter((e) => e.sessionId === sessionId)
    .sort((a, b) => (b.playedAt ?? '').localeCompare(a.playedAt ?? ''));
  const names = new Map(prizes.map((p) => [p.prizeId, p.name]));
  const references = await getReferences(plays.flatMap((e) => (e.reference ? [e.reference] : [])));
  return plays.map((e) => {
    const reference = e.reference ? references.get(e.reference) : undefined;
    const prizeId = e.prizeId ?? e.voidedPrizeId;
    return {
      entryId: e.entryId,
      playedAt: e.playedAt ?? '',
      game: e.game,
      name: e.player?.name ?? '',
      phone: e.player?.phone ? maskPhone(e.player.phone) : '',
      userId: e.userId,
      prize: prizeId ? (names.get(prizeId) ?? prizeId) : '',
      reference: e.reference ?? '',
      collectedAt: reference?.collectedAt ?? '',
      collectedBy: reference?.collectedBy ?? '',
      plays: event.counts.get(e.entryId) ?? 1,
      phoneMissing: phoneMissing(e),
      voided: e.voided?.reason ?? '',
    };
  });
}

/** One play of a person, as the Scans panel and the prize desk show it */
export interface PersonPlay {
  entryId: string;
  date: string;
  session: { name: string; startsAt: string; endsAt: string } | null;
  game: Entry['game'];
  scannedAt: string;
  playedAt: string | null;
  name: string;
  phone: string;
  userId: string;
  prize: string | null;
  reference: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
  voided: string | null;
  phoneMissing: boolean;
}

/**
 * Every play in the event by the same person as this play, oldest first (this play included).
 * Phones are masked unless `fullPhone` (prize desk staff check the visitor's phone).
 */
export async function personPlays(
  entryId: string,
  fullPhone: boolean,
  event?: EventPlays,
): Promise<PersonPlay[]> {
  const data = event ?? (await eventPlays());
  const key = data.keys.get(entryId);
  if (!key) return [];
  const mine = data.plays
    .filter((e) => data.keys.get(e.entryId) === key)
    // Times are to the second, so plays in the same second keep their scan order (entry IDs sort by time)
    .sort((a, b) => (a.playedAt ?? '').localeCompare(b.playedAt ?? '') || a.entryId.localeCompare(b.entryId));
  const [prizes, references] = await Promise.all([
    listPrizes(),
    getReferences(mine.flatMap((e) => (e.reference ? [e.reference] : []))),
  ]);
  const prizeNames = new Map(prizes.map((p) => [p.prizeId, p.name]));
  const sessions = new Map<string, Session>(data.sessions.map((s) => [s.sessionId, s]));
  return mine.map((e) => {
    const session = sessions.get(e.sessionId);
    const reference = e.reference ? references.get(e.reference) : undefined;
    const prizeId = e.prizeId ?? e.voidedPrizeId;
    const phone = e.player?.phone ?? '';
    return {
      entryId: e.entryId,
      date: session?.date ?? '',
      session: session ? { name: session.name, startsAt: session.startsAt, endsAt: session.endsAt } : null,
      game: e.game,
      scannedAt: e.createdAt,
      playedAt: e.playedAt,
      name: e.player?.name ?? '',
      phone: fullPhone || !phone ? phone : maskPhone(phone),
      userId: e.userId,
      prize: prizeId ? (prizeNames.get(prizeId) ?? prizeId) : null,
      reference: e.reference,
      collectedAt: reference?.collectedAt ?? null,
      collectedBy: reference?.collectedBy ?? null,
      voided: e.voided?.reason ?? null,
      phoneMissing: phoneMissing(e),
    };
  });
}

export { toCsv } from '../domain/plays-csv.js';
