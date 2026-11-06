/**
 * Every participant of a hunt session with their QuickLook user ID (staff find the phone number
 * with it in QuickLook), logos found, points, rank and the winner flag. Each player's scans as
 * received can be opened to check a dispute.
 */
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Drawer, Input, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { type Participant, type ScanRecord, huntApi } from '../../api/hunt';
import { formatTime } from '../../lib/format';
import { PlayerCell, RankBadge } from './WinnersCard';

const RESULT_LABELS: Record<ScanRecord['result'], { label: string; color: string }> = {
  counted: { label: 'Counted', color: 'green' },
  repeat: { label: 'Repeat', color: 'default' },
  'unknown-logo': { label: 'Not an event logo', color: 'orange' },
  'no-session': { label: 'Outside the session', color: 'orange' },
};

const matches = (p: Participant, text: string) =>
  [p.fullName, p.userId, String(p.playerNumber)].some((v) => v.toLowerCase().includes(text.toLowerCase()));

export function ParticipantsCard({ sessionId, live }: { sessionId: string; live: boolean }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Participant | null>(null);
  const participants = useQuery({
    queryKey: ['hunt', 'participants', sessionId],
    queryFn: () => huntApi.participants(sessionId),
    refetchInterval: live ? 10_000 : false,
  });
  const items = participants.data?.items ?? [];
  const shown = search.trim() ? items.filter((p) => matches(p, search.trim())) : items;

  return (
    <Card
      title={`Participants (${items.length})`}
      extra={
        <Input
          allowClear
          size="small"
          prefix={<IconSearch size={14} />}
          placeholder="Name, user ID or player number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
        />
      }
    >
      <Table
        size="small"
        rowKey="userId"
        loading={participants.isLoading}
        dataSource={shown}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: 820 }}
        columns={[
          {
            title: 'Rank',
            dataIndex: 'rank',
            width: 72,
            render: (rank: number | null) => (rank ? <RankBadge rank={rank} /> : <Tag color="red">Out</Tag>),
          },
          {
            title: 'Player',
            width: 260,
            render: (_, p) => (
              <PlayerCell name={p.fullName} playerNumber={p.playerNumber} userId={p.userId} />
            ),
          },
          { title: 'Logos', dataIndex: 'stalls', align: 'right' },
          { title: 'Points', dataIndex: 'points', align: 'right' },
          { title: 'Scans', dataIndex: 'totalScans', align: 'right' },
          { title: 'Reached', dataIndex: 'reachedAt', render: formatTime },
          {
            title: 'Winner',
            render: (_, p) => (p.winnerRank ? <Tag color="gold">Rank {p.winnerRank}</Tag> : null),
          },
          {
            title: '',
            align: 'right',
            render: (_, p) => (
              <Button size="small" onClick={() => setOpen(p)}>
                Scans
              </Button>
            ),
          },
        ]}
      />
      <ScansDrawer sessionId={sessionId} participant={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function ScansDrawer({
  sessionId,
  participant,
  onClose,
}: { sessionId: string; participant: Participant | null; onClose: () => void }) {
  const scans = useQuery({
    queryKey: ['hunt', 'scans', sessionId, participant?.userId],
    queryFn: () => huntApi.scans(sessionId, participant?.userId),
    enabled: Boolean(participant),
  });
  return (
    <Drawer
      title={
        participant
          ? `Scans of ${participant.fullName || participant.userId} (Player #${participant.playerNumber})`
          : ''
      }
      open={Boolean(participant)}
      onClose={onClose}
      width={560}
      destroyOnHidden
    >
      <Table
        size="small"
        rowKey="scanKey"
        loading={scans.isLoading}
        dataSource={scans.data?.items ?? []}
        pagination={false}
        columns={[
          { title: 'Received', dataIndex: 'receivedAt', render: formatTime },
          {
            title: 'Logo ID',
            dataIndex: 'logoId',
            render: (v: string) => <Typography.Text style={{ fontSize: 12 }}>{v}</Typography.Text>,
          },
          {
            title: 'Result',
            dataIndex: 'result',
            render: (r: ScanRecord['result']) => (
              <Tag color={RESULT_LABELS[r].color}>{RESULT_LABELS[r].label}</Tag>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
