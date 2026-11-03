/**
 * Warning and error pages (wireframes G5), chosen by the error code in the address.
 * Also the home page: opening the app without scanning shows "Please scan the logo again".
 */
import { IconHistory, IconRefresh } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Screen } from '../../components/layout/Screen';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusView } from '../../components/ui/StatusView';
import { statusMessage } from './messages';

export function StatusPage({ code: fixedCode }: { code?: string }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const code = fixedCode ?? params.code ?? 'SCAN_NOT_FOUND';
  const state = location.state as { details?: Record<string, unknown>; retryTo?: string } | null;
  const details = state?.details ?? {};
  const message = statusMessage(code, details);

  return (
    <Screen
      centered
      actions={
        <>
          {message.resultEntryId ? (
            <ButtonLink
              to={`/result/${message.resultEntryId}`}
              icon={<IconHistory className="size-4" stroke={1.5} aria-hidden />}
            >
              View my result
            </ButtonLink>
          ) : null}
          {message.retry && state?.retryTo ? (
            <Button
              variant={message.resultEntryId ? 'secondary' : 'primary'}
              icon={<IconRefresh className="size-4" stroke={1.5} aria-hidden />}
              onClick={() => navigate(state.retryTo ?? '/', { replace: true, viewTransition: true })}
            >
              Try again
            </Button>
          ) : null}
        </>
      }
    >
      <StatusView
        icon={message.icon}
        tone={message.tone}
        label={message.label}
        title={message.title}
        body={message.body}
        facts={message.facts}
      />
      {code === 'SCAN_NOT_FOUND' || !params.code ? <HowToPlay /> : null}
    </Screen>
  );
}

function HowToPlay() {
  const steps = [
    { text: 'Open the QuickLook app', color: 'bg-sky' },
    { text: 'Scan the Spin the Wheel or Lucky Dip logo at the stall', color: 'bg-candy' },
    { text: 'Play on your phone and watch the big screen', color: 'bg-sun' },
  ];
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, index) => (
        <li
          key={step.text}
          className="glass flex items-center gap-4 p-3.5 text-left text-[15px] font-semibold"
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl font-display text-[19px] font-bold text-night ${step.color}`}
          >
            {index + 1}
          </span>
          {step.text}
        </li>
      ))}
    </ol>
  );
}
