/**
 * Both games ask for the player's name and phone before playing. The prize desk uses them to
 * find the prize, and the big screens show the name with the prize. Nothing is validated,
 * only trimmed. The last details are remembered on this phone to save typing next time.
 */
import { IconArrowRight } from '@tabler/icons-react';
import { type FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerDetails } from '../../api/games';
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

function remember(player: PlayerDetails) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
  } catch {
    // Private browsing: the details are still used for this play
  }
}

export function PlayerDetailsSheet({ onDone }: { onDone: (player: PlayerDetails) => void }) {
  const [name, setName] = useState(() => rememberedPlayer().name);
  const [phone, setPhone] = useState(() => rememberedPlayer().phone);
  const ready = name.trim().length > 0 && phone.trim().length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    const player = { name: name.trim().slice(0, 60), phone: phone.trim().slice(0, 30) };
    remember(player);
    onDone(player);
  };

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
            Before you play
          </h2>
          <p className="mt-1 text-[15px] text-haze">
            Your name shows on the big screen with your prize. The prize desk uses your phone number.
          </p>
        </div>
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
            className="field"
          />
        </Field>
        <Button
          type="submit"
          disabled={!ready}
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
