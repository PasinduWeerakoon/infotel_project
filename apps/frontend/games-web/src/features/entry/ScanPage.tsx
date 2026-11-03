/**
 * /s/:scanId — where the QuickLook logo link lands.
 *
 * Creates the entry on the server, which checks everything: the scan is real and belongs to this
 * visitor, a session is open, one play per session, the stall screen is free. Then the scan ID is
 * replaced in the address by the entry, so the link cannot be shared or reused.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { gamesApi } from '../../api/games';
import { Screen } from '../../components/layout/Screen';
import { useApiErrorHandler } from '../../hooks/useApiError';
import { entryKey } from '../../hooks/useEntry';

export function ScanPage() {
  const { scanId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handleError = useApiErrorHandler();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React may run effects twice in development
    started.current = true;

    gamesApi
      .createEntry(scanId)
      .then((entry) => {
        queryClient.setQueryData(entryKey(entry.entryId), entry);
        const next = entry.status === 'played' ? `/result/${entry.entryId}` : `/play/${entry.entryId}`;
        navigate(next, { replace: true, viewTransition: true });
      })
      .catch((error) => handleError(error, `/s/${scanId}`));
  }, [scanId, navigate, queryClient, handleError]);

  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-6 text-center">
        <img src="/favicon.svg" alt="" className="size-28 animate-spin [animation-duration:2.4s]" />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[30px] font-bold">Getting your game ready</h1>
          <p className="text-[16px] text-haze">Checking your scan with QuickLook</p>
        </div>
        <div className="h-2.5 w-56 overflow-hidden rounded-full bg-white/15">
          <div className="loading-bar h-full w-2/5 rounded-full bg-gradient-to-r from-sun to-tangerine" />
        </div>
      </div>
    </Screen>
  );
}
