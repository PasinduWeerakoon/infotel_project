/**
 * Visitor flow of Project A: status, create an entry from a scan, read it, play it.
 * Every decision is made here on the server. The browser only shows the result.
 */
import { ulid } from 'ulid';
import { imageUrl } from '../config.js';
import { getSettings, listPrizes } from '../data/catalog-repo.js';
import { claimWithPhone, dayGuards, playedToday, voidPrize } from '../data/claims-repo.js';
import {
  createEntry,
  expireEntry,
  extendLock,
  getEntry,
  getPlayerGuard,
  getReference,
  hasMainPrizeToday,
  savePlay,
} from '../data/entries-repo.js';
import { waitForScan } from '../data/platform-scans.js';
import { PLAY_LOCK } from '../data/screens-repo.js';
import { getSession, listAllocations, upcomingSessions } from '../data/sessions-repo.js';
import { type DrawCandidate, drawPrize } from '../domain/draw.js';
import { normalizeName } from '../domain/identity.js';
import { maskPhone, normalizePhone } from '../domain/player.js';
import { newReference } from '../domain/reference.js';
import { currentSession, nextSession, releaseWindow } from '../domain/sessions.js';
import {
  ANIMATION_MS,
  type Entry,
  GAMES,
  type Game,
  type PlayerDetails,
  type Prize,
  type Session,
} from '../domain/types.js';
import { HttpError } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { addSeconds, colomboDate, ms, nowIso } from '../lib/time.js';
import { notifyScreens } from './screen-notifier.js';

const publicSession = (s: Session | undefined) =>
  s ? { sessionId: s.sessionId, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, games: s.games } : null;

/** GET /games/v1/status: what is open now. The same for every visitor, so it can be cached briefly. */
export async function getStatus() {
  const [sessions, settings] = await Promise.all([upcomingSessions(), getSettings()]);
  const current = currentSession(sessions);
  return {
    serverTime: nowIso(),
    session: publicSession(current),
    nextSession: publicSession(nextSession(sessions)),
    games: Object.fromEntries(
      GAMES.map((game) => [
        game,
        {
          open: Boolean(current?.games.includes(game)) && !settings.paused[game],
          paused: settings.paused[game],
        },
      ]),
    ),
  };
}

/** Wheel segments: every prize allocated to this session and game. There is no "try again". */
async function segmentsFor(sessionId: string, game: Game, prizes?: Prize[]) {
  const [allocations, catalog] = await Promise.all([
    listAllocations(sessionId, game),
    prizes ?? listPrizes(),
  ]);
  const byId = new Map(catalog.map((p) => [p.prizeId, p]));
  const segments = allocations
    .filter((a) => a.allocated > 0 && byId.has(a.prizeId))
    .sort((a, b) => a.prizeId.localeCompare(b.prizeId))
    .map((a) => {
      const prize = byId.get(a.prizeId) as Prize;
      return { id: prize.prizeId, name: prize.name, imageUrl: imageUrl(prize.imageKey) };
    });
  return segments;
}

/** The entry as the visitor's phone sees it (never remaining quantities, never other visitors). */
export async function entryView(entry: Entry) {
  const sessions = await upcomingSessions();
  const session = sessions.find((s) => s.sessionId === entry.sessionId);
  const segments = await segmentsFor(entry.sessionId, entry.game);
  let result = null;
  if (entry.status === 'played') {
    const prize = entry.prizeId ? (await listPrizes()).find((p) => p.prizeId === entry.prizeId) : undefined;
    const reference = entry.reference && !entry.voided ? await getReference(entry.reference) : undefined;
    // A prize taken back still lands on the slice it won, so a replayed animation looks the same
    const target = Math.max(
      0,
      segments.findIndex((s) => s.id === (entry.prizeId ?? entry.voidedPrizeId)),
    );
    result = {
      prize: prize
        ? {
            prizeId: prize.prizeId,
            name: prize.name,
            imageUrl: imageUrl(prize.imageKey),
            isMainPrize: prize.isMainPrize,
          }
        : null,
      // A prize taken back has no prize and no reference: the phone shows "no prize to collect"
      reference: entry.voided ? null : entry.reference,
      playedAt: entry.playedAt,
      collectedAt: reference?.collectedAt ?? null,
      // A QuickLook winner has not given a phone yet: the result page asks before showing the reference
      phoneNeeded: Boolean(prize && entry.player && !entry.player.phone && !reference?.collectedAt),
      animation: { target, durationMs: ANIMATION_MS[entry.game] },
    };
  }
  return {
    entryId: entry.entryId,
    game: entry.game,
    status: entry.status === 'ready' && ms(entry.expiresAt) < Date.now() ? 'expired' : entry.status,
    expiresAt: entry.expiresAt,
    session: publicSession(session),
    nextSession: publicSession(nextSession(sessions, entry.game)),
    display: { segments, boxes: 9 },
    result,
  };
}

/** POST /games/v1/entries: a scan becomes an entry if every rule allows it. */
export async function startEntry(userId: string, scanId: string, name = '') {
  const scan = await waitForScan(scanId);
  if (!scan) throw new HttpError(422, 'SCAN_NOT_FOUND', 'Please scan the logo again with the QuickLook app');
  if (scan.userId !== userId)
    throw new HttpError(422, 'SCAN_NOT_YOURS', 'Please scan the logo again with the QuickLook app');
  if (scan.logoType !== 'game' || !GAMES.includes(scan.targetId as Game)) {
    throw new HttpError(422, 'NOT_A_GAME_LOGO', 'This logo does not open a game');
  }
  const game = scan.targetId as Game;

  // A scan creates at most one entry: a refresh or a second tap returns the same entry
  if (scan.usedBy) return existingEntry(scan.usedBy, userId);

  const [sessions, settings] = await Promise.all([upcomingSessions(), getSettings()]);
  const session = currentSession(sessions, game);
  if (!session) {
    throw new HttpError(409, 'SESSION_CLOSED', 'There is no session running right now', {
      nextSession: publicSession(nextSession(sessions, game)),
    });
  }
  if (settings.paused[game]) throw new HttpError(409, 'GAME_PAUSED', 'This game is paused for a moment');

  const allocations = await listAllocations(session.sessionId, game);
  if (!allocations.some((a) => a.remaining > 0)) {
    throw new HttpError(409, 'NO_PRIZES_LEFT', 'All prizes for this session have been given out', {
      nextSession: publicSession(nextSession(sessions, game)),
    });
  }
  // Every play wins, so a visitor who could only get a main prize they may not win cannot start
  if (settings.repeatWinnerRule && (await onlyMainPrizesFor(userId, allocations))) {
    throw mainPrizeAlreadyWon(sessions, game);
  }

  // One live entry per account in a session. An entry that expired unplayed can be replaced.
  const guard = await getPlayerGuard(session.sessionId, userId);
  // One play per day, either game, any session: this account or this name already played today.
  // The play transaction checks it again; this answers early, before the screen is taken.
  if (!guard) {
    const earlier = await playedToday(session.date, userId, normalizeName(name));
    if (earlier) throw alreadyPlayed(await getEntry(earlier), sessions, game, userId);
  }
  let replaceExpired: string | undefined;
  if (guard) {
    const previous = await getEntry(guard.entryId);
    const isLive = previous?.status === 'ready' && ms(previous.expiresAt) >= Date.now();
    // Scanned again before playing: continue with the same entry
    if (previous && isLive) return { created: false, view: await entryView(previous) };
    const expiredUnplayed = previous && previous.status !== 'played' && !isLive;
    if (!expiredUnplayed) throw alreadyPlayed(previous, sessions, game, userId);
    replaceExpired = guard.entryId;
  }

  const now = nowIso();
  const entry: Entry = {
    entryId: `ent_${ulid()}`,
    userId,
    sessionId: session.sessionId,
    game,
    scanId,
    lockKey: PLAY_LOCK,
    status: 'ready',
    createdAt: now,
    expiresAt: addSeconds(now, settings.lockTimeoutSeconds),
    playedAt: null,
    prizeId: null,
    reference: null,
  };

  const failure = await createEntry(entry, replaceExpired);
  if (failure === 'SCAN_USED') {
    const latest = await waitForScan(scanId, 0);
    return existingEntry(latest?.usedBy ?? '', userId);
  }
  if (failure === 'ALREADY_PLAYED') throw alreadyPlayed(undefined, sessions, game, userId);
  if (failure === 'SCREEN_BUSY') {
    throw new HttpError(
      409,
      'GAME_IN_PROGRESS',
      'Someone is playing right now. Please scan again in a moment',
    );
  }

  // The screens show the same wheel (or boxes) as the phone while the player gets ready
  const view = await entryView(entry);
  await notifyScreens(game, {
    type: 'entry.started',
    entryId: entry.entryId,
    game,
    expiresAt: entry.expiresAt,
    segments: view.display.segments,
  });
  logger.info('Entry created', { entryId: entry.entryId, sessionId: session.sessionId, game });
  return { created: true, view };
}

/** Repeat-winner rule: the visitor won a main prize today and only main prizes are left */
async function onlyMainPrizesFor(userId: string, allocations: { prizeId: string; remaining: number }[]) {
  const main = new Set((await listPrizes()).filter((p) => p.isMainPrize).map((p) => p.prizeId));
  const fillerLeft = allocations.some((a) => a.remaining > 0 && !main.has(a.prizeId));
  return !fillerLeft && (await hasMainPrizeToday(userId, colomboDate()));
}

const mainPrizeAlreadyWon = (sessions: Session[], game: Game) =>
  new HttpError(409, 'MAIN_PRIZE_ALREADY_WON', 'You have already won a main prize today', {
    nextSession: publicSession(nextSession(sessions, game)),
  });

async function existingEntry(entryId: string, userId: string) {
  const entry = await getEntry(entryId);
  if (!entry || entry.userId !== userId)
    throw new HttpError(409, 'SCAN_ALREADY_USED', 'Please scan the logo again');
  return { created: false, view: await entryView(entry) };
}

/**
 * One play per visitor per day. The code keeps its old name so phones that still have the older
 * page open show the right screen. Only the visitor's own earlier play can be opened from it.
 */
function alreadyPlayed(
  previous: Entry | undefined,
  sessions: Session[],
  requestedGame: Game,
  userId: string,
) {
  const own = previous?.userId === userId;
  return new HttpError(409, 'ALREADY_PLAYED_THIS_SESSION', 'You have already played today', {
    requestedGame,
    playedGame: previous?.game ?? null,
    playedAt: previous?.playedAt ?? null,
    entryId: own && previous?.status === 'played' ? previous.entryId : null,
    nextSession: publicSession(nextSession(sessions)),
  });
}

/** GET /games/v1/entries/:entryId */
export async function readEntry(userId: string, entryId: string) {
  const entry = await getEntry(entryId);
  // Someone else's entry looks the same as a missing one
  if (!entry || entry.userId !== userId)
    throw new HttpError(404, 'ENTRY_NOT_FOUND', 'Please scan the logo again');
  return entryView(entry);
}

/**
 * POST /games/v1/entries/:entryId/phone: a QuickLook winner gives the phone for the prize desk.
 * The first valid number is final. A number that already played this session (another account)
 * makes this play a duplicate: the prize goes back to the pool and the phone shows no prize.
 */
export async function addWinnerPhone(userId: string, entryId: string, input: string) {
  const entry = await getEntry(entryId);
  if (!entry || entry.userId !== userId)
    throw new HttpError(404, 'ENTRY_NOT_FOUND', 'Please scan the logo again');
  const phone = normalizePhone(input);
  if (!phone) throw new HttpError(422, 'PHONE_INVALID', 'Please check your phone number');
  if (entry.reference && entry.player && !entry.player.phone && !entry.voided) {
    // 'not-open': already given, collected or taken back, so nothing changes
    const date =
      (await getSession(entry.sessionId))?.date ?? colomboDate(new Date(entry.playedAt ?? nowIso()));
    if ((await claimWithPhone(entry, phone, date)) === 'duplicate') {
      await voidPrize(entry, { reason: 'duplicate', by: 'system', at: nowIso(), phone });
      logger.info('Duplicate phone, prize taken back', { entryId, sessionId: entry.sessionId });
    }
  }
  return readEntry(userId, entryId);
}

const MAX_DRAW_ATTEMPTS = 3;

/**
 * POST /games/v1/entries/:entryId/play: draw the prize. Calling it again returns the same result.
 * Both games need the player's name and phone, typed on the phone just before playing.
 */
export async function playEntry(userId: string, entryId: string, player: PlayerDetails | null = null) {
  let entry = await getEntry(entryId);
  if (!entry || entry.userId !== userId)
    throw new HttpError(404, 'ENTRY_NOT_FOUND', 'Please scan the logo again');
  if (entry.status === 'played') return entryView(entry);
  if (!player) {
    throw new HttpError(422, 'PLAYER_DETAILS_REQUIRED', 'Please enter your name and phone number');
  }
  if (entry.status === 'expired' || ms(entry.expiresAt) < Date.now()) {
    await expireEntry(entry);
    await notifyScreens(entry.game, { type: 'entry.ended', entryId });
    throw new HttpError(409, 'ENTRY_EXPIRED', 'Your turn timed out. Please scan the logo again');
  }

  const [settings, prizes, sessions] = await Promise.all([getSettings(), listPrizes(), upcomingSessions()]);
  const session =
    sessions.find((s) => s.sessionId === entry?.sessionId) ?? (await getSession(entry.sessionId));
  if (!session) throw new HttpError(409, 'SESSION_CLOSED', 'There is no session running right now');
  const window = releaseWindow(session, entry.game);
  const today = colomboDate();
  const excludeMain = settings.repeatWinnerRule && (await hasMainPrizeToday(userId, today));
  const prizeById = new Map(prizes.map((p) => [p.prizeId, p]));
  // One play per day by account, name and (a guest's) phone. A QuickLook player's phone is
  // checked when given after the win.
  const guards = dayGuards({
    date: session.date,
    userId,
    name: normalizeName(player.name),
    phone: player.phone,
    entryId,
  });

  for (let attempt = 1; attempt <= MAX_DRAW_ATTEMPTS; attempt++) {
    const allocations = await listAllocations(entry.sessionId, entry.game);
    const candidates: DrawCandidate[] = allocations.map((a) => ({
      ...a,
      isMainPrize: prizeById.get(a.prizeId)?.isMainPrize ?? false,
    }));
    const drawn = drawPrize(candidates, {
      now: Date.now(),
      window,
      excludeMainPrizes: excludeMain,
    });
    const prize = drawn.prize ? (prizeById.get(drawn.prize.prizeId) ?? null) : null;
    if (!prize) {
      // The last prizes went to other plays while this visitor got ready: free the screen and say so
      await expireEntry(entry);
      await notifyScreens(entry.game, { type: 'entry.ended', entryId });
      if (drawn.reason === 'MAIN_PRIZE_ALREADY_WON') throw mainPrizeAlreadyWon(sessions, entry.game);
      throw new HttpError(409, 'NO_PRIZES_LEFT', 'All prizes for this session have been given out', {
        nextSession: publicSession(nextSession(sessions, entry.game)),
      });
    }

    const failure = await savePlay({
      entry,
      playedAt: nowIso(),
      prize: { prizeId: prize.prizeId, isMainPrize: prize.isMainPrize },
      reference: newReference(),
      player,
      rememberMainPrizeOn: settings.repeatWinnerRule ? today : null,
      guards,
    });
    if (failure === 'GUARD') {
      // This account, name or phone already played today: no prize is drawn and the screen is freed
      await expireEntry(entry);
      await notifyScreens(entry.game, { type: 'entry.ended', entryId });
      const earlier = await playedToday(session.date, userId, normalizeName(player.name));
      throw alreadyPlayed(earlier ? await getEntry(earlier) : undefined, sessions, entry.game, userId);
    }
    if (failure === 'PRIZE_TAKEN' || failure === 'BUSY') continue; // another play took the last unit, or a busy moment: draw again
    if (failure === 'NOT_READY') return readEntry(userId, entryId); // a parallel request already played

    entry = (await getEntry(entryId)) as Entry;
    const view = await entryView(entry);
    await afterPlay(entry, view);
    logger.info('Played', { entryId, game: entry.game, prizeId: prize.prizeId });
    return view;
  }
  throw new HttpError(503, 'BUSY_TRY_AGAIN', 'Many people are playing right now. Please tap again');
}

/** Keeps the screen reserved until the animation ends, then tells the screen what to show. */
async function afterPlay(entry: Entry, view: Awaited<ReturnType<typeof entryView>>) {
  const durationMs = ANIMATION_MS[entry.game];
  await extendLock(entry.lockKey, entry.entryId, addSeconds(nowIso(), Math.ceil(durationMs / 1000) + 8));
  await notifyScreens(entry.game, {
    type: 'play.result',
    entryId: entry.entryId,
    game: entry.game,
    segments: view.display.segments,
    target: view.result?.animation.target ?? 0,
    prize: view.result?.prize ? { name: view.result.prize.name, imageUrl: view.result.prize.imageUrl } : null,
    player: entry.player ? { name: entry.player.name, phone: maskPhone(entry.player.phone) } : null,
    durationMs,
  });
}
