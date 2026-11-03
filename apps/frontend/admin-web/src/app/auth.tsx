/**
 * Who is signed in. Checks the session on load, renews it every 5 minutes while the page is open
 * (sessions end after 30 minutes without activity), and sends the user to sign in when it ends.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { SESSION_EXPIRED_EVENT } from '../api/client';
import { type Role, platformApi } from '../api/platform';

interface Auth {
  username: string;
  role: Role;
}

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside a signed-in page');
  return auth;
}

/** Wraps every signed-in page. Shows nothing until the session is known. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: platformApi.me,
    retry: false,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    const expired = () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, [navigate, queryClient]);

  useEffect(() => {
    if (me.isError) navigate('/login', { replace: true });
  }, [me.isError, navigate]);

  if (!me.data) return null;
  return <AuthContext.Provider value={me.data}>{children}</AuthContext.Provider>;
}
