/**
 * Game buttons: the big yellow one presses down like a real arcade button.
 * Secondary buttons are glass, ghost buttons are small text.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex select-none items-center justify-center gap-2.5 rounded-full font-display font-semibold transition-[transform,box-shadow,background-color] duration-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sun disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'btn-sun h-15 w-full max-w-[320px] px-8 text-[20px] tracking-wide uppercase',
  secondary:
    'glass h-13 w-full max-w-[320px] px-6 text-[16px] text-white hover:bg-white/15 active:scale-[0.98]',
  ghost: 'h-10 px-4 text-[13px] font-bold tracking-[0.12em] text-lilac uppercase hover:text-white',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="size-5" /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  icon?: ReactNode;
}

export function ButtonLink({
  variant = 'primary',
  icon,
  className = '',
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} viewTransition {...rest}>
      {icon}
      {children}
    </Link>
  );
}
