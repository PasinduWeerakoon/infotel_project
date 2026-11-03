/**
 * A3: prize allocation. How many of each prize each session gives, per game.
 * Edit cells directly, or use auto-split to share daily totals across the day's sessions.
 * During play, prizes are released at secret moments spread across the session.
 */
import { IconWand } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Flex, InputNumber, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { type Allocation, GAME_LABELS, type Game, gamesApi } from '../../api/games';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { SessionPicker, defaultSessionId } from '../../components/SessionPicker';
import { useAction } from '../../hooks/useAction';
import { AutoSplitModal } from './AutoSplitModal';
import { SpreadHint } from './SpreadHint';

type Cells = Record<string, number>; // `${game}|${prizeId}` -> allocated
const cellKey = (game: Game, prizeId: string) => `${game}|${prizeId}`;

export function AllocationPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['games-admin']);
  const sessions = useQuery({ queryKey: ['games', 'sessions'], queryFn: () => gamesApi.sessions() });
  const [sessionId, setSessionId] = useState<string>();
  const [splitOpen, setSplitOpen] = useState(false);

  useEffect(() => {
    if (!sessionId && sessions.data) setSessionId(defaultSessionId(sessions.data.items));
  }, [sessions.data, sessionId]);

  const allocation = useQuery({
    queryKey: ['games', 'allocation', sessionId],
    queryFn: () => gamesApi.allocation(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });

  const [cells, setCells] = useState<Cells>({});
  const stored = useMemo(() => {
    const map: Record<string, Allocation> = {};
    for (const row of allocation.data?.rows ?? []) map[cellKey(row.game, row.prizeId)] = row;
    return map;
  }, [allocation.data]);
  useEffect(() => {
    setCells(Object.fromEntries(Object.entries(stored).map(([key, row]) => [key, row.allocated])));
  }, [stored]);

  const games = allocation.data?.session.games ?? [];
  const prizes = allocation.data?.prizes ?? [];
  const totals = useMemo(() => {
    const sum: Partial<Record<Game, number>> = {};
    for (const [key, value] of Object.entries(cells)) {
      const game = key.split('|')[0] as Game;
      sum[game] = (sum[game] ?? 0) + value;
    }
    return sum;
  }, [cells]);
  const changed = Object.entries(cells).filter(([key, value]) => (stored[key]?.allocated ?? 0) !== value);

  const save = useAction(
    () =>
      gamesApi.saveAllocation(
        sessionId ?? '',
        changed.map(([key, allocated]) => {
          const [game, prizeId] = key.split('|') as [Game, string];
          return { game, prizeId, allocated };
        }),
      ),
    {
      success: 'Allocation saved',
      refresh: [
        ['games', 'allocation'],
        ['games', 'prizes'],
      ],
    },
  );

  /** Event stock minus every session's allocation, including unsaved edits on this page. Never below 0 */
  const freeOf = (p: (typeof prizes)[number]) => {
    const editedHere = games.reduce((sum, game) => {
      const key = cellKey(game, p.prizeId);
      return sum + (cells[key] ?? 0) - (stored[key]?.allocated ?? 0);
    }, 0);
    return Math.max(0, (p.available ?? p.stock) - editedHere);
  };

  const columns = [
    {
      title: 'Prize',
      render: (_: unknown, p: (typeof prizes)[number]) => (
        <Flex gap={8} align="center">
          <Typography.Text strong>{p.name}</Typography.Text>
          {p.isMainPrize ? (
            <Tag color="gold" bordered={false}>
              Main
            </Tag>
          ) : null}
        </Flex>
      ),
    },
    ...games.map((game) => ({
      title: GAME_LABELS[game],
      width: 180,
      render: (_: unknown, p: (typeof prizes)[number]) => {
        const key = cellKey(game, p.prizeId);
        const given = stored[key]?.given ?? 0;
        return (
          <Flex vertical gap={2}>
            <InputNumber
              min={given}
              max={(cells[key] ?? 0) + freeOf(p)}
              value={cells[key] ?? 0}
              disabled={!canEdit}
              onChange={(value) => setCells((c) => ({ ...c, [key]: Number(value ?? 0) }))}
              style={{ width: 120 }}
              aria-label={`${p.name} for ${GAME_LABELS[game]}`}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {given} given, {(cells[key] ?? 0) - given} left
            </Typography.Text>
          </Flex>
        );
      },
    })),
    {
      title: 'Free to allocate',
      align: 'right' as const,
      width: 170,
      render: (_: unknown, p: (typeof prizes)[number]) => {
        const free = freeOf(p);
        return (
          <Flex vertical gap={2} align="flex-end">
            <Typography.Text strong type={free === 0 ? 'secondary' : undefined}>
              {free}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              of {p.stock} in stock, {p.given ?? 0} given
            </Typography.Text>
          </Flex>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Prize allocation"
        description="How many of each prize each session gives, per game. The total can never exceed the stock."
        extra={
          canEdit && allocation.data ? (
            <>
              <Button icon={<IconWand size={16} />} onClick={() => setSplitOpen(true)}>
                Auto-split a day
              </Button>
              <Button
                type="primary"
                disabled={changed.length === 0}
                loading={save.isPending}
                onClick={() => save.mutate(undefined)}
              >
                Save {changed.length ? `(${changed.length})` : ''}
              </Button>
            </>
          ) : null
        }
      />
      <Card>
        <Flex vertical gap={16}>
          <SessionPicker
            sessions={sessions.data?.items ?? []}
            value={sessionId}
            onChange={setSessionId}
            loading={sessions.isLoading}
          />
          {!sessionId && !sessions.isLoading ? <Empty description="Create a session first" /> : null}
          {prizes.length === 0 && allocation.data ? (
            <Alert type="info" showIcon message="Add prizes to the catalogue first" />
          ) : null}
          {allocation.data && prizes.length > 0 ? (
            <SpreadHint session={allocation.data.session} totals={totals} />
          ) : null}
          {allocation.data && prizes.length > 0 ? (
            <Table
              rowKey="prizeId"
              dataSource={prizes}
              columns={columns}
              pagination={false}
              loading={allocation.isFetching}
              scroll={{ x: 640 }}
            />
          ) : null}
        </Flex>
      </Card>
      {splitOpen && allocation.data ? (
        <AutoSplitModal
          date={allocation.data.session.date}
          games={games}
          prizes={prizes}
          onClose={() => setSplitOpen(false)}
        />
      ) : null}
    </>
  );
}
