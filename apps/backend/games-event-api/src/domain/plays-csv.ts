/**
 * One row of the plays report and its CSV form.
 */
import type { Game } from './types.js';

export interface PlayRow {
  playedAt: string;
  game: Game;
  name: string;
  phone: string;
  userId: string;
  prize: string;
  reference: string;
  collectedAt: string;
  collectedBy: string;
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
