/**
 * One row of the plays report and its CSV form.
 */
import type { Game, VoidReason } from './types.js';

export interface PlayRow {
  entryId: string;
  playedAt: string;
  game: Game;
  name: string;
  phone: string;
  userId: string;
  prize: string;
  reference: string;
  collectedAt: string;
  collectedBy: string;
  /** Plays in the whole event by the same person (shared account, phone or name), this one included */
  plays: number;
  /** A winner who gave no phone: tagged Not verified (it can still be collected) */
  phoneMissing: boolean;
  /** The prize was taken back, and why */
  voided: VoidReason | '';
}

/** The row's check result as staff read it */
export function playStatus(r: Pick<PlayRow, 'plays' | 'phoneMissing' | 'voided'>): string {
  const parts = [
    ...(r.plays > 1 ? ['Duplicate'] : []),
    ...(r.phoneMissing ? ['Not verified with phone number'] : []),
    ...(r.voided === 'duplicate' ? ['Phone already used this session, prize taken back'] : []),
    ...(r.voided === 'reclaimed' ? ['Prize reclaimed'] : []),
  ];
  return parts.length ? parts.join(', ') : 'OK';
}

const GAME_NAMES: Record<Game, string> = { spin: 'Spin the Wheel', 'lucky-dip': 'Lucky Dip' };

/** Colombo time as Excel reads it (stored times already carry the +05:30 offset) */
const localTime = (iso: string) => (iso ? iso.slice(0, 19).replace('T', ' ') : '');

const COLUMNS: [string, (r: PlayRow) => string][] = [
  ['Played at (Colombo)', (r) => localTime(r.playedAt)],
  ['Game', (r) => GAME_NAMES[r.game] ?? r.game],
  ['Name', (r) => r.name],
  ['Phone', (r) => r.phone],
  ['QuickLook user ID', (r) => r.userId],
  ['Prize', (r) => r.prize],
  ['Reference', (r) => r.reference],
  ['Collected', (r) => (r.reference ? (r.collectedAt ? 'Yes' : 'No') : '')],
  ['Collected at (Colombo)', (r) => localTime(r.collectedAt)],
  ['Collected by', (r) => r.collectedBy],
  ['Checks', playStatus],
  ['Plays in event by this person', (r) => String(r.plays)],
];

/**
 * One CSV cell. Text a spreadsheet would run as a formula (a typed name such as "=HYPERLINK(...)")
 * gets a leading apostrophe, so it opens as plain text.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** CSV with a BOM so Excel reads Sinhala and Tamil names correctly */
export function toCsv(rows: PlayRow[]): string {
  const lines = [
    COLUMNS.map(([title]) => csvCell(title)).join(','),
    ...rows.map((r) => COLUMNS.map(([, get]) => csvCell(get(r))).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
