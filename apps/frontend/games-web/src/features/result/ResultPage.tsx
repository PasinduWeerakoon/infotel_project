/**
 * /result/:entryId — the outcome (wireframes G3.4, G3.5, G4.4).
 * Won: prize, reference ID (on the phone only) and a celebration. Collected: a calm confirmation.
 * Refresh and back always come back here.
 */
import { IconCircleCheck, IconMoodSmile, IconTrophy } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import type { EntryView } from '../../api/games';
import { Screen } from '../../components/layout/Screen';
import { ButtonLink } from '../../components/ui/Button';
import { InfoRow } from '../../components/ui/Card';
import { PrizeImage } from '../../components/ui/PrizeImage';
import { Spinner } from '../../components/ui/Spinner';
import { StatusView } from '../../components/ui/StatusView';
import { useApiErrorHandler } from '../../hooks/useApiError';
import { useEntry } from '../../hooks/useEntry';
import { celebrate } from '../../lib/celebrate';
import { formatTime, formatWhen, spacedReference } from '../../lib/format';
import { sessionBadge } from '../status/messages';

export function ResultPage() {
  const { entryId = '' } = useParams();
  const entry = useEntry(entryId);
  const handleError = useApiErrorHandler();

  useEffect(() => {
    if (entry.error) handleError(entry.error);
  }, [entry.error, handleError]);

  const data = entry.data;
  if (!data?.result) {
    return (
      <Screen centered>
        <Spinner className="mx-auto size-9 text-sun" />
      </Screen>
    );
  }
  const { prize, collectedAt } = data.result;
  if (prize && collectedAt) return <Collected entry={data} />;
  if (prize) return <Won entry={data} />;
  return <NoPrize entry={data} />;
}

function Won({ entry }: { entry: EntryView }) {
  const result = entry.result as NonNullable<EntryView['result']>;
  const prize = result.prize as NonNullable<typeof result.prize>;
  const celebrated = useRef(false);

  useEffect(() => {
    if (celebrated.current) return;
    celebrated.current = true;
    void celebrate(prize.isMainPrize);
  }, [prize.isMainPrize]);

  return (
    <Screen
      badge={sessionBadge(entry.session)}
      centered
      actions={
        <ButtonLink to="/done" replace>
          Awesome!
        </ButtonLink>
      }
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="rainbow-text font-display text-[46px] leading-none font-bold animate-pop">YOU WON!</p>
        <p className="text-[15px] font-semibold text-haze">Wow, look what you got</p>
      </div>
      {/* Prize card, like a game's "you win" pop-up */}
      <div className="relative mx-auto mt-14 w-full max-w-[340px] rounded-[28px] bg-white px-6 pt-16 pb-6 text-center text-night shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] animate-pop">
        <div className="absolute -top-14 left-1/2 -translate-x-1/2">
          <PrizeImage src={prize.imageUrl} alt={prize.name} className="size-28 ring-4 ring-white" />
        </div>
        <div className="mb-1 flex items-center justify-center gap-1.5 text-[13px] font-extrabold tracking-[0.14em] text-tangerine uppercase">
          <IconTrophy className="size-4" stroke={2.2} aria-hidden />
          {prize.isMainPrize ? 'Main prize' : 'Prize'}
        </div>
        <h1 className="font-display text-[30px] leading-tight font-bold text-violet">{prize.name}</h1>
        <div className="mt-5 rounded-2xl border-2 border-dashed border-violet/30 bg-haze/40 px-4 py-3">
          <span className="block text-[12px] font-bold tracking-[0.14em] text-violet/70 uppercase">
            Your reference
          </span>
          <span className="font-display text-[30px] font-bold tracking-[0.08em] text-night">
            {spacedReference(result.reference ?? '')}
          </span>
        </div>
        <p className="mt-3 text-[14px] font-semibold text-night/60">Show this at the prize desk to collect</p>
      </div>
      <p className="text-center text-[13px] text-lilac">Take a screenshot to keep it safe</p>
    </Screen>
  );
}

function Collected({ entry }: { entry: EntryView }) {
  const result = entry.result as NonNullable<EntryView['result']>;
  return (
    <Screen centered badge={sessionBadge(entry.session)}>
      <StatusView
        icon={IconCircleCheck}
        tone="success"
        label="Collected"
        title="Prize collected"
        body="Enjoy your prize. Thanks for playing."
        facts={[
          { label: 'Prize', value: result.prize?.name ?? '' },
          { label: 'Reference ID', value: spacedReference(result.reference ?? '') },
          { label: 'Collected at', value: formatTime(result.collectedAt ?? '') },
          ...(entry.nextSession
            ? [{ label: 'Next session', value: formatWhen(entry.nextSession.startsAt) }]
            : []),
        ]}
      />
    </Screen>
  );
}

function NoPrize({ entry }: { entry: EntryView }) {
  return (
    <Screen centered badge={sessionBadge(entry.session)}>
      <StatusView
        icon={IconMoodSmile}
        tone="info"
        title="Thanks for playing"
        body="This play has no prize to collect."
      >
        {entry.nextSession ? (
          <div className="flex flex-col">
            <InfoRow
              label="Next session"
              value={`${formatWhen(entry.nextSession.startsAt)} to ${formatTime(entry.nextSession.endsAt)}`}
            />
          </div>
        ) : null}
      </StatusView>
    </Screen>
  );
}
