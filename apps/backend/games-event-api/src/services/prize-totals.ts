/** Prizes with their event-wide totals across every session: allocated, given and still free to allocate. */
import { imageUrl } from '../config.js';
import { listPrizes } from '../data/catalog-repo.js';
import { listAllAllocations } from '../data/sessions-repo.js';

export async function prizesWithTotals() {
  const [prizes, allocations] = await Promise.all([listPrizes(), listAllAllocations()]);
  return prizes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const rows = allocations.filter((a) => a.prizeId === p.prizeId);
      const allocated = rows.reduce((sum, a) => sum + a.allocated, 0);
      const given = rows.reduce((sum, a) => sum + a.given, 0);
      return {
        ...p,
        imageUrl: imageUrl(p.imageKey),
        allocated,
        given,
        left: p.stock - given,
        /** Stock not yet allocated to any session */
        available: p.stock - allocated,
      };
    });
}
