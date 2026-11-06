/**
 * A5: leaderboard and winners, counted from the scans QuickLook sent. When a session ends, the
 * standings are frozen, the provisional winners are listed and flagged on the participants.
 * Confirm each one, or disqualify (everyone below moves up). Staff see names and QuickLook user
 * IDs (the phone number is found with the ID in QuickLook); the public screens show the QuickLook
 * names. Pick another day or session to see its results.
 */
import { IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Flex, Row, Statistic, Table, Typography } from 'antd';
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
import { PlayerCell, RankBadge, WinnersCard } from './WinnersCard';

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
  const ended = session?.status === 'closed';

  const standings = (
    <Card title={ended ? 'Final standings, top 10' : 'Live top 10'}>
      <Table
        size="middle"
        rowKey="userId"
        pagination={false}
        loading={live.isLoading}
        dataSource={live.data?.top ?? []}
        locale={{ emptyText: ended ? 'Nobody scanned in this session' : 'No scans counted yet' }}
        scroll={{ x: 560 }}
        columns={[
          { title: 'Rank', dataIndex: 'rank', width: 72, render: (r: number) => <RankBadge rank={r} /> },
          {
            title: 'Player',
            render: (_, p) => (
              <PlayerCell name={p.fullName} playerNumber={p.playerNumber} userId={p.userId} />
            ),
          },
          { title: 'Logos', dataIndex: 'stalls', align: 'right', width: 90 },
          { title: 'Points', dataIndex: 'points', align: 'right', width: 90 },
          { title: 'Reached', dataIndex: 'reachedAt', render: formatTime, width: 100 },
        ]}
      />
    </Card>
  );
  const winnersCard = (
    <WinnersCard
      session={session}
      items={items}
      loading={winners.isLoading}
      canEdit={canEdit}
      onConfirm={(rank) => confirm.mutate(rank)}
      onConfirmAll={(list) => confirmAll.mutate(list)}
      confirmingAll={confirmAll.isPending}
      onDisqualify={(rank) => disqualify.mutate(rank)}
    />
  );

  return (
    <>
      <PageHeader
        title="Leaderboard and winners"
        description="Most different logos first, a tie goes to whoever reached the count first. The public screens show the QuickLook names."
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
        <Card>
          <Row gutter={[24, 16]}>
            <Col xs={12} md={6}>
              <Flex vertical gap={8}>
                <Typography.Text type="secondary">Status</Typography.Text>
                <span>{session ? <StatusTag status={session.status} /> : null}</span>
              </Flex>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Players" value={live.data?.players ?? 0} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Scans received" value={live.data?.scans ?? 0} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Last scan"
                value={live.data?.lastScanAt ? formatTime(live.data.lastScanAt) : 'None yet'}
              />
            </Col>
          </Row>
        </Card>
        {ended ? (
          <>
            {winnersCard}
            {standings}
          </>
        ) : (
          <>
            {standings}
            {winnersCard}
          </>
        )}
        {sessionId ? <ParticipantsCard sessionId={sessionId} live={session?.status === 'open'} /> : null}
      </Flex>
    </>
  );
}
