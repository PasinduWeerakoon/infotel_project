/** The entry as the server sees it. The server is the only source of truth for every step. */
import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';

export const entryKey = (entryId: string) => ['entry', entryId] as const;

export function useEntry(entryId: string) {
  return useQuery({ queryKey: entryKey(entryId), queryFn: () => gamesApi.entry(entryId), retry: false });
}
