/**
 * Routes. Visitors scan stall logos in the QuickLook app and QuickLook sends every scan to our
 * server, so there is no sign-in here: this app shows the live leaderboard (player numbers only).
 */
import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { StatusPage } from '../features/status/StatusPage';

const loadLeaderboard = () => import('../features/leaderboard/LeaderboardPage');
const LeaderboardPage = lazy(() => loadLeaderboard().then((m) => ({ default: m.LeaderboardPage })));

export function prefetchNextSteps(): void {
  void loadLeaderboard();
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/leaderboard" replace /> },
  // The old progress link (visitors no longer sign in to the hunt)
  { path: '/me', element: <Navigate to="/leaderboard" replace /> },
  { path: '/leaderboard', element: <LeaderboardPage /> },
  { path: '/status/:code', element: <StatusPage /> },
  { path: '/signin-failed', element: <StatusPage code="SIGN_IN_FAILED" /> },
  { path: '*', element: <StatusPage code="HOME" /> },
]);
