/**
 * Both games ask for the player's name and phone before playing. The prize desk uses them to
 * find the prize, and the big screens show the name with the prize. Nothing is validated,
 * only trimmed. The last details are remembered on this phone to save typing next time.
 * A visitor who came from the QuickLook app is not asked before playing: the server uses their
 * QuickLook name, and after a win the result page asks only for the phone number (`phoneOnly`).
 * A guest (not signed in to QuickLook) sees this popup first, before the game opens (`guest`): it
 * signs them in, so on the game page both are locked and the popup is not shown again.
 */
import { IconArrowRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type PlayerDetails, gamesApi } from '../../api/games';
import { Button } from '../../components/ui/Button';

const STORAGE_KEY = 'lkdr_player';

export function rememberedPlayer(): PlayerDetails {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PlayerDetails>;
    return { name: saved.name ?? '', phone: saved.phone ?? '' };
  } catch {
    return { name: '', phone: '' };
  }
}

export function rememberPlayer(player: PlayerDetails) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
  } catch {
    // Private browsing: the details are still used for this play
  }
}

export function PlayerDetailsSheet({
  onDone,
  guest = false,
  phoneOnly = false,
  busy = false,
  error = null,
}: {
  onDone: (player: PlayerDetails) => void;
  /** Not signed in yet: the details sign the guest in */
  guest?: boolean;
  /** A QuickLook winner: only the phone number, for the prize desk */
  phoneOnly?: boolean;
  busy?: boolean;
  /** A message under the phone number, for example a number that is not valid */
  error?: string | null;
}) {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: gamesApi.session,
    staleTime: 60_000,
    enabled: !guest && !phoneOnly,
  });
  const lockedName = session.data?.nameLocked ? session.data.firstName : null;
  const lockedPhone = session.data?.phone ?? null;
  const [name, setName] = useState(() => rememberedPlayer().name);
  const [phone, setPhone] = useState(() => rememberedPlayer().phone);
  const loading = !guest && !phoneOnly && session.isPending;
  // A guest's details sign them in and a winner's phone is checked, so the server's minimums apply;
  // otherwise anything typed is fine
  const filled = phoneOnly
    ? phone.trim().length >= 7
    : guest
      ? name.trim().length >= 2 && phone.trim().length >= 7
      : name.trim().length > 0 && phone.trim().length > 0;
  const ready = !loading && !busy && filled;
  // A guest gave both before the game opened, and a QuickLook player gives the phone after a win:
  // neither is asked before playing (an empty phone tells the server to ask after a win)
  const skip = !guest && !phoneOnly && Boolean(lockedName);

  useEffect(() => {
    if (skip && lockedName) onDone({ name: lockedName, phone: lockedPhone ?? '' });
  }, [skip, lockedName, lockedPhone, onDone]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    const player = { name: name.trim().slice(0, 60), phone: phone.trim().slice(0, 30) };
    rememberPlayer(phoneOnly ? { name, phone: player.phone } : player);
    onDone(player);
  };

  if (loading || skip) return null;

  // On document.body, so the page's animated (transformed) layout cannot clip the full-screen overlay
  return createPortal(
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center bg-night/70 p-0 text-white backdrop-blur-sm sm:items-center"
      aria-modal="true"
      aria-labelledby="player-details-title"
    >
      <form
        onSubmit={submit}
        className="flex w-full max-w-[420px] animate-pop flex-col gap-4 rounded-t-[28px] bg-gradient-to-b from-deep to-night p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/15 sm:rounded-[28px]"
      >
        <div className="text-center">
          <h2 id="player-details-title" className="font-display text-[26px] font-bold">
            {phoneOnly ? 'One last step' : 'Before you play'}
          </h2>
          <p className="mt-1 text-[15px] text-haze">
            {phoneOnly
              ? 'Enter your phone number to get your reference. The prize desk uses it to give you your prize.'
              : 'Your name shows on the big screen with your prize. The prize desk uses your phone number.'}
          </p>
        </div>
        {phoneOnly ? null : (
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              placeholder="For example Nimal Perera"
              className="field"
            />
          </Field>
        )}
        <Field label="Phone number">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="done"
            placeholder="For example 077 123 4567"
            aria-invalid={Boolean(error)}
            className="field"
          />
          {error ? <span className="text-[13px] font-bold text-coral">{error}</span> : null}
        </Field>
        <Button
          type="submit"
          disabled={!ready}
          loading={busy}
          className="mx-auto mt-1"
          icon={<IconArrowRight className="size-6" stroke={2.2} aria-hidden />}
        >
          Continue
        </Button>
      </form>
    </dialog>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is passed as children
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-extrabold tracking-[0.12em] text-lilac uppercase">{label}</span>
      {children}
    </label>
  );
}
