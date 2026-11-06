/**
 * Copy for every warning and error page (wireframes G5). One entry per API error code.
 * `facts` turns the error details into small "label: value" rows.
 */
import {
  type Icon,
  IconAlertTriangle,
  IconCircleCheck,
  IconClockHour4,
  IconGift,
  IconLock,
  IconPlayerPause,
  IconQrcode,
  IconWifiOff,
} from '@tabler/icons-react';
import { GAME_NAMES, type Game, type SessionBrief } from '../../api/games';
import type { Tone } from '../../components/ui/StatusView';
import { formatTime, formatWhen, sessionRange } from '../../lib/format';

export interface StatusMessage {
  icon: Icon;
  tone: Tone;
  /** Small spaced label above the headline */
  label: string;
  title: string;
  body: string;
  facts: { label: string; value: string }[];
  /** Show "View my result" when the visitor already has a result this session */
  resultEntryId?: string;
  retry?: boolean;
}

type Details = Record<string, unknown>;

const nextSessionFact = (details: Details) => {
  const next = details.nextSession as SessionBrief | null | undefined;
  return next
    ? [{ label: 'Next session', value: `${formatWhen(next.startsAt)} to ${formatTime(next.endsAt)}` }]
    : [];
};

const scanAgain: Omit<StatusMessage, 'facts'> = {
  icon: IconQrcode,
  tone: 'info',
  label: 'Scan to play',
  title: 'Please scan the logo again',
  body: 'Games open only by scanning the logo at the stall with the QuickLook app.',
};

export function statusMessage(code: string, details: Details = {}): StatusMessage {
  switch (code) {
    // One play per visitor per day (the code keeps its first name, the server still sends it)
    case 'ALREADY_PLAYED_THIS_SESSION': {
      const played = details.playedGame as Game | null;
      const requested = details.requestedGame as Game | undefined;
      const otherGame = played && requested && played !== requested;
      return {
        icon: otherGame ? IconLock : IconCircleCheck,
        tone: otherGame ? 'warning' : 'success',
        label: 'One play per day',
        title: "You've already played today",
        body: otherGame
          ? `You played ${GAME_NAMES[played]} earlier today. Each visitor can play once a day, so this game isn't available for you right now. Thank you for playing with us!`
          : 'Thank you for joining in! Each visitor can play once a day, either Spin the Wheel or Lucky Dip. We hope you enjoyed the game.',
        facts: [
          ...(played
            ? [
                {
                  label: 'You played',
                  value:
                    GAME_NAMES[played] +
                    (details.playedAt ? ` at ${formatTime(String(details.playedAt))}` : ''),
                },
              ]
            : []),
        ],
        resultEntryId: (details.entryId as string | null) ?? undefined,
      };
    }
    case 'SESSION_CLOSED':
      return {
        icon: IconClockHour4,
        tone: 'info',
        label: 'Between sessions',
        title: 'Games open soon',
        body: 'There is no session running right now. Come back when the next session starts.',
        facts: nextSessionFact(details),
      };
    case 'SESSION_ENDED':
      return {
        icon: IconClockHour4,
        tone: 'info',
        label: 'Session closed',
        title: 'This session has ended',
        body: 'Thanks for joining. See you in the next session.',
        facts: nextSessionFact(details),
      };
    case 'GAME_PAUSED':
      return {
        icon: IconPlayerPause,
        tone: 'warning',
        label: 'Paused',
        title: 'This game is paused',
        body: 'Staff paused the game for a moment. Please scan again shortly.',
        facts: [],
      };
    case 'GAME_IN_PROGRESS':
      return {
        icon: IconLock,
        tone: 'warning',
        label: 'Screen in use',
        title: 'Someone is playing right now',
        body: 'Wait until the big screen shows the logos again, then scan the logo again. Nothing was counted against you.',
        facts: [],
      };
    case 'NO_PRIZES_LEFT':
      return {
        icon: IconGift,
        tone: 'warning',
        label: 'Session complete',
        title: 'All prizes for this session are gone',
        body: 'Every prize for this session has been given out. New prizes are ready for the next session.',
        facts: nextSessionFact(details),
      };
    case 'MAIN_PRIZE_ALREADY_WON':
      return {
        icon: IconGift,
        tone: 'info',
        label: 'Game rule',
        title: 'You have already won a main prize today',
        body: 'One main prize per visitor per day, so the prizes left in this session go to new visitors. Thank you for playing!',
        facts: nextSessionFact(details),
      };
    case 'ENTRY_EXPIRED':
      return {
        icon: IconClockHour4,
        tone: 'warning',
        label: 'Time out',
        title: 'Your turn timed out',
        body: 'You did not start within the time, so the screen was given to the next visitor. This did not use your play.',
        facts: [],
      };
    case 'QUICKLOOK_SIGN_IN_REQUIRED':
      return {
        icon: IconLock,
        tone: 'info',
        label: 'Sign in to play',
        title: 'Sign in to the QuickLook app',
        body: 'Open the QuickLook app, sign in, then scan the game logo again to play.',
        facts: [],
      };
    case 'LINK_EXPIRED':
      return {
        icon: IconClockHour4,
        tone: 'warning',
        label: 'Link expired',
        title: 'This game link has expired',
        body: 'Game links work for a few minutes only. Scan the logo again with the QuickLook app.',
        facts: [],
      };
    case 'LINK_NOT_READY':
      return {
        icon: IconPlayerPause,
        tone: 'warning',
        label: 'Not ready',
        title: 'The games are getting ready',
        body: 'Please try again in a few minutes, or visit the help desk.',
        facts: [],
        retry: true,
      };
    case 'RATE_LIMITED':
      return {
        icon: IconPlayerPause,
        tone: 'warning',
        label: 'Busy',
        title: 'Too many tries',
        body: 'Please wait a minute and try again. Your play is safe and is never counted twice.',
        facts: [],
        retry: true,
      };
    case 'LINK_INVALID':
    case 'SIGN_IN_REQUIRED':
    case 'TOKEN_INVALID':
    case 'LOGO_NOT_FOUND':
    case 'SCAN_NOT_FOUND':
    case 'SCAN_NOT_YOURS':
    case 'SCAN_ALREADY_USED':
    case 'ENTRY_NOT_FOUND':
    case 'NOT_A_GAME_LOGO':
    case 'SIGN_IN_FAILED':
    case 'SIGN_IN_EXPIRED':
      return { ...scanAgain, facts: [] };
    case 'NETWORK_ERROR':
      return {
        icon: IconWifiOff,
        tone: 'danger',
        label: 'Connection',
        title: 'You seem to be offline',
        body: 'Check your connection and try again. Your play is safe and is never counted twice.',
        facts: [],
        retry: true,
      };
    default:
      return {
        icon: IconAlertTriangle,
        tone: 'danger',
        label: 'Unexpected error',
        title: 'Something went wrong',
        body: 'Your play was not counted. Please scan the logo again. If this keeps happening, visit the help desk.',
        facts: [{ label: 'Error code', value: code }],
        retry: true,
      };
  }
}

export const sessionBadge = (session: SessionBrief | null | undefined) =>
  session ? `${session.name} · ${sessionRange(session)}` : undefined;
