/** Sends the visitor to sign in again, or to the matching warning page. */
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, NETWORK_ERROR } from '../api/client';

export function useApiErrorHandler() {
  const navigate = useNavigate();
  return useCallback(
    (error: unknown, returnTo?: string) => {
      const apiError =
        error instanceof ApiError ? error : new ApiError(0, NETWORK_ERROR, 'Something went wrong');
      navigate(`/status/${apiError.code}`, {
        replace: true,
        state: { details: apiError.details, retryTo: returnTo },
        viewTransition: true,
      });
    },
    [navigate],
  );
}
