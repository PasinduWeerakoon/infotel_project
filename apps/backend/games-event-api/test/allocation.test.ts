import { describe, expect, it } from 'vitest';
import { autoSplit, checkAllocation, splitByWeights } from '../src/domain/allocation.js';

describe('auto-split (largest remainder)', () => {
  it('matches the worked example: Pen drive 25 with 42 : 45 : 53 gives 8, 8, 9', () => {
    expect(splitByWeights(25, { s1: 42, s2: 45, s3: 53 })).toEqual({ s1: 8, s2: 8, s3: 9 });
  });

  it('always adds up to the total', () => {
    for (const total of [0, 1, 7, 10, 80, 101]) {
      const split = splitByWeights(total, { a: 3, b: 3, c: 4, d: 1 });
      expect(Object.values(split).reduce((s, n) => s + n, 0)).toBe(total);
    }
  });

  it('gives equal fractions to the earlier session first', () => {
    expect(splitByWeights(1, { s1: 1, s2: 1 })).toEqual({ s1: 1, s2: 0 });
  });

  it('returns zeros when all weights are zero', () => {
    expect(splitByWeights(5, { s1: 0, s2: 0 })).toEqual({ s1: 0, s2: 0 });
  });

  it('splits every prize', () => {
    const result = autoSplit({ pen: 25, mug: 4 }, { s1: 1, s2: 1 });
    expect(result).toEqual({ pen: { s1: 13, s2: 12 }, mug: { s1: 2, s2: 2 } });
  });
});

describe('allocation checks', () => {
  const stock = { pen: { name: 'Pen drive', stock: 10 } };

  it('rejects a quantity below what was already given', () => {
    const problems = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's1|spin', allocated: 2, given: 3 }],
      existing: [],
      stock,
    });
    expect(problems.map((p) => p.code)).toEqual(['BELOW_GIVEN']);
  });

  it('rejects totals above stock across sessions and games', () => {
    const problems = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's2|spin', allocated: 5, given: 0 }],
      existing: [
        { prizeId: 'pen', key: 's1|spin', allocated: 4 },
        { prizeId: 'pen', key: 's1|lucky-dip', allocated: 3 },
      ],
      stock,
    });
    expect(problems.map((p) => p.code)).toEqual(['ABOVE_STOCK']);
  });

  it('replaces the stored value of a changed cell instead of adding to it', () => {
    const problems = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's1|spin', allocated: 10, given: 0 }],
      existing: [{ prizeId: 'pen', key: 's1|spin', allocated: 8 }],
      stock,
    });
    expect(problems).toEqual([]);
  });

  it('ignores prizes that are not being changed, even when they are over stock', () => {
    const problems = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's1|spin', allocated: 2, given: 0 }],
      existing: [{ prizeId: 'mug', key: 's1|spin', allocated: 9 }],
      stock: { ...stock, mug: { name: 'Mug', stock: 5 } },
    });
    expect(problems).toEqual([]);
  });

  it('allows lowering a total that is already above stock', () => {
    const existing = [
      { prizeId: 'pen', key: 's1|spin', allocated: 8 },
      { prizeId: 'pen', key: 's2|spin', allocated: 6 },
    ];
    const lower = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's2|spin', allocated: 4, given: 0 }],
      existing,
      stock,
    });
    expect(lower).toEqual([]);
    const higher = checkAllocation({
      changes: [{ prizeId: 'pen', key: 's2|spin', allocated: 7, given: 0 }],
      existing,
      stock,
    });
    expect(higher.map((p) => p.code)).toEqual(['ABOVE_STOCK']);
  });
});
