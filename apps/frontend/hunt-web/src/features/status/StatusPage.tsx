/**
 * Warning and error pages for the Treasure Hunt app, and the home page
 * (opening the app without scanning a stall logo).
 */
import {
  type Icon,
  IconAlertTriangle,
  IconMap2,
  IconQrcode,
  IconRefresh,
  IconTrophy,
  IconWifiOff,
} from '@tabler/icons-react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Screen } from '../../components/layout/Screen';
import { Button, ButtonLink } from '../../components/ui/Button';
import { StatusView, type Tone } from '../../components/ui/StatusView';

interface Message {
  icon: Icon;
  tone: Tone;
  title: string;
  body: string;
  retry?: boolean;
}

function messageFor(code: string): Message {
  switch (code) {
    case 'HOME':
      return {
        icon: IconMap2,
        tone: 'info',
        title: 'Find the stalls, collect points',
        body: 'Scan the logo at each stall with the QuickLook app. Every new stall gives you points, and your progress shows here.',
      };
    case 'NETWORK_ERROR':
      return {
        icon: IconWifiOff,
        tone: 'danger',
        title: 'You seem to be offline',
        body: 'Check your connection and try again. Your scan is safe and is never counted twice.',
        retry: true,
      };
    case 'SIGN_IN_REQUIRED':
    case 'TOKEN_INVALID':
    case 'LOGO_NOT_FOUND':
    case 'SCAN_NOT_FOUND':
    case 'SCAN_NOT_YOURS':
    case 'SIGN_IN_FAILED':
    case 'SIGN_IN_EXPIRED':
      return {
        icon: IconQrcode,
        tone: 'info',
        title: 'Please scan the stall logo again',
        body: 'Points are counted only when you scan the stall logo with the QuickLook app.',
      };
    default:
      return {
        icon: IconAlertTriangle,
        tone: 'danger',
        title: 'Something went wrong',
        body: 'Please scan the stall logo again. If this keeps happening, visit the help desk.',
        retry: true,
      };
  }
}

export function StatusPage({ code: fixedCode }: { code?: string }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const code = fixedCode ?? params.code ?? 'HOME';
  const retryTo = (location.state as { retryTo?: string } | null)?.retryTo;
  const message = messageFor(code);

  return (
    <Screen
      centered
      actions={
        <>
          {message.retry && retryTo ? (
            <Button
              icon={<IconRefresh className="size-5" aria-hidden />}
              onClick={() => navigate(retryTo, { replace: true })}
            >
              Try again
            </Button>
          ) : null}
          <ButtonLink
            to="/leaderboard"
            variant={message.retry && retryTo ? 'secondary' : 'primary'}
            icon={<IconTrophy className="size-5" aria-hidden />}
          >
            Leaderboard
          </ButtonLink>
        </>
      }
    >
      <StatusView icon={message.icon} tone={message.tone} title={message.title} body={message.body} />
    </Screen>
  );
}
