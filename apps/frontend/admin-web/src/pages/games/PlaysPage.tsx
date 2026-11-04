/**
 * Plays and reports: every play of a session with the player's name, masked phone, prize,
 * reference and collection status, and the same as a CSV export for LKDR.
 */
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Input, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { GAME_LABELS, type Game, type PlayRow, gamesApi } from '../../api/games';
import { PageHeader } from '../../components/PageHeader';
import { SessionPicker, defaultSessionId } from '../../components/SessionPicker';
import { useAction } from '../../hooks/useAction';
import { formatDateTime, formatTime } from '../../lib/format';

const matches = (p: PlayRow, term: string) =>
  [p.reference, p.prize, p.name, p.phone, p.userId].some((v) => v.toLowerCase().includes(term));

export function PlaysPage() {
  const sessions = useQuery({ queryKey: ['games', 'sessions'], queryFn: () => gamesApi.sessions() });
  const [sessionId, setSessionId] = useState<string>();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!sessionId && sessions.data) setSessionId(defaultSessionId(sessions.data.items));
  }, [sessions.data, sessionId]);

  const plays = useQuery({
    queryKey: ['games', 'plays', sessionId],
    queryFn: () => gamesApi.plays(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
  const session = sessions.data?.items.find((s) => s.sessionId === sessionId);
  const exportCsv = useAction(
    (id: string) => gamesApi.downloadPlaysCsv(id, `plays-${session?.date ?? ''}-${session?.name ?? id}.csv`),
    { success: 'CSV downloaded' },
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (plays.data?.items ?? []).filter((p) => !term || matches(p, term));
  }, [plays.data, search]);
  const won = rows.filter((r) => r.prize).length;
  const collected = rows.filter((r) => r.collectedAt).length;

  return (
    <>
      <PageHeader
        title="Plays and reports"
        description="Every play of a session. Phone numbers are masked, here and in the export."
        extra={
          sessionId ? (
            <Button
              icon={<IconDownload size={16} />}
              loading={exportCsv.isPending}
              onClick={() => exportCsv.mutate(sessionId)}
            >
              Export CSV
            </Button>
          ) : null
        }
      />
      <Card>
        <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
          <SessionPicker
            sessions={sessions.data?.items ?? []}
            value={sessionId}
            onChange={setSessionId}
            loading={sessions.isLoading}
          />
          <Input.Search
            placeholder="Name, phone, reference or prize"
            allowClear
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <Typography.Text type="secondary">
            {rows.length} plays, {won} prizes, {collected} collected
          </Typography.Text>
        </Flex>
        <Table
          rowKey={(r) => r.reference || `${r.playedAt}-${r.userId}`}
          size="middle"
          loading={plays.isLoading}
          dataSource={rows}
          scroll={{ x: 960 }}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          columns={[
            { title: 'Time', dataIndex: 'playedAt', render: formatTime, width: 80 },
            { title: 'Game', dataIndex: 'game', render: (g: Game) => GAME_LABELS[g], width: 130 },
            {
              title: 'Player',
              render: (_, p) => (
                <Flex vertical>
                  <Typography.Text strong>{p.name || 'No name'}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {p.phone}
                  </Typography.Text>
                </Flex>
              ),
            },
            {
              title: 'Prize',
              dataIndex: 'prize',
              render: (p: string) => p || <Typography.Text type="secondary">No prize</Typography.Text>,
            },
            {
              title: 'Reference',
              dataIndex: 'reference',
              render: (r: string) => (r ? <Typography.Text code>{r}</Typography.Text> : null),
            },
            {
              title: 'Collected',
              render: (_, p) =>
                !p.reference ? null : p.collectedAt ? (
                  <Flex vertical>
                    <Tag color="green" bordered={false} style={{ alignSelf: 'flex-start' }}>
                      Collected
                    </Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(p.collectedAt)} by {p.collectedBy}
                    </Typography.Text>
                  </Flex>
                ) : (
                  <Tag bordered={false}>Not yet</Tag>
                ),
            },
          ]}
        />
      </Card>
    </>
  );
}
