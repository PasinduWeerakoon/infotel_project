import { Tag } from 'antd';

const STATUS = {
  open: { color: 'blue', label: 'Running' },
  scheduled: { color: 'default', label: 'Scheduled' },
  closed: { color: 'default', label: 'Ended' },
  provisional: { color: 'gold', label: 'Provisional' },
  confirmed: { color: 'green', label: 'Confirmed' },
  collected: { color: 'green', label: 'Collected' },
  pending: { color: 'gold', label: 'Not collected' },
} as const;

/** Coloured status label used across tables (sessions, winners, prizes). */
export function StatusTag({ status }: { status: keyof typeof STATUS }) {
  const { color, label } = STATUS[status];
  return (
    <Tag color={color} bordered={false} style={{ marginInlineEnd: 0 }}>
      {label}
    </Tag>
  );
}
