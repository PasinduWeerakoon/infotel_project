/**
 * Routes. Pages load on demand. Each route checks the role as well as the sidebar,
 * and the APIs check it again on the server.
 */
import { Button, Result } from 'antd';
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import { Link, createBrowserRouter } from 'react-router';
import { AppLayout } from '../layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { RequireAuth, useAuth } from './auth';
import { NAVIGATION, canSee } from './navigation';

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/': page(() => import('../pages/OverviewPage'), 'OverviewPage'),
  '/games/sessions': page(() => import('../pages/games/SessionsPage'), 'SessionsPage'),
  '/games/prizes': page(() => import('../pages/games/PrizesPage'), 'PrizesPage'),
  '/games/allocation': page(() => import('../pages/games/AllocationPage'), 'AllocationPage'),
  '/games/logos': page(() => import('../pages/games/LogosScreensPage'), 'LogosScreensPage'),
  '/games/plays': page(() => import('../pages/games/PlaysPage'), 'PlaysPage'),
  '/games/settings': page(() => import('../pages/games/SettingsPage'), 'SettingsPage'),
  '/hunt/sessions': page(() => import('../pages/hunt/HuntSessionsPage'), 'HuntSessionsPage'),
  '/hunt/winners': page(() => import('../pages/hunt/WinnersPage'), 'WinnersPage'),
  '/desk': page(() => import('../pages/PrizeDeskPage'), 'PrizeDeskPage'),
  '/users': page(() => import('../pages/UsersPage'), 'UsersPage'),
};

/** Shows the page only if the signed-in role may see it. */
function Guarded({ path }: { path: string }) {
  const { role } = useAuth();
  const item = NAVIGATION.flatMap((g) => g.items).find((i) => i.path === path);
  const Page = PAGES[path];
  if (!Page || (item && !canSee(role, item))) {
    return (
      <Result
        status="403"
        title="Not available for your role"
        extra={
          <Link to="/">
            <Button type="primary">Back to overview</Button>
          </Link>
        }
      />
    );
  }
  return <Page />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      ...Object.keys(PAGES).map((path) => ({ path, element: <Guarded path={path} /> })),
      { path: '*', element: <Result status="404" title="Page not found" /> },
    ],
  },
]);
