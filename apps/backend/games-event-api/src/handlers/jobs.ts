/** Lambda `games-jobs`: runs every minute (EventBridge Scheduler). Expires unplayed entries, rolls over prizes. */
import { runJobs } from '../services/screen-service.js';

export const handler = async () => {
  await runJobs();
};
