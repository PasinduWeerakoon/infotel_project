/**
 * /q/:logoId?qUser=... — where a scanned logo lands.
 *
 * QuickLook opens this page with the signed-in user, encrypted (`qUser`). Our server opens it,
 * signs the visitor in with their QuickLook name and records the scan, then the normal scan page
 * takes over. Without `qUser` the visitor is not signed in to the QuickLook app: the "Before you
 * play" popup asks for their name and phone and signs them in as a guest (the phone number is the
 * player), then the game opens. In test environments this phone gets its own test token instead.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError, post } from '../../api/client';
import type { PlayerDetails } from '../../api/games';
import { Screen } from '../../components/layout/Screen';
import { useApiErrorHandler } from '../../hooks/useApiError';
import { PlayerDetailsSheet, rememberPlayer } from '../game/PlayerDetailsSheet';

const TEST_TOKEN_KEY = 'lkdr_test_token';

/** This phone's test token (only used when QuickLook did not send one). */
function phoneTestToken(): string {
  try {
    const saved = localStorage.getItem(TEST_TOKEN_KEY);
    if (saved) return saved;
    const token = `test_${crypto.randomUUID()}`;
    localStorage.setItem(TEST_TOKEN_KEY, token);
    return token;
  } catch {
    return `test_${crypto.randomUUID()}`; // private mode: a new player each time
  }
}

export function QrPage() {
  const { logoId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handleError = useApiErrorHandler();
  const started = useRef(false);
  const [guest, setGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const open = useCallback(
    (url: string) => {
      // A new sign in: forget the name and phone of whoever used this tab before
      queryClient.removeQueries({ queryKey: ['session'] });
      const target = new URL(url);
      // Same app: move on without reloading. A logo of the other app opens that app.
      if (target.origin === window.location.origin) navigate(target.pathname, { replace: true });
      else window.location.replace(url);
    },
    [navigate, queryClient],
  );

  useEffect(() => {
    if (started.current) return; // React may run effects twice in development
    started.current = true;
    const qUser = params.get('qUser');
    const body = qUser ? { qUser, logoId } : { token: params.get('token') ?? phoneTestToken(), logoId };

    post<{ scanId: string; url: string }>('/auth/v1/scan-login', body)
      .then(({ url }) => open(url))
      .catch((error) => {
        // Not signed in to the QuickLook app: play as a guest with name and phone
        if (error instanceof ApiError && error.code === 'QUICKLOOK_SIGN_IN_REQUIRED') setGuest(true);
        else handleError(error, `/q/${logoId}${window.location.search}`);
      });
  }, [logoId, params, open, handleError]);

  const signInGuest = useCallback(
    async (player: PlayerDetails) => {
      setBusy(true);
      setPhoneError(null);
      try {
        const { url } = await post<{ url: string }>('/auth/v1/guest-login', { logoId, ...player });
        rememberPlayer(player);
        open(url);
      } catch (error) {
        setBusy(false);
        if (error instanceof ApiError && error.code === 'PHONE_INVALID')
          setPhoneError('Please check your phone number, for example 077 123 4567');
        else handleError(error, `/q/${logoId}${window.location.search}`);
      }
    },
    [logoId, open, handleError],
  );

  return (
    <Screen centered>
      {guest ? <PlayerDetailsSheet guest busy={busy} error={phoneError} onDone={signInGuest} /> : null}
      <div className="flex flex-col items-center gap-6 text-center">
        <img src="/favicon.svg" alt="" className="size-24 animate-float" />
        <h1 className="font-display text-[30px] font-bold">Getting your game ready</h1>
        <div className="h-2.5 w-56 overflow-hidden rounded-full bg-white/15">
          <div className="loading-bar h-full w-2/5 rounded-full bg-gradient-to-r from-sun to-tangerine" />
        </div>
      </div>
    </Screen>
  );
}
