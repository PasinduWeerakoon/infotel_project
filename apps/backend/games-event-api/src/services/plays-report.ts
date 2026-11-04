/**
 * The plays report of one session (admin table and CSV export): time, game, player name, masked
 * phone, QuickLook user ID, prize, reference and whether the prize was collected.
 */
import { listPrizes } from '../data/catalog-repo.js';
import { getReferences, listAllPlays } from '../data/reports-repo.js';
import { maskPhone } from '../domain/player.js';
import type { PlayRow } from '../domain/plays-csv.js';

export async function playRows(sessionId: string): Promise<PlayRow[]> {
  const [plays, prizes] = await Promise.all([listAllPlays(sessionId), listPrizes()]);
  const names = new Map(prizes.map((p) => [p.prizeId, p.name]));
  const references = await getReferences(plays.flatMap((e) => (e.reference ? [e.reference] : [])));
  return plays.map((e) => {
    const reference = e.reference ? references.get(e.reference) : undefined;
    return {
      playedAt: e.playedAt ?? '',
      game: e.game,
      name: e.player?.name ?? '',
      phone: e.player?.phone ? maskPhone(e.player.phone) : '',
      userId: e.userId,
      prize: e.prizeId ? (names.get(e.prizeId) ?? e.prizeId) : '',
      reference: e.reference ?? '',
      collectedAt: reference?.collectedAt ?? '',
      collectedBy: reference?.collectedBy ?? '',
    };
  });
}

export { toCsv } from '../domain/plays-csv.js';
