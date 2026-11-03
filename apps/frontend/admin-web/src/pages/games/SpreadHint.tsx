/**
 * Shows, per game, how many players a session can serve against the prizes allocated.
 * Every play wins a prize (project document), so fewer prizes than players closes the game early.
 */
import { Alert, Flex } from 'antd';
import { GAME_LABELS, type Game, type GameSession } from '../../api/games';

/** Scan, get ready, animation and result on screen: about 30 seconds per player */
const SECONDS_PER_TURN = 30;

export function playersPerSession(session: Pick<GameSession, 'startsAt' | 'endsAt'>): number {
  const seconds = (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 1000;
  return Math.max(0, Math.floor(seconds / SECONDS_PER_TURN));
}

export function SpreadHint({
  session,
  totals,
}: { session: GameSession; totals: Partial<Record<Game, number>> }) {
  const players = playersPerSession(session);
  return (
    <Flex vertical gap={8}>
      {session.games.map((game) => {
        const prizes = totals[game] ?? 0;
        const short = prizes < players;
        const minutes = Math.round((prizes * SECONDS_PER_TURN) / 60);
        const message =
          prizes === 0
            ? `${GAME_LABELS[game]}: no prizes yet. About ${players} players can play in this session.`
            : short
              ? `${GAME_LABELS[game]}: ${prizes} prizes for up to about ${players} players. Every player wins, so with a full queue the prizes last about ${minutes} minutes, then the game closes for this session.`
              : `${GAME_LABELS[game]}: ${prizes} prizes for up to about ${players} players. Every player wins. Prizes left at the end follow the unused prizes rule.`;
        return <Alert key={game} type={short ? 'warning' : 'info'} showIcon message={message} />;
      })}
    </Flex>
  );
}
