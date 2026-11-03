/**
 * Routes. Pages ask the server for everything, so links cannot fake points or progress.
 * Visitors scan stall logos in the QuickLook app (QuickLook counts the scans), then open this app
 * to see their progress and the leaderboard.
 */
import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router';
import { StatusPage } from '../features/status/StatusPage';

const loadProgress = () => import('../features/progress/ProgressPage');
const loadLeaderboard = () => import('../features/leaderboard/LeaderboardPage');
const ProgressPage = lazy(() => loadProgress().then((m) => ({ default: m.ProgressPage })));
const LeaderboardPage = lazy(() => loadLeaderboard().then((m) => ({ default: m.LeaderboardPage })));

export function prefetchNextSteps(): void {
  void loadProgress();
  void loadLeaderboard();
}

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/me" replace /> },
  { path: '/me', element: <ProgressPage /> },
  { path: '/leaderboard', element: <LeaderboardPage /> },
  { path: '/status/:code', element: <StatusPage /> },
  { path: '/signin-failed', element: <StatusPage code="SIGN_IN_FAILED" /> },
  { path: '*', element: <StatusPage code="HOME" /> },
]);
