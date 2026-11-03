/** Shown after "Done": nothing left to do until the next scan. */
import { IconConfetti } from '@tabler/icons-react';
import { Screen } from '../../components/layout/Screen';
import { StatusView } from '../../components/ui/StatusView';

export function DonePage() {
  return (
    <Screen centered>
      <StatusView
        icon={IconConfetti}
        tone="success"
        label="All set"
        title="See you at the prize desk"
        body="Show your reference ID at the prize desk. To see it again, scan the same logo with QuickLook."
      />
    </Screen>
  );
}
