/**
 * A1: live overview of both events. Refreshes every 5 seconds.
 * Staff can pause a game or end the running session from here.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Popconfirm,
  Progress,
  Row,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { GAMES, GAME_LABELS, gamesApi } from '../api/games';
import { huntApi } from '../api/hunt';
import { useAuth } from '../app/auth';
import { hasRole } from '../app/navigation';
import { PageHeader } from '../components/PageHeader';
import { PageLoading } from '../components/PageLoading';
import { useAction } from '../hooks/useAction';
import { formatTime, shortId, timeRange } from '../lib/format';
import { PlayerCell } from './hunt/WinnersCard';

export function OverviewPage() {
  const { role } = useAuth();
  const seesGames = hasRole(role, ['games-admin', 'viewer', 'prize-desk']);
  const seesHunt = hasRole(role, ['hunt-admin', 'viewer', 'prize-desk']);

  return (
    <>
      <PageHeader title="Overview" description="Live view of the Games Event and the Treasure Hunt" />
      <Flex vertical gap={20}>
        {seesGames ? <GamesLive canControl={hasRole(role, ['games-admin'])} /> : null}
        {seesHunt ? <HuntLive /> : null}
      </Flex>
    </>
  );
}

function GamesLive({ canControl }: { canControl: boolean }) {
  const live = useQuery({ queryKey: ['games', 'live'], queryFn: gamesApi.live, refetchInterval: 5000 });
  const pause = useAction(
    (input: { game: (typeof GAMES)[number]; paused: boolean }) =>
      gamesApi.setPaused(input.game, input.paused),
    {
      success: 'Saved',
      refresh: [['games', 'live']],
    },
  );
  const close = useAction((id: string) => gamesApi.closeSession(id), {
    success: 'Session ended',
    refresh: [['games']],
  });
  const release = useAction(gamesApi.releaseLock, {
    success: (r) => (r.released ? 'Screen released' : 'The screen was not reserved'),
    refresh: [['games', 'live']],
  });

  if (!live.data) return <PageLoading />;
  const { session, nextSession, games, screens, latestPlays } = live.data;
  const prizeRows = GAMES.flatMap((game) => games[game]?.prizes ?? []);
  const allocated = prizeRows.reduce((sum, p) => sum + p.allocated, 0);
  const given = prizeRows.reduce((sum, p) => sum + p.given, 0);

  return (
    <Card
      title={
        <Flex align="center" gap={10}>
          Games Event
          {session ? (
            <Badge status="processing" text={`${session.name}, ${timeRange(session)}`} />
          ) : (
            <Tag>No session running</Tag>
          )}
        </Flex>
      }
      extra={
        canControl && session ? (
          <Flex gap={8} wrap>
            {GAMES.map((game) => (
              <Button
                key={game}
                onClick={() => pause.mutate({ game, paused: !games[game]?.paused })}
                loading={pause.isPending}
              >
                {games[game]?.paused ? `Open ${GAME_LABELS[game]}` : `Pause ${GAME_LABELS[game]}`}
              </Button>
            ))}
            <Popconfirm
              title="End this session now?"
              description="Visitors cannot play until the next session."
              onConfirm={() => close.mutate(session.sessionId)}
            >
              <Button danger>End session</Button>
            </Popconfirm>
          </Flex>
        ) : null
      }
    >
      {!session ? (
        <Empty
          description={
            nextSession
              ? `Next session ${nextSession.name} starts at ${formatTime(nextSession.startsAt)}`
              : 'No upcoming session'
          }
        />
      ) : (
        <Flex vertical gap={20}>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Plays this session" value={session.plays} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Prizes given" value={given} suffix={`/ ${allocated}`} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="Screens online"
                value={screens.filter((s) => s.connections > 0).length}
                suffix={`/ ${screens.length}`}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Paused games" value={GAMES.filter((g) => games[g]?.paused).length} />
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            {GAMES.map((game) => (
              <Col xs={24} lg={12} key={game}>
                <Typography.Text strong>{GAME_LABELS[game]}: prizes left</Typography.Text>
                <Flex vertical gap={8} style={{ marginTop: 10 }}>
                  {(games[game]?.prizes ?? []).map((p) => (
                    <div key={p.prizeId}>
                      <Flex justify="space-between">
                        <Typography.Text>
                          {p.name}{' '}
                          {p.isMainPrize ? (
                            <Tag bordered={false} color="gold">
                              Main
                            </Tag>
                          ) : null}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {p.remaining} of {p.allocated} left
                        </Typography.Text>
                      </Flex>
                      <Progress
                        percent={p.allocated ? Math.round((p.given / p.allocated) * 100) : 0}
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  ))}
                </Flex>
              </Col>
            ))}
          </Row>
          <Table
            size="small"
            rowKey="screenId"
            pagination={false}
            dataSource={screens}
            title={() => <Typography.Text strong>TV screens</Typography.Text>}
            columns={[
              { title: 'Screen', dataIndex: 'name' },
              {
                title: 'Shows',
                dataIndex: 'games',
                render: (g: (typeof GAMES)[number][]) => g.map((x) => GAME_LABELS[x]).join(', '),
              },
              {
                title: 'Status',
                render: (_, s) =>
                  s.connections === 0 ? (
                    <Badge status="default" text="Offline" />
                  ) : s.state === 'playing' ? (
                    <Badge status="processing" text="Someone is playing" />
                  ) : (
                    <Badge status="success" text="Online, waiting" />
                  ),
              },
              {
                title: '',
                align: 'right',
                render: (_, s) =>
                  canControl && s.state === 'playing' ? (
                    <Popconfirm
                      title="Free this screen?"
                      description="Use this only if the player walked away. A visitor who has not started yet can scan again."
                      onConfirm={() => release.mutate(s.screenId)}
                    >
                      <Button size="small">Release</Button>
                    </Popconfirm>
                  ) : null,
              },
            ]}
            scroll={{ x: 600 }}
          />
          <Table
            size="small"
            rowKey="entryId"
            pagination={false}
            dataSource={latestPlays}
            title={() => <Typography.Text strong>Latest plays</Typography.Text>}
            columns={[
              { title: 'Time', dataIndex: 'playedAt', render: formatTime, width: 80 },
              { title: 'Game', dataIndex: 'game', render: (g: (typeof GAMES)[number]) => GAME_LABELS[g] },
              { title: 'Player', dataIndex: 'userId', render: shortId },
              {
                title: 'Result',
                dataIndex: 'prizeName',
                render: (name: string | null) =>
                  name ?? <Typography.Text type="secondary">No prize</Typography.Text>,
              },
              { title: 'Reference', dataIndex: 'reference' },
            ]}
            scroll={{ x: 600 }}
          />
        </Flex>
      )}
    </Card>
  );
}

function HuntLive() {
  const sessions = useQuery({ queryKey: ['hunt', 'sessions'], queryFn: () => huntApi.sessions() });
  const current = sessions.data?.items.find((s) => s.status === 'open');
  const live = useQuery({
    queryKey: ['hunt', 'live', current?.sessionId],
    queryFn: () => huntApi.live(current?.sessionId ?? ''),
    enabled: Boolean(current),
    refetchInterval: 5000,
  });

  return (
    <Card
      title={
        <Flex align="center" gap={10}>
          Treasure Hunt
          {current ? (
            <Badge status="processing" text={`${current.name}, ${timeRange(current)}`} />
          ) : (
            <Tag>No session running</Tag>
          )}
        </Flex>
      }
    >
      {!current ? (
        <Empty description="No hunt session is running" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}>
            <Statistic title="Players" value={live.data?.players ?? 0} />
          </Col>
          <Col xs={24} md={18}>
            <Table
              size="small"
              rowKey="userId"
              pagination={false}
              dataSource={live.data?.top ?? []}
              columns={[
                { title: 'Rank', render: (_: unknown, __: unknown, i: number) => i + 1, width: 70 },
                {
                  title: 'Player',
                  render: (_: unknown, p: { fullName: string; playerNumber: number; userId: string }) => (
                    <PlayerCell name={p.fullName} playerNumber={p.playerNumber} userId={p.userId} />
                  ),
                },
                { title: 'Stalls', dataIndex: 'stalls' },
                { title: 'Points', dataIndex: 'points' },
              ]}
            />
          </Col>
        </Row>
      )}
    </Card>
  );
}
