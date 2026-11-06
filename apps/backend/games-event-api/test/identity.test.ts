import { describe, expect, it } from 'vitest';
import { type PlayIdentity, normalizeName, personKeys, playsPerPerson } from '../src/domain/identity.js';

const play = (entryId: string, userId: string, name: string, phone = ''): PlayIdentity => ({
  entryId,
  userId,
  name,
  phone,
});

describe('same person rules', () => {
  it('treats spacing and capitals in a name as the same name', () => {
    expect(normalizeName('  Kamal   SILVA ')).toBe('kamal silva');
    expect(normalizeName(undefined)).toBe('');
  });

  it('links plays by account, phone or name, also through other plays', () => {
    const keys = personKeys([
      play('1', 'acc-a', 'Amal Jayasinghe', '0770000001'),
      play('2', 'acc-b', 'Amal Jayasinghe', '0770000001'), // second account
      play('3', 'acc-c', 'Amal Jayasinghe', '0770000002'), // third account, other phone
      play('4', 'acc-d', 'Dilini Perera', '0770000002'), // borrowed phone
      play('5', 'acc-e', 'Honest Player', '0771111111'),
    ]);
    const counts = playsPerPerson(keys);
    expect(['1', '2', '3', '4'].map((id) => counts.get(id))).toEqual([4, 4, 4, 4]);
    expect(counts.get('5')).toBe(1);
    expect(new Set(['1', '2', '3', '4'].map((id) => keys.get(id))).size).toBe(1);
    expect(keys.get('5')).not.toBe(keys.get('1'));
  });

  it('does not link plays by a missing phone or an empty name', () => {
    const counts = playsPerPerson(personKeys([play('1', 'a', '', ''), play('2', 'b', '', '')]));
    expect(counts.get('1')).toBe(1);
    expect(counts.get('2')).toBe(1);
  });

  it('links a later play that joins two earlier people', () => {
    const counts = playsPerPerson(
      personKeys([
        play('1', 'a', 'Amal', '0711111111'),
        play('2', 'b', 'Sunil', '0722222222'),
        play('3', 'c', 'Amal', '0722222222'), // same name as 1, same phone as 2
      ]),
    );
    expect([counts.get('1'), counts.get('2'), counts.get('3')]).toEqual([3, 3, 3]);
  });
});
