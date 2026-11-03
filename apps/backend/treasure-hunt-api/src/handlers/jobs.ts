/**
 * Lambda `hunt-jobs`, started every minute:
 * - while a hunt session runs, reads its standings from QuickLook every 15 seconds (4 times)
 * - reads the final standings of ended sessions and lists their provisional winners
 */
import { env } from '../config.js';
import { anySessionOpen, syncOpenSessions } from '../services/sync-service.js';
import { finalizeEndedSessions } from '../services/winners-service.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const handler = async () => {
  await finalizeEndedSessions();
  if (!(await anySessionOpen())) return;
  const rounds = Math.max(1, Math.floor(60 / env.SYNC_SECONDS));
  for (let round = 0; round < rounds; round++) {
    const started = Date.now();
    await syncOpenSessions();
    if (round < rounds - 1) await wait(Math.max(0, env.SYNC_SECONDS * 1000 - (Date.now() - started)));
  }
};
