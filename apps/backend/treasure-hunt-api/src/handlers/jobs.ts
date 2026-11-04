/**
 * Lambda `hunt-jobs`, started every minute: freezes ended sessions and lists their provisional
 * winners (the winners are flagged on the participants).
 */
import { finalizeEndedSessions } from '../services/winners-service.js';

export const handler = async () => {
  await finalizeEndedSessions();
};
