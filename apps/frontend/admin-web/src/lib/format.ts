/** Date and time helpers. Every time is shown in Colombo time, whatever the computer's zone. */
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const ZONE = 'Asia/Colombo';

export const colombo = (iso: string) => dayjs(iso).tz(ZONE);
export const formatTime = (iso: string | null | undefined) => (iso ? colombo(iso).format('HH:mm') : '');
export const formatDateTime = (iso: string | null | undefined) =>
  iso ? colombo(iso).format('ddd D MMM, HH:mm') : '';
export const formatDate = (date: string) => dayjs(date).format('ddd D MMM YYYY');
export const timeRange = (s: { startsAt: string; endsAt: string }) =>
  `${formatTime(s.startsAt)} to ${formatTime(s.endsAt)}`;
export const todayInColombo = () => dayjs().tz(ZONE).format('YYYY-MM-DD');
/** Short, readable form of an opaque QuickLook user ID for tables */
export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 12)}…` : id);
