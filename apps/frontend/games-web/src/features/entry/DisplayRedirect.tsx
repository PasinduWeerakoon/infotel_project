/**
 * The games web address itself (/). Visitors normally arrive from a scan, never here.
 * In test builds this opens the main display: both games' QR codes, then the live wheel or box
 * while someone plays on their phone. Otherwise it is the "scan the logo again" page.
 */
import { useEffect } from 'react';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPage } from '../status/StatusPage';

const DISPLAY_URL = import.meta.env.VITE_TEST_DISPLAY_URL;

export function DisplayRedirect() {
  useEffect(() => {
    if (DISPLAY_URL) location.replace(DISPLAY_URL);
  }, []);

  if (!DISPLAY_URL) return <StatusPage code="SCAN_NOT_FOUND" />;
  return (
    <div className="arcade-bg grid h-dvh place-items-center">
      <Spinner />
    </div>
  );
}
