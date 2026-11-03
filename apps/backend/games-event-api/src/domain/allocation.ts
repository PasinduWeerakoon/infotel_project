/**
 * Prize allocation rules (docs: 03-lkdr-games-event/rules-sessions-and-prizes.md, section 3).
 */

/**
 * Splits a total across sessions in proportion to their weights, using the largest remainder
 * method: every share is rounded down, then the leftover units go to the largest fractions.
 * The result always adds up to the total exactly.
 *
 * Example: 25 with weights 42 : 45 : 53 gives 8, 8, 9.
 */
export function splitByWeights(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights);
  const weightSum = ids.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0);
  const result: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (total <= 0 || weightSum <= 0) return result;

  const shares = ids.map((id, order) => {
    const exact = (total * Math.max(0, weights[id] ?? 0)) / weightSum;
    return { id, order, floor: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });

  let leftover = total - shares.reduce((sum, s) => sum + s.floor, 0);
  for (const share of shares) result[share.id] = share.floor;

  // Largest fraction first. Equal fractions go to the earlier session.
  const byFraction = [...shares].sort((a, b) => b.fraction - a.fraction || a.order - b.order);
  for (const share of byFraction) {
    if (leftover <= 0) break;
    result[share.id] = (result[share.id] ?? 0) + 1;
    leftover -= 1;
  }
  return result;
}

/** Splits every prize total. Returns quantities per prize, then per session. */
export function autoSplit(
  totals: Record<string, number>,
  weights: Record<string, number>,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(totals).map(([prizeId, total]) => [prizeId, splitByWeights(total, weights)]),
  );
}

export interface AllocationProblem {
  prizeId: string;
  code: 'BELOW_GIVEN' | 'ABOVE_STOCK';
  message: string;
}

/**
 * Checks a proposed allocation.
 * - A quantity can never go below what was already given in that session and game.
 * - The total across all sessions and games can never exceed the prize stock.
 * Only the prizes being changed are checked, and a change that lowers a total is always allowed,
 * so one prize that is over stock never blocks saving the others (or fixing it).
 */
export function checkAllocation(input: {
  changes: { prizeId: string; key: string; allocated: number; given: number }[];
  /** Allocated quantities already stored, per prize and allocation key (session + game) */
  existing: { prizeId: string; key: string; allocated: number }[];
  stock: Record<string, { name: string; stock: number }>;
}): AllocationProblem[] {
  const problems: AllocationProblem[] = [];
  const totals = new Map<string, number>();
  const before = new Map<string, number>();
  const changedPrizes = new Set(input.changes.map((c) => c.prizeId));
  const changedKeys = new Set(input.changes.map((c) => `${c.prizeId}|${c.key}`));

  for (const row of input.existing) {
    if (!changedPrizes.has(row.prizeId)) continue;
    before.set(row.prizeId, (before.get(row.prizeId) ?? 0) + row.allocated);
    if (changedKeys.has(`${row.prizeId}|${row.key}`)) continue;
    totals.set(row.prizeId, (totals.get(row.prizeId) ?? 0) + row.allocated);
  }
  for (const change of input.changes) {
    if (change.allocated < change.given) {
      problems.push({
        prizeId: change.prizeId,
        code: 'BELOW_GIVEN',
        message: `${input.stock[change.prizeId]?.name ?? change.prizeId}: ${change.given} already given, cannot set ${change.allocated}`,
      });
    }
    totals.set(change.prizeId, (totals.get(change.prizeId) ?? 0) + change.allocated);
  }
  for (const [prizeId, total] of totals) {
    const prize = input.stock[prizeId];
    if (prize && total > prize.stock && total > (before.get(prizeId) ?? 0)) {
      problems.push({
        prizeId,
        code: 'ABOVE_STOCK',
        message: `${prize.name}: ${total} allocated but only ${prize.stock} in stock`,
      });
    }
  }
  return problems;
}
