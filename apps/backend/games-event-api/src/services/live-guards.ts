/**
 * Staff actions that would cut a play short wait until the play has finished: a game cannot be
 * paused and a session cannot be closed while a visitor is getting ready or watching the result.
 */
import { activePlays } from '../data/entries-repo.js';
import type { Game } from '../domain/types.js';
import { HttpError } from '../lib/http.js';

export async function assertNoActivePlay(
  games: readonly Game[],
  action: 'pause the game' | 'close the session',
) {
  const playing = await activePlays(games);
  if (playing.length === 0) return;
  throw new HttpError(
    409,
    'PLAY_IN_PROGRESS',
    `Someone is playing right now. You can ${action} when the play finishes (within about a minute)`,
    { games: [...new Set(playing.map((p) => p.game))] },
  );
}
