/**
 * Routes. Every page asks the server for its state, so typing an address or sharing a link
 * never skips a step (private routes). The scan page is in the main bundle because it is
 * always the first page; the others load on demand and are prefetched right after.
 */
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { DisplayRedirect } from '../features/entry/DisplayRedirect';
import { QrPage } from '../features/entry/QrPage';
import { ScanPage } from '../features/entry/ScanPage';
import { StatusPage } from '../features/status/StatusPage';

const loadGame = () => import('../features/game/GamePage');
const loadResult = () => import('../features/result/ResultPage');
const GamePage = lazy(() => loadGame().then((m) => ({ default: m.GamePage })));
const ResultPage = lazy(() => loadResult().then((m) => ({ default: m.ResultPage })));
const DonePage = lazy(() => import('../features/result/DonePage').then((m) => ({ default: m.DonePage })));

/** Load the next steps in the background while the visitor is still on the scan page. */
export function prefetchNextSteps(): void {
  void loadGame();
  void loadResult();
}

export const router = createBrowserRouter([
  { path: '/', element: <DisplayRedirect /> },
  { path: '/q/:logoId', element: <QrPage /> },
  { path: '/s/:scanId', element: <ScanPage /> },
  { path: '/play/:entryId', element: <GamePage /> },
  { path: '/result/:entryId', element: <ResultPage /> },
  { path: '/done', element: <DonePage /> },
  { path: '/status/:code', element: <StatusPage /> },
  { path: '/signin-failed', element: <StatusPage code="SIGN_IN_FAILED" /> },
  { path: '*', element: <StatusPage code="SCAN_NOT_FOUND" /> },
]);
