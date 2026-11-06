/**
 * Plays and reports: every play of a session with the player's name, masked phone, prize,
 * reference and collection status, and the same as a CSV export for LKDR.
 * A person who played more than once in the event (same account, phone or name) is a light red
 * row with a Duplicate tag; Scans shows all their plays with the session times, and staff can
 * reclaim a duplicate's prize. A winner who gave no phone is Not verified.
 */
import { IconDownload } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Checkbox, Drawer, Flex, Input, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { GAME_LABELS, type Game, type PlayRow, gamesApi } from '../../api/games';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { SessionPicker, defaultSessionId } from '../../components/SessionPicker';
import { useAction } from '../../hooks/useAction';
import { formatDateTime, formatTime } from '../../lib/format';
import { PersonPlaysTable, PlayTags, ReclaimButton, duplicateRowClass } from './PlayChecks';

const flagged = (p: PlayRow) => p.plays > 1 || p.phoneMissing || Boolean(p.voided);
/** A duplicate's or a not verified prize that can still be reclaimed: won, not taken back, not collected */
const canReclaim = (p: PlayRow) =>
  (p.plays > 1 || p.phoneMissing) && Boolean(p.reference && p.prize && !p.voided && !p.collectedAt);

const matches = (p: PlayRow, term: string) =>
  [p.reference, p.prize, p.name, p.phone, p.userId].some((v) => v.toLowerCase().includes(term));

export function PlaysPage() {
  const sessions = useQuery({ queryKey: ['games', 'sessions'], queryFn: () => gamesApi.sessions() });
  const [sessionId, setSessionId] = useState<string>();
  const [search, setSearch] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [person, setPerson] = useState<PlayRow | null>(null);
  const { role } = useAuth();
  const canDesk = hasRole(role, ['games-admin', 'prize-desk']);

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
    return (plays.data?.items ?? []).filter(
      (p) => (!term || matches(p, term)) && (!onlyFlagged || flagged(p)),
    );
  }, [plays.data, search, onlyFlagged]);
  const duplicates = rows.filter((r) => r.plays > 1).length;
  const unverified = rows.filter((r) => r.phoneMissing).length;
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
          <Checkbox checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)}>
            Only flagged
          </Checkbox>
          <Typography.Text type="secondary">
            {rows.length} plays, {won} prizes, {collected} collected
          </Typography.Text>
          {duplicates ? <Tag color="red">{duplicates} duplicate</Tag> : null}
          {unverified ? <Tag color="blue">{unverified} not verified</Tag> : null}
        </Flex>
        <Table
          rowKey="entryId"
          rowClassName={(r) => duplicateRowClass(r.plays)}
          size="middle"
          loading={plays.isLoading}
          dataSource={rows}
          scroll={{ x: 1240 }}
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
              render: (_, p) =>
                !p.prize ? (
                  <Typography.Text type="secondary">No prize</Typography.Text>
                ) : p.voided ? (
                  <Typography.Text delete type="secondary">
                    {p.prize}
                  </Typography.Text>
                ) : (
                  p.prize
                ),
            },
            {
              title: 'Checks',
              width: 220,
              render: (_, p) => <PlayTags plays={p.plays} phoneMissing={p.phoneMissing} voided={p.voided} />,
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
                ) : p.voided ? null : (
                  <Tag bordered={false}>Not yet</Tag>
                ),
            },
            {
              title: '',
              align: 'right',
              render: (_, p) => (
                <Flex gap={8} justify="flex-end">
                  <Button size="small" onClick={() => setPerson(p)}>
                    Scans
                  </Button>
                  {canDesk && canReclaim(p) ? (
                    <ReclaimButton size="small" entryId={p.entryId} onDone={() => plays.refetch()} />
                  ) : null}
                </Flex>
              ),
            },
          ]}
        />
      </Card>
      <Drawer
        open={Boolean(person)}
        onClose={() => setPerson(null)}
        width={980}
        title={person ? `All plays in the event: ${person.name || 'No name'}` : ''}
        destroyOnHidden
      >
        {person ? <PersonScans play={person} /> : null}
      </Drawer>
    </>
  );
}

/** Every play in the event by the same person as this row (shared account, phone or name) */
function PersonScans({ play }: { play: PlayRow }) {
  const person = useQuery({
    queryKey: ['games', 'person', play.entryId],
    queryFn: () => gamesApi.personPlays(play.entryId),
  });
  const items = person.data?.items ?? [];
  return (
    <Flex vertical gap={12}>
      <Typography.Text type="secondary">
        {items.length} plays linked by the same QuickLook account, phone number or name. The play you opened
        is highlighted.
      </Typography.Text>
      <PersonPlaysTable plays={items} current={play.entryId} loading={person.isLoading} />
    </Flex>
  );
}
