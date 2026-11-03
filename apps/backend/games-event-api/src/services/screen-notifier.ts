/**
 * Sends real-time messages to stall screens.
 * In AWS: API Gateway WebSocket (PostToConnection). Locally: the dev server's ws connections.
 *
 * Messages never contain references, names or user IDs.
 */
import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { env } from '../config.js';
import { listConnections, listScreens, removeConnection } from '../data/screens-repo.js';
import type { Game } from '../domain/types.js';
import { logger } from '../lib/logger.js';

export type ScreenMessage =
  | {
      type: 'screen.state';
      state: 'idle' | 'busy' | 'closed';
      game: Game | null;
      session: unknown;
      nextSession: unknown;
    }
  | {
      type: 'entry.started';
      entryId: string;
      game: Game;
      expiresAt: string;
      segments: { id: string; name: string; imageUrl: string | null }[];
    }
  | {
      type: 'play.result';
      entryId: string;
      game: Game;
      segments: { id: string; name: string; imageUrl: string | null }[];
      target: number;
      prize: { name: string; imageUrl: string | null } | null;
      /** The player's name, and the phone with its middle digits hidden */
      player: { name: string; phone: string } | null;
      durationMs: number;
    }
  | { type: 'entry.ended'; entryId: string }
  | { type: 'refresh' };

type LocalSender = (connectionId: string, message: string) => boolean;
let localSender: LocalSender | undefined;

/** Used by the local dev server to deliver messages over its own WebSocket server. */
export function useLocalSender(sender: LocalSender): void {
  localSender = sender;
}

let client: ApiGatewayManagementApiClient | undefined;

async function send(connectionId: string, screenId: string, message: ScreenMessage): Promise<void> {
  const data = JSON.stringify(message);
  if (env.SCREENS_MODE === 'local') {
    if (!localSender?.(connectionId, data)) await removeConnection(connectionId, screenId);
    return;
  }
  client ??= new ApiGatewayManagementApiClient({ endpoint: env.WS_CALLBACK_URL });
  try {
    await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }));
  } catch (error) {
    if (error instanceof GoneException) await removeConnection(connectionId, screenId);
    else logger.warn('Screen message failed', { error, screenId });
  }
}

/** Sends to every connected screen that shows the game (or every screen when game is null). */
export async function notifyScreens(game: Game | null, message: ScreenMessage): Promise<void> {
  const screens = (await listScreens()).filter((s) => !game || s.games.includes(game));
  await Promise.all(
    screens.map(async (screen) => {
      const connections = await listConnections(screen.screenId);
      await Promise.all(connections.map((connectionId) => send(connectionId, screen.screenId, message)));
    }),
  );
}

/** Sends to one screen connection (used to answer a screen's hello). */
export async function sendToConnection(
  connectionId: string,
  screenId: string,
  message: ScreenMessage,
): Promise<void> {
  await send(connectionId, screenId, message);
}
