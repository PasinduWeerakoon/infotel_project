import { describe, expect, it } from 'vitest';
import { type PlayRow, csvCell, toCsv } from '../src/domain/plays-csv.js';

const row: PlayRow = {
  playedAt: '2026-11-04T10:00:00+05:30',
  game: 'spin',
  name: 'Nimal "Sudu" Perera',
  phone: '077****567',
  userId: 'edef31a4-8dfb-4e60-81ea-dc7168aead6a',
  prize: 'Headset',
  reference: 'LKD-7K3Q-9X',
  collectedAt: '',
  collectedBy: '',
};

describe('plays CSV', () => {
  it('quotes cells and doubles inner quotes', () => {
    expect(csvCell('Nimal "Sudu"')).toBe('"Nimal ""Sudu"""');
  });

  it('opens spreadsheet formulas as text', () => {
    for (const v of ['=HYPERLINK("x")', '+94771234567', '-1', '@SUM(A1)'])
      expect(csvCell(v)).toBe(`"'${v.replaceAll('"', '""')}"`);
    expect(csvCell('Kamal')).toBe('"Kamal"');
  });

  it('has a header, the game name, the masked phone and the collected status', () => {
    const lines = toCsv([row, { ...row, collectedAt: '2026-11-04T10:30:05+05:30', collectedBy: 'desk.1' }])
      .replace('﻿', '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe(
      '"Played at (Colombo)","Game","Name","Phone","QuickLook user ID","Prize","Reference","Collected","Collected at (Colombo)","Collected by"',
    );
    expect(lines[1]).toContain('"Spin the Wheel","Nimal ""Sudu"" Perera","077****567"');
    expect(lines[1]).toContain('"No"');
    expect(lines[1]?.startsWith('"2026-11-04 10:00:00"')).toBe(true);
    expect(lines[2]).toContain('"Yes","2026-11-04 10:30:05","desk.1"');
  });

  it('leaves Collected empty for a play without a prize', () => {
    const line =
      toCsv([{ ...row, prize: '', reference: '' }])
        .trim()
        .split('\r\n')[1] ?? '';
    expect(line.endsWith('"","","",""')).toBe(true);
  });
});
