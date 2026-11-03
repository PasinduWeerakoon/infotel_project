/**
 * /q/:logoId?token=... — where a scanned logo lands.
 *
 * QuickLook opens this page with a temporary token. Our server exchanges the token for the
 * visitor, signs them in and records the scan, then the normal scan page takes over.
 * Testing without QuickLook (phone camera and a printed QR): there is no token, so this phone
 * gets its own test token, kept on the phone. One phone is then one player.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { post } from '../../api/client';
import { Screen } from '../../components/layout/Screen';
import { useApiErrorHandler } from '../../hooks/useApiError';

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

  useEffect(() => {
    if (started.current) return; // React may run effects twice in development
    started.current = true;
    const token = params.get('token') ?? phoneTestToken();

    post<{ scanId: string; url: string }>('/auth/v1/scan-login', { token, logoId })
      .then(({ url }) => {
        const target = new URL(url);
        // Same app: move on without reloading. A logo of the other app opens that app.
        if (target.origin === window.location.origin) navigate(target.pathname, { replace: true });
        else window.location.replace(url);
      })
      .catch((error) => handleError(error, `/q/${logoId}`));
  }, [logoId, params, navigate, handleError]);

  return (
    <Screen centered>
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
