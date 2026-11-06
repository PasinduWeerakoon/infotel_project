/**
 * A6: prize desk for both events. Find a Games prize by its reference ID or the name the player
 * typed on the phone (with their phone number). Find a Treasure Hunt winner by player number,
 * name or QuickLook user ID (the phone number is found with the ID in QuickLook). A prize can be
 * collected once. A Games prize lists every other play in the event by the same person (account,
 * phone or name) underneath, warns when they already collected a prize, and lets staff reclaim it.
 * A prize taken back cannot be collected; a winner who gave no phone is tagged Not verified.
 */
import { IconGift, IconSearch, IconUserCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Image,
  Input,
  Popconfirm,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { GAME_LABELS, type ReferenceView, gamesApi } from '../api/games';
import { type Winner, huntApi } from '../api/hunt';
import { platformApi } from '../api/platform';
import { useAuth } from '../app/auth';
import { hasRole } from '../app/navigation';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { useAction } from '../hooks/useAction';
import { formatDateTime, formatTime } from '../lib/format';
import { PersonPlaysTable, PlayTags, ReclaimButton } from './games/PlayChecks';
import { PlayerCell } from './hunt/WinnersCard';

export function PrizeDeskPage() {
  const { role } = useAuth();
  const tabs = [
    ...(hasRole(role, ['games-admin', 'prize-desk'])
      ? [{ key: 'games', label: 'Games prizes', children: <GamesDesk /> }]
      : []),
    ...(hasRole(role, ['hunt-admin', 'prize-desk'])
      ? [{ key: 'hunt', label: 'Treasure Hunt winners', children: <HuntDesk /> }]
      : []),
  ];
  return (
    <>
      <PageHeader
        title="Prize desk"
        description="Check the visitor's phone, then hand over the prize. Each prize can be collected once."
      />
      <Tabs items={tabs} />
    </>
  );
}

/** Name from QuickLook, fetched on request and kept only on screen. */
function WinnerName({ userId }: { userId: string }) {
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  if (name !== undefined) {
    return (
      <Flex gap={8} align="center">
        <Typography.Text strong>{name ?? 'Not available'}</Typography.Text>
        <Tag bordered={false}>from QuickLook, not stored</Tag>
      </Flex>
    );
  }
  return (
    <Button
      size="small"
      icon={<IconUserCheck size={15} />}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          setName((await platformApi.displayName(userId)).displayName);
        } catch {
          setName(null);
        } finally {
          setLoading(false);
        }
      }}
    >
      Show name
    </Button>
  );
}

function GamesDesk() {
  const [input, setInput] = useState('');
  const [found, setFound] = useState<ReferenceView | null>(null);
  const [matches, setMatches] = useState<ReferenceView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const collect = useAction((reference: string) => gamesApi.collect(reference), {
    success: 'Marked as collected',
    onSuccess: (view) => {
      setFound(view);
      setMatches((list) => list.map((r) => (r.reference === view.reference ? view : r)));
    },
  });

  const reload = async (reference: string) => {
    const view = await gamesApi.reference(reference);
    setFound(view);
    setMatches((list) => list.map((r) => (r.reference === view.reference ? view : r)));
  };

  const search = async (value: string) => {
    if (!value.trim()) return;
    setSearching(true);
    setError(null);
    setFound(null);
    setMatches([]);
    try {
      const { items } = await gamesApi.searchReferences(value.trim());
      if (items.length === 0) setError('No prize found for this reference or name');
      else if (items.length === 1) setFound(items[0] ?? null);
      else setMatches(items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <Flex vertical gap={16} style={{ maxWidth: 1040 }}>
      <Input.Search
        size="large"
        placeholder="Reference ID or player name, for example LKD 7Q4K 29 or Nimal"
        enterButton={
          <Button type="primary" icon={<IconSearch size={16} />}>
            Find
          </Button>
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onSearch={search}
        loading={searching}
        autoFocus
      />
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      {matches.length > 0 && !found ? (
        <Table
          rowKey="reference"
          dataSource={matches}
          pagination={false}
          size="middle"
          scroll={{ x: 640 }}
          onRow={(r) => ({ onClick: () => setFound(r), style: { cursor: 'pointer' } })}
          columns={[
            {
              title: 'Player',
              render: (_, r) => (
                <Flex vertical>
                  <Typography.Text strong>{r.player?.name}</Typography.Text>
                  <Typography.Text type="secondary">{r.player?.phone}</Typography.Text>
                </Flex>
              ),
            },
            { title: 'Prize', render: (_, r) => r.prize?.name },
            { title: 'Won at', render: (_, r) => formatDateTime(r.wonAt) },
            {
              title: 'Reference',
              render: (_, r) => <Typography.Text code>{r.reference}</Typography.Text>,
            },
            {
              title: 'Status',
              render: (_, r) => (
                <Flex vertical gap={4}>
                  {r.voided ? null : <StatusTag status={r.collectedAt ? 'collected' : 'pending'} />}
                  <PlayTags plays={r.related.length + 1} phoneMissing={r.phoneMissing} voided={r.voided} />
                </Flex>
              ),
            },
          ]}
        />
      ) : null}
      {found && matches.length > 1 ? (
        <Button type="link" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setFound(null)}>
          Back to {matches.length} matches
        </Button>
      ) : null}
      {found ? (
        <Card>
          <Flex gap={20} wrap>
            {found.prize?.imageUrl ? (
              <Image
                src={found.prize.imageUrl}
                width={120}
                height={120}
                style={{ objectFit: 'contain', borderRadius: 12 }}
                preview={false}
              />
            ) : (
              <Flex
                align="center"
                justify="center"
                style={{ width: 120, height: 120, borderRadius: 12, background: '#fff4d6' }}
              >
                <IconGift size={44} color="#b07f00" stroke={1.4} />
              </Flex>
            )}
            <Flex vertical gap={10} style={{ flex: 1, minWidth: 260 }}>
              <Flex gap={8} align="center">
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {found.prize?.name}
                </Typography.Title>
                {found.voided ? null : <StatusTag status={found.collectedAt ? 'collected' : 'pending'} />}
              </Flex>
              <PlayTags
                plays={found.related.length + 1}
                phoneMissing={found.phoneMissing}
                voided={found.voided}
              />
              <Descriptions
                size="small"
                column={1}
                items={[
                  { label: 'Reference', children: <Typography.Text code>{found.reference}</Typography.Text> },
                  ...(found.player
                    ? [
                        {
                          label: 'Player name',
                          children: <Typography.Text strong>{found.player.name}</Typography.Text>,
                        },
                        { label: 'Phone', children: found.player.phone },
                      ]
                    : []),
                  { label: 'Game', children: GAME_LABELS[found.game] },
                  { label: 'Session', children: found.session?.name ?? '' },
                  { label: 'Won at', children: formatDateTime(found.wonAt) },
                  { label: 'Winner', children: <WinnerName key={found.userId} userId={found.userId} /> },
                ]}
              />
              {found.collectedAt ? (
                <Alert
                  type="info"
                  showIcon
                  message={`Collected at ${formatTime(found.collectedAt)} by ${found.collectedBy}. It cannot be used again.`}
                />
              ) : found.voided ? (
                <Alert type="error" showIcon message="This prize was taken back. Do not hand it over." />
              ) : (
                <Flex vertical gap={10} align="flex-start">
                  <AlreadyCollected related={found.related} />
                  <Flex gap={10} wrap align="center">
                    <Popconfirm
                      title="Hand over the prize and mark it collected?"
                      onConfirm={() => collect.mutate(found.reference)}
                    >
                      <Button type="primary" size="large" loading={collect.isPending}>
                        Mark as collected
                      </Button>
                    </Popconfirm>
                    {found.related.length > 0 || found.phoneMissing ? (
                      <ReclaimButton
                        size="large"
                        entryId={found.entryId}
                        onDone={() => reload(found.reference)}
                      />
                    ) : null}
                  </Flex>
                </Flex>
              )}
            </Flex>
          </Flex>
          {found.related.length > 0 ? (
            <Flex vertical gap={8} style={{ marginTop: 20 }}>
              <Typography.Text strong type="danger">
                Duplicate: {found.related.length} other {found.related.length === 1 ? 'play' : 'plays'} in the
                event by the same person (QuickLook account, phone or name)
              </Typography.Text>
              <PersonPlaysTable plays={found.related} />
            </Flex>
          ) : null}
        </Card>
      ) : null}
    </Flex>
  );
}

/** Warns when the same person already collected another prize in the event */
function AlreadyCollected({ related }: { related: ReferenceView['related'] }) {
  const collected = related.filter((p) => p.collectedAt);
  if (collected.length === 0) return null;
  return (
    <Alert
      type="error"
      showIcon
      message={`This person already collected ${collected.length === 1 ? 'a prize' : `${collected.length} prizes`} in the event`}
      description={collected
        .map((p) => `${p.prize} on ${formatDateTime(p.collectedAt)} by ${p.collectedBy} (${p.reference})`)
        .join('. ')}
    />
  );
}

function HuntDesk() {
  const winners = useQuery({
    queryKey: ['hunt', 'desk'],
    queryFn: () => huntApi.winnersOfDay(),
    refetchInterval: 15_000,
  });
  const [filter, setFilter] = useState('');
  const collect = useAction((w: Winner) => huntApi.collect(w.sessionId, w.rank), {
    success: 'Marked as collected',
    refresh: [['hunt', 'desk']],
  });
  const needle = filter.replace('#', '').trim().toLowerCase();
  const rows = (winners.data?.items ?? []).filter(
    (w) =>
      !needle ||
      String(w.playerNumber) === needle ||
      w.fullName.toLowerCase().includes(needle) ||
      w.userId.toLowerCase().includes(needle),
  );

  return (
    <Flex vertical gap={16}>
      <Input.Search
        placeholder="Player number, name or QuickLook user ID"
        allowClear
        onChange={(e) => setFilter(e.target.value)}
        style={{ maxWidth: 320 }}
      />
      {rows.length === 0 && !winners.isLoading ? (
        <Empty description="No confirmed winners today yet" />
      ) : (
        <Table
          rowKey={(w) => `${w.sessionId}-${w.rank}`}
          loading={winners.isLoading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            {
              title: 'Winner',
              render: (_, w) => (
                <PlayerCell name={w.fullName} playerNumber={w.playerNumber} userId={w.userId} />
              ),
            },
            { title: 'Rank', dataIndex: 'rank' },
            { title: 'Prize', dataIndex: 'prizeName' },
            {
              title: 'Status',
              render: (_, w) => <StatusTag status={w.collectedAt ? 'collected' : 'pending'} />,
            },
            {
              title: '',
              align: 'right',
              render: (_, w) =>
                w.collectedAt ? (
                  <Typography.Text type="secondary">
                    {formatTime(w.collectedAt)} by {w.collectedBy}
                  </Typography.Text>
                ) : (
                  <Popconfirm
                    title={`Hand over to ${w.fullName} (Player #${w.playerNumber})?`}
                    onConfirm={() => collect.mutate(w)}
                  >
                    <Button type="primary" size="small">
                      Mark as collected
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      )}
    </Flex>
  );
}
