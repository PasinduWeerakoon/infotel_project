/**
 * Anti-cheat pieces shared by Plays and reports and the prize desk: the check tags of a play
 * (Duplicate, Not verified, prize taken back), every play in the event by the same person, and the
 * Reclaim prize button (the prize goes back to the session's pool).
 */
import { Button, Flex, Popconfirm, Table, Tag, Typography } from 'antd';
import { GAME_LABELS, type PersonPlay, type VoidReason, gamesApi } from '../../api/games';
import { useAction } from '../../hooks/useAction';
import { formatDate, formatTime } from '../../lib/format';

/** Light red row for a person who played more than once in the event */
export const duplicateRowClass = (plays: number) => (plays > 1 ? 'play-repeat' : '');

const VOID_LABELS: Record<VoidReason, string> = {
  duplicate: 'Phone already used, prize taken back',
  reclaimed: 'Prize reclaimed',
};

/** Duplicate (with the number of plays), Not verified with phone number, and a prize taken back */
export function PlayTags(props: { plays?: number; phoneMissing: boolean; voided: VoidReason | '' | null }) {
  const { plays = 1, phoneMissing, voided } = props;
  if (plays <= 1 && !phoneMissing && !voided) return null;
  return (
    <Flex gap={4} wrap>
      {plays > 1 ? (
        <Tag color="red" bordered={false}>
          Duplicate · {plays} plays
        </Tag>
      ) : null}
      {phoneMissing ? (
        <Tag color="blue" bordered={false}>
          Not verified with phone number
        </Tag>
      ) : null}
      {voided ? <Tag bordered={false}>{VOID_LABELS[voided]}</Tag> : null}
    </Flex>
  );
}

/** Takes the prize back from a duplicate play. The prize goes back to the session's pool. */
export function ReclaimButton(props: {
  entryId: string;
  onDone: () => void;
  size?: 'small' | 'middle' | 'large';
}) {
  const reclaim = useAction((entryId: string) => gamesApi.reclaim(entryId), {
    success: 'Prize reclaimed. It went back to the session',
    onSuccess: props.onDone,
  });
  return (
    <Popconfirm
      title="Reclaim this prize?"
      description="It will not be given for this play and goes back to the session's prizes."
      okText="Reclaim prize"
      okButtonProps={{ danger: true }}
      onConfirm={() => reclaim.mutate(props.entryId)}
    >
      <Button danger size={props.size ?? 'middle'} loading={reclaim.isPending}>
        Reclaim prize
      </Button>
    </Popconfirm>
  );
}

/** Session, day and times of a play, for example "Session 2 · Fri 6 Nov 2026 · 13:00 to 16:59" */
function SessionCell({ play }: { play: PersonPlay }) {
  return (
    <Flex vertical>
      <Typography.Text strong>{play.session?.name ?? 'Session'}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {play.date ? formatDate(play.date) : ''}
        {play.session ? ` · ${formatTime(play.session.startsAt)} to ${formatTime(play.session.endsAt)}` : ''}
      </Typography.Text>
    </Flex>
  );
}

/**
 * Every play in the event by one person: session and times, scan and play time, game, name and
 * phone, prize, reference and whether it was collected. `current` is highlighted.
 */
export function PersonPlaysTable(props: { plays: PersonPlay[]; current?: string; loading?: boolean }) {
  return (
    <Table
      rowKey="entryId"
      size="small"
      loading={props.loading}
      dataSource={props.plays}
      pagination={false}
      scroll={{ x: 900 }}
      rowClassName={(p) => (p.entryId === props.current ? 'play-current' : 'play-repeat')}
      columns={[
        { title: 'Session', render: (_, p) => <SessionCell play={p} /> },
        {
          title: 'Scanned / played',
          render: (_, p) => (
            <Flex vertical>
              <span>Scan {formatTime(p.scannedAt)}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Played {formatTime(p.playedAt)} · {GAME_LABELS[p.game]}
              </Typography.Text>
            </Flex>
          ),
        },
        {
          title: 'Player',
          render: (_, p) => (
            <Flex vertical>
              <Typography.Text strong>{p.name || 'No name'}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {p.phone || 'No phone'}
              </Typography.Text>
            </Flex>
          ),
        },
        {
          title: 'Prize',
          render: (_, p) => (
            <Flex vertical gap={2}>
              {p.voided ? (
                <Typography.Text delete type="secondary">
                  {p.prize}
                </Typography.Text>
              ) : (
                <span>{p.prize ?? 'No prize'}</span>
              )}
              {p.reference ? <Typography.Text code>{p.reference}</Typography.Text> : null}
            </Flex>
          ),
        },
        {
          title: 'Status',
          render: (_, p) => (
            <Flex vertical gap={4}>
              {p.collectedAt ? (
                <Tag color="green" bordered={false} style={{ alignSelf: 'flex-start' }}>
                  Collected {formatTime(p.collectedAt)} by {p.collectedBy}
                </Tag>
              ) : p.voided ? null : p.prize ? (
                <Tag bordered={false} style={{ alignSelf: 'flex-start' }}>
                  Not collected
                </Tag>
              ) : null}
              <PlayTags phoneMissing={p.phoneMissing} voided={p.voided} />
            </Flex>
          ),
        },
      ]}
    />
  );
}
