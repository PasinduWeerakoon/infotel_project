/**
 * A5: leaderboard and winners, counted from the scans QuickLook sent. When a session ends, the
 * standings are frozen, the provisional winners are listed and flagged on the participants.
 * Confirm each one, or disqualify (everyone below moves up). Staff see names and QuickLook user
 * IDs (the phone number is found with the ID in QuickLook); the public screen shows player numbers
 * only. Pick another day or session to see its results.
 */
import { IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Empty, Flex, Popconfirm, Row, Statistic, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { type Winner, huntApi } from '../../api/hunt';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { SessionPicker, defaultSessionId } from '../../components/SessionPicker';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { formatTime } from '../../lib/format';
import { ParticipantsCard } from './ParticipantsCard';

const SCREEN_WEB_URL = import.meta.env.VITE_SCREEN_WEB_URL ?? 'http://localhost:5176';

export function WinnersPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['hunt-admin']);
  const sessions = useQuery({ queryKey: ['hunt', 'sessions'], queryFn: () => huntApi.sessions() });
  const [sessionId, setSessionId] = useState<string>();

  useEffect(() => {
    if (!sessionId && sessions.data) setSessionId(defaultSessionId(sessions.data.items));
  }, [sessions.data, sessionId]);

  const session = sessions.data?.items.find((s) => s.sessionId === sessionId);
  const winners = useQuery({
    queryKey: ['hunt', 'winners', sessionId],
    queryFn: () => huntApi.winners(sessionId ?? ''),
    enabled: Boolean(sessionId),
    refetchInterval: session?.status === 'closed' ? 10_000 : false,
  });
  const live = useQuery({
    queryKey: ['hunt', 'live', sessionId],
    queryFn: () => huntApi.live(sessionId ?? ''),
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });

  const refresh = [
    ['hunt', 'winners'],
    ['hunt', 'live'],
  ];
  const confirm = useAction((rank: number) => huntApi.confirm(sessionId ?? '', rank), {
    success: 'Winner confirmed',
    refresh,
  });
  const confirmAll = useAction(
    async (list: Winner[]) => {
      for (const w of list) await huntApi.confirm(sessionId ?? '', w.rank);
    },
    { success: 'All winners confirmed', refresh },
  );
  const disqualify = useAction((rank: number) => huntApi.disqualify(sessionId ?? '', rank), {
    success: 'Disqualified. Everyone below moved up one rank.',
    refresh,
  });

  const items = winners.data?.items ?? [];
  const provisional = items.filter((w) => w.status === 'provisional');

  return (
    <>
      <PageHeader
        title="Leaderboard and winners"
        description="Most different logos first, a tie goes to whoever reached the count first. The public screen shows player numbers only."
        extra={
          <Button
            icon={<IconExternalLink size={16} />}
            href={`${SCREEN_WEB_URL}/leaderboard`}
            target="_blank"
          >
            Open leaderboard screen
          </Button>
        }
      />
      <Flex vertical gap={16}>
        <SessionPicker
          sessions={sessions.data?.items ?? []}
          value={sessionId}
          onChange={setSessionId}
          loading={sessions.isLoading}
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={9}>
            <Card title={session?.status === 'closed' ? 'Final standings' : 'Live top 10'}>
              <Flex gap={24} align="flex-end" style={{ marginBottom: 12 }}>
                <Statistic title="Players" value={live.data?.players ?? 0} />
                <Statistic title="Scans" value={live.data?.scans ?? 0} />
                <Typography.Text type="secondary">
                  {live.data?.lastScanAt
                    ? `Last scan at ${formatTime(live.data.lastScanAt)}`
                    : 'No scans yet'}
                </Typography.Text>
              </Flex>
              <Table
                size="small"
                rowKey="userId"
                pagination={false}
                dataSource={live.data?.top ?? []}
                columns={[
                  { title: '#', dataIndex: 'rank', width: 44 },
                  {
                    title: 'Player',
                    render: (_, p) => (
                      <Flex vertical>
                        <Typography.Text strong>{p.fullName}</Typography.Text>
                        <Typography.Text type="secondary">#{p.playerNumber}</Typography.Text>
                      </Flex>
                    ),
                  },
                  { title: 'Logos', dataIndex: 'stalls', align: 'right' },
                  { title: 'Points', dataIndex: 'points', align: 'right' },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={15}>
            <Card
              title="Winners"
              extra={
                canEdit && provisional.length > 0 ? (
                  <Popconfirm
                    title={`Confirm all ${provisional.length} provisional winners?`}
                    onConfirm={() => confirmAll.mutate(provisional)}
                  >
                    <Button type="primary" loading={confirmAll.isPending}>
                      Confirm all
                    </Button>
                  </Popconfirm>
                ) : null
              }
            >
              {session && session.status !== 'closed' ? (
                <Alert
                  type="info"
                  showIcon
                  message="Winners are listed automatically when the session ends"
                />
              ) : items.length === 0 ? (
                <Empty description="No winners yet. The list appears within a minute of the end." />
              ) : (
                <Table
                  rowKey="rank"
                  pagination={false}
                  dataSource={items}
                  scroll={{ x: 760 }}
                  columns={[
                    { title: 'Rank', dataIndex: 'rank', width: 64 },
                    {
                      title: 'Player',
                      render: (_, w) => (
                        <Flex vertical>
                          <Typography.Text strong>{w.fullName}</Typography.Text>
                          <Typography.Text type="secondary">#{w.playerNumber}</Typography.Text>
                          <Typography.Text code copyable style={{ fontSize: 12 }}>
                            {w.userId}
                          </Typography.Text>
                        </Flex>
                      ),
                    },
                    { title: 'Logos', dataIndex: 'stalls', align: 'right' },
                    { title: 'Points', dataIndex: 'points', align: 'right' },
                    { title: 'Reached', dataIndex: 'reachedAt', render: formatTime },
                    {
                      title: 'Prize',
                      dataIndex: 'prizeName',
                      render: (p: string | null) =>
                        p ?? <Typography.Text type="secondary">None set</Typography.Text>,
                    },
                    {
                      title: 'Status',
                      render: (_, w) => <StatusTag status={w.collectedAt ? 'collected' : w.status} />,
                    },
                    {
                      title: '',
                      align: 'right',
                      render: (_, w) =>
                        canEdit && !w.collectedAt ? (
                          <Flex gap={4} justify="flex-end">
                            {w.status === 'provisional' ? (
                              <Button size="small" type="primary" onClick={() => confirm.mutate(w.rank)}>
                                Confirm
                              </Button>
                            ) : null}
                            <Popconfirm
                              title={`Disqualify ${w.fullName} (#${w.playerNumber})?`}
                              description="Everyone below moves up one rank."
                              onConfirm={() => disqualify.mutate(w.rank)}
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
              )}
            </Card>
          </Col>
        </Row>
        {sessionId ? <ParticipantsCard sessionId={sessionId} live={session?.status === 'open'} /> : null}
      </Flex>
    </>
  );
}
