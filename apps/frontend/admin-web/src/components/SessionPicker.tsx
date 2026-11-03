/** Select for choosing one session, grouped by day and showing its status. */
import { Select } from 'antd';
import { formatDate, timeRange } from '../lib/format';

interface PickerSession {
  sessionId: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface SessionPickerProps {
  sessions: PickerSession[];
  value: string | undefined;
  onChange: (sessionId: string) => void;
  loading?: boolean;
}

export function SessionPicker({ sessions, value, onChange, loading }: SessionPickerProps) {
  const days = [...new Set(sessions.map((s) => s.date))];
  return (
    <Select
      value={value}
      onChange={onChange}
      loading={loading}
      placeholder="Choose a session"
      style={{ minWidth: 300 }}
      options={days.map((date) => ({
        label: formatDate(date),
        options: sessions
          .filter((s) => s.date === date)
          .map((s) => ({
            value: s.sessionId,
            label: `${s.name}, ${timeRange(s)}${s.status === 'open' ? ' (running)' : ''}`,
          })),
      }))}
    />
  );
}

/** The session to show first: the running one, else the next one, else the last one. */
export function defaultSessionId(sessions: PickerSession[]): string | undefined {
  return (
    sessions.find((s) => s.status === 'open')?.sessionId ??
    sessions.find((s) => s.status === 'scheduled')?.sessionId ??
    sessions.at(-1)?.sessionId
  );
}
