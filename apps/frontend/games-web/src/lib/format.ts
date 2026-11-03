/** Time helpers. Times from the API carry the Colombo offset, so they are shown in Colombo time. */
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Colombo',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Colombo',
});

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** "13:30" for today, "Tomorrow 09:00" or "Wed 4 Nov 09:00" otherwise. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (day(date) === day(today)) return formatTime(iso);
  if (day(date) === day(tomorrow)) return `Tomorrow ${formatTime(iso)}`;
  return `${dayFormat.format(date)} ${formatTime(iso)}`;
}

export const sessionRange = (s: { startsAt: string; endsAt: string }) =>
  `${formatTime(s.startsAt)} to ${formatTime(s.endsAt)}`;

/** "LKD-7Q4K-29" shown with spaces for easy reading aloud */
export const spacedReference = (reference: string) => reference.replaceAll('-', ' ');
