/**
 * The venue screens, each opened once on the venue TV:
 *   /stall?key=...   stall screen for Spin the Wheel or Lucky Dip (key issued in the admin dashboard)
 *   /leaderboard     Treasure Hunt leaderboard
 *   /qr              test mode QR board (all game and stall QR codes on one display)
 */
import { createBrowserRouter } from 'react-router';
import { LeaderboardScreen } from '../features/leaderboard/LeaderboardScreen';
import { QrBoard } from '../features/qr/QrBoard';
import { StallScreen } from '../features/stall/StallScreen';

export const router = createBrowserRouter([
  { path: '/stall', element: <StallScreen /> },
  { path: '/leaderboard', element: <LeaderboardScreen /> },
  { path: '/qr', element: <QrBoard /> },
  { path: '*', element: <LeaderboardScreen /> },
]);
