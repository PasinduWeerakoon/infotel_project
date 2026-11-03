/**
 * Keeps the stall screen connected to the Games API WebSocket.
 * Reconnects with growing delays (1 s up to 15 s), says hello after each connect to get the
 * current state, and pings every 30 seconds so the connection stays open. The server answers
 * every ping, so a connection that stays silent for 75 seconds is treated as dead and reopened.
 */
import { useEffect, useRef, useState } from 'react';
import { type ScreenMessage, screensSocketUrl } from '../api/screens';

export type Connection = 'connecting' | 'online' | 'offline' | 'rejected';

export function useScreenSocket(screenKey: string | null, onMessage: (message: ScreenMessage) => void) {
  const [connection, setConnection] = useState<Connection>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!screenKey) return;
    let attempt = 0;
    let closed = false;
    let retryTimer = 0;
    let pingTimer = 0;
    let lastHeardAt = Date.now();

    const connect = () => {
      setConnection(attempt === 0 ? 'connecting' : 'offline');
      const socket = new WebSocket(screensSocketUrl(screenKey));
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        lastHeardAt = Date.now();
        setConnection('online');
        socket.send(JSON.stringify({ type: 'screen.hello' }));
        pingTimer = window.setInterval(() => socket.send(JSON.stringify({ type: 'ping' })), 30_000);
      };
      socket.onmessage = (event) => {
        lastHeardAt = Date.now();
        try {
          handler.current(JSON.parse(String(event.data)) as ScreenMessage);
        } catch {
          // ignore anything that is not a screen message
        }
      };
      socket.onclose = (event) => {
        window.clearInterval(pingTimer);
        if (closed) return;
        if (event.code === 4001) return setConnection('rejected'); // unknown screen key (local server)
        attempt += 1;
        setConnection('offline');
        retryTimer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** (attempt - 1)));
      };
    };

    // A connection can die without a close event (Wi-Fi drop, sleeping TV): reopen it
    const watchdog = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN || Date.now() - lastHeardAt <= 75_000) return;
      // Its close event can take minutes on a dead network, so drop it and connect again now
      socket.onclose = null;
      socket.close();
      window.clearInterval(pingTimer);
      attempt += 1;
      connect();
    }, 15_000);
    // The device lost its network: an open socket can look fine for minutes, so show it now
    const onOffline = () => {
      const socket = socketRef.current;
      if (socket) socket.onclose = null;
      socket?.close();
      window.clearInterval(pingTimer);
      window.clearTimeout(retryTimer);
      attempt += 1;
      setConnection('offline');
    };
    // The device is back online: connect now instead of waiting for the next retry
    const onOnline = () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      window.clearTimeout(retryTimer);
      connect();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    connect();
    return () => {
      closed = true;
      window.clearInterval(watchdog);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socketRef.current?.close();
    };
  }, [screenKey]);

  const send = (message: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
  };

  return { connection, send };
}
