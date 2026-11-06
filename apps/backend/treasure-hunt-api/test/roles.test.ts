import { describe, expect, it } from 'vitest';
import { roleAllows } from '../src/lib/auth.js';

describe('roleAllows', () => {
  it('lets an event admin run both the games and the hunt', () => {
    expect(roleAllows('event-admin', ['hunt-admin'])).toBe(true);
    expect(roleAllows('event-admin', ['games-admin', 'viewer'])).toBe(true);
  });
  it('keeps super admin only areas closed to an event admin', () => {
    expect(roleAllows('event-admin', [])).toBe(false);
    expect(roleAllows('super-admin', [])).toBe(true);
  });
  it('keeps the single roles to their own area', () => {
    expect(roleAllows('games-admin', ['hunt-admin'])).toBe(false);
    expect(roleAllows('hunt-admin', ['hunt-admin', 'viewer'])).toBe(true);
  });
});
