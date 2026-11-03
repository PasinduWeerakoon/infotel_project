/**
 * Plays and reports: every play of a session, with a CSV export for LKDR.
 * Opaque QuickLook IDs only. Names are never stored.
 */
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Flex, Input, Table, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { GAME_LABELS, type Game, gamesApi } from '../../api/games';
import { PageHeader } from '../../components/PageHeader';
import { SessionPicker, defaultSessionId } from '../../components/SessionPicker';
import { formatTime, shortId } from '../../lib/format';

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

  const rows = useMemo(() => {
    const term = search.trim().toUpperCase();
    return (plays.data?.items ?? []).filter(
      (p) => !term || p.reference.includes(term) || p.prize.toUpperCase().includes(term),
    );
  }, [plays.data, search]);
  const won = rows.filter((r) => r.prize).length;

  return (
    <>
      <PageHeader
        title="Plays and reports"
        description="Every play of a session. The export has opaque QuickLook IDs only."
        extra={
          sessionId ? (
            <Button icon={<IconDownload size={16} />} href={gamesApi.playsCsvUrl(sessionId)}>
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
            placeholder="Find a reference or prize"
            allowClear
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <Typography.Text type="secondary">
            {rows.length} plays, {won} prizes
          </Typography.Text>
        </Flex>
        <Table
          rowKey={(r) => `${r.playedAt}-${r.userId}`}
          size="middle"
          loading={plays.isLoading}
          dataSource={rows}
          scroll={{ x: 640 }}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          columns={[
            { title: 'Time', dataIndex: 'playedAt', render: formatTime, width: 90 },
            { title: 'Game', dataIndex: 'game', render: (g: Game) => GAME_LABELS[g] },
            { title: 'Player', dataIndex: 'userId', render: shortId },
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
          ]}
        />
      </Card>
    </>
  );
}
