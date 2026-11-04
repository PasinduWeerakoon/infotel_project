// npm run qa: resets the local data, then runs every QA session against the local servers.
// Needs the local stack running (see apps/README.md, "Run everything on your computer").
import { execFileSync } from 'node:child_process';

const sessions = ['reset-local', '1-visitor-games', '2-admin', '3-treasure-hunt', '4-ui-sweep', '5-dates', '6-prize-spread', '7-rate-limits'];
let failed = 0;
for (const name of sessions) {
  console.log(`\n===== ${name}`);
  try {
    execFileSync('node', [new URL(`./${name}.mjs`, import.meta.url).pathname], { stdio: 'inherit' });
  } catch {
    failed += 1;
  }
}
console.log(failed ? `\n${failed} session(s) had failures` : '\nAll QA sessions passed');
process.exit(failed ? 1 : 0);
