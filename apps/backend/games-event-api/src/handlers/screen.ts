/**
 * Lambda `games-screen`: API Gateway WebSocket for stall screens.
 *   $connect     ?screenKey=...   rejected (401) for an unknown key
 *   $disconnect
 *   $default     screen messages (screen.hello, animation.finished, ping)
 */
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { connectScreen, disconnectScreen, handleScreenMessage } from '../services/screen-service.js';

type WebSocketEvent = APIGatewayProxyWebsocketEventV2 & { queryStringParameters?: Record<string, string> };

export async function handler(event: WebSocketEvent) {
  const { routeKey, connectionId } = event.requestContext;
  if (routeKey === '$connect') {
    const ok = await connectScreen(event.queryStringParameters?.screenKey, connectionId);
    return { statusCode: ok ? 200 : 401 };
  }
  if (routeKey === '$disconnect') {
    await disconnectScreen(connectionId);
    return { statusCode: 200 };
  }
  await handleScreenMessage(connectionId, event.body ?? '');
  return { statusCode: 200 };
}
