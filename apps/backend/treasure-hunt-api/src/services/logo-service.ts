/**
 * Loads the event logos from QuickLook once (they count in every session of the event). Pressing
 * it again adds logos QuickLook added later and refreshes names, nothing is removed.
 */
import { saveEventLogos } from '../data/logos-repo.js';
import { searchLogos } from '../data/quicklook-logos.js';
import type { EventLogo } from '../domain/types.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export async function loadLogosFromQuickLook(): Promise<{ loaded: number }> {
  const logos: EventLogo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await searchLogos({ page, pageSize: PAGE_SIZE });
    logos.push(...result.items);
    if (page >= result.totalPages) break;
  }
  await saveEventLogos(logos);
  return { loaded: logos.length };
}
