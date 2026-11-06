/**
 * The winners of an ended hunt session: rank badge, player (name, player number, short QuickLook
 * user ID to copy), logos, points, prize and status, with confirm and disqualify. Full width so
 * nothing wraps or is cut off.
 */
import { IconTrophy } from '@tabler/icons-react';
import { Alert, Button, Card, Empty, Flex, Grid, Popconfirm, Table, Tag, Tooltip, Typography } from 'antd';
import type { HuntSession, Winner } from '../../api/hunt';
import { StatusTag } from '../../components/StatusTag';
import { formatTime } from '../../lib/format';

const MEDALS: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#FEF3C7', fg: '#B45309' },
  2: { bg: '#F1F5F9', fg: '#475569' },
  3: { bg: '#FFEDD5', fg: '#C2410C' },
};

export function RankBadge({ rank }: { rank: number }) {
  const medal = MEDALS[rank] ?? { bg: '#F4F4F5', fg: '#52525B' };
  return (
    <Flex
      align="center"
      justify="center"
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: medal.bg,
        color: medal.fg,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {rank}
    </Flex>
  );
}

/** Player number badge, the same number the leaderboard screens show ("Player #12") */
export function PlayerNumber({ value }: { value: number }) {
  return (
    <Tooltip title={`Shown as Player #${value} on the leaderboard screens`}>
      <Tag
        color="purple"
        bordered={false}
        style={{ marginInlineEnd: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
      >
        Player #{value}
      </Tag>
    </Tooltip>
  );
}

/** Name with the player number badge beside it, then the short QuickLook user ID (copies the full one) */
export function PlayerCell({
  name,
  playerNumber,
  userId,
}: { name: string; playerNumber: number; userId: string }) {
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
        <Typography.Text strong ellipsis={{ tooltip: name }} style={{ minWidth: 0 }}>
          {name || 'No name'}
        </Typography.Text>
        <PlayerNumber value={playerNumber} />
      </Flex>
      <Typography.Text
        type="secondary"
        copyable={{ text: userId, tooltips: ['Copy QuickLook user ID', 'Copied'] }}
        style={{
          fontSize: 12,
          whiteSpace: 'nowrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        ID {userId.slice(0, 8)}…
      </Typography.Text>
    </Flex>
  );
}

export function WinnersCard(props: {
  session: HuntSession | undefined;
  items: Winner[];
  loading: boolean;
  canEdit: boolean;
  onConfirm: (rank: number) => void;
  onConfirmAll: (list: Winner[]) => void;
  confirmingAll: boolean;
  onDisqualify: (rank: number) => void;
}) {
  const { session, items, canEdit } = props;
  const provisional = items.filter((w) => w.status === 'provisional');
  const ended = session?.status === 'closed';
  // Pinning the actions helps on wide screens; on a phone it would cover the player column
  const wide = Grid.useBreakpoint().md;

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <IconTrophy size={18} />
          Winners
          {items.length ? (
            <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
              {items.length - provisional.length} of {items.length} confirmed
            </Typography.Text>
          ) : null}
        </Flex>
      }
      extra={
        canEdit && provisional.length > 1 ? (
          <Popconfirm
            title={`Confirm all ${provisional.length} provisional winners?`}
            onConfirm={() => props.onConfirmAll(provisional)}
          >
            <Button type="primary" loading={props.confirmingAll}>
              Confirm all
            </Button>
          </Popconfirm>
        ) : null
      }
    >
      {!ended ? (
        <Alert
          type="info"
          showIcon
          message="Winners are listed automatically about a minute after the session ends"
        />
      ) : items.length === 0 ? (
        <Empty description="No winners yet. The list appears about a minute after the end." />
      ) : (
        <>
          {provisional.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Check each winner, then confirm. Confirmed winners show on the leaderboard screen and at the prize desk."
            />
          ) : null}
          <Table
            rowKey="rank"
            loading={props.loading}
            pagination={false}
            dataSource={items}
            scroll={{ x: 900 }}
            columns={[
              { title: 'Rank', dataIndex: 'rank', width: 72, render: (r: number) => <RankBadge rank={r} /> },
              {
                title: 'Player',
                width: 260,
                render: (_, w) => (
                  <PlayerCell name={w.fullName} playerNumber={w.playerNumber} userId={w.userId} />
                ),
              },
              { title: 'Logos', dataIndex: 'stalls', align: 'right', width: 80 },
              { title: 'Points', dataIndex: 'points', align: 'right', width: 80 },
              { title: 'Reached', dataIndex: 'reachedAt', render: formatTime, width: 90 },
              {
                title: 'Prize',
                dataIndex: 'prizeName',
                ellipsis: true,
                render: (p: string | null) =>
                  p ?? <Typography.Text type="secondary">Not set</Typography.Text>,
              },
              {
                title: 'Status',
                width: 120,
                render: (_, w) => <StatusTag status={w.collectedAt ? 'collected' : w.status} />,
              },
              {
                title: '',
                key: 'actions',
                fixed: wide ? 'right' : undefined,
                width: 190,
                render: (_, w) =>
                  canEdit && !w.collectedAt ? (
                    <Flex gap={8} justify="flex-end" wrap={false}>
                      {w.status === 'provisional' ? (
                        <Button size="small" type="primary" onClick={() => props.onConfirm(w.rank)}>
                          Confirm
                        </Button>
                      ) : null}
                      <Popconfirm
                        title={`Disqualify ${w.fullName} (Player #${w.playerNumber})?`}
                        description="Everyone below moves up one rank."
                        onConfirm={() => props.onDisqualify(w.rank)}
                      >
                        <Button size="small" danger>
                          Disqualify
                        </Button>
                      </Popconfirm>
                    </Flex>
                  ) : null,
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}
