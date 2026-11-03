import { describe, expect, it } from 'vitest';
import { statusMessage } from '../src/features/status/messages';
import { formatSeconds } from '../src/hooks/useCountdown';
import { spacedReference } from '../src/lib/format';

const nextSession = {
  sessionId: 's2',
  name: 'Session 2',
  startsAt: '2026-11-02T13:30:00+05:30',
  endsAt: '2026-11-02T17:00:00+05:30',
};

describe('warning pages', () => {
  it('explains the other game is not available in the same session (G5.2)', () => {
    const message = statusMessage('ALREADY_PLAYED_THIS_SESSION', {
      requestedGame: 'lucky-dip',
      playedGame: 'spin',
      playedAt: '2026-11-02T10:42:00+05:30',
      entryId: 'ent_1',
      nextSession,
    });
    expect(message.title).toBe('Lucky Dip is not available for you now');
    expect(message.resultEntryId).toBe('ent_1');
    expect(message.facts.map((f) => f.label)).toEqual(['You played', 'Next session']);
  });

  it('says already played when the same game is scanned again (G5.1)', () => {
    const message = statusMessage('ALREADY_PLAYED_THIS_SESSION', {
      requestedGame: 'spin',
      playedGame: 'spin',
    });
    expect(message.title).toBe('You have already played in this session');
  });

  it('asks to scan again for any scan problem, never showing technical details', () => {
    for (const code of ['SCAN_NOT_FOUND', 'SCAN_NOT_YOURS', 'ENTRY_NOT_FOUND', 'SIGN_IN_EXPIRED']) {
      expect(statusMessage(code).title).toBe('Please scan the logo again');
    }
  });

  it('offers a retry with an error code for unknown failures', () => {
    const message = statusMessage('INTERNAL_ERROR');
    expect(message.retry).toBe(true);
    expect(message.facts).toEqual([{ label: 'Error code', value: 'INTERNAL_ERROR' }]);
  });
});

describe('formatting', () => {
  it('shows countdowns as m:ss, or h:mm:ss from an hour', () => {
    expect(formatSeconds(52)).toBe('0:52');
    expect(formatSeconds(3909)).toBe('1:05:09');
  });

  it('spaces references for reading aloud', () => {
    expect(spacedReference('LKD-7Q4K-29')).toBe('LKD 7Q4K 29');
  });
});
