/**
 * Auto-split: enter a day's total per prize for one game, choose how to share it across the
 * day's sessions (by session length, equally, or custom weights), preview, then apply.
 * Shares are rounded with the largest remainder method, so they always add up to the total.
 */
import { Alert, Button, Flex, InputNumber, Modal, Radio, Segmented, Table, Typography } from 'antd';
import { useState } from 'react';
import { GAME_LABELS, type Game, type Prize, gamesApi } from '../../api/games';
import { useAction } from '../../hooks/useAction';
import { formatDate } from '../../lib/format';

type Method = 'length' | 'equal' | 'custom';

interface Props {
  date: string;
  games: Game[];
  prizes: Prize[];
  onClose: () => void;
}

export function AutoSplitModal({ date, games, prizes, onClose }: Props) {
  const [game, setGame] = useState<Game>(games[0] ?? 'spin');
  const [method, setMethod] = useState<Method>('length');
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});

  const input = () => ({
    date,
    game,
    totals: Object.fromEntries(Object.entries(totals).filter(([, n]) => n > 0)),
    method,
    weights: method === 'custom' ? weights : undefined,
  });

  const preview = useAction(() => gamesApi.autoSplit({ ...input(), apply: false }), {
    onSuccess: (result) => {
      if (method === 'custom' && Object.keys(weights).length === 0) {
        setWeights(Object.fromEntries(result.sessions.map((s) => [s.sessionId, 1])));
      }
    },
  });
  const apply = useAction(() => gamesApi.autoSplit({ ...input(), apply: true }), {
    success: 'Allocation applied to every session of the day',
    refresh: [
      ['games', 'allocation'],
      ['games', 'prizes'],
    ],
    onSuccess: onClose,
  });

  const sessions = preview.data?.sessions ?? [];

  return (
    <Modal
      open
      width={760}
      title={`Auto-split ${formatDate(date)}`}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="preview" onClick={() => preview.mutate(undefined)} loading={preview.isPending}>
          Preview
        </Button>,
        <Button
          key="apply"
          type="primary"
          disabled={!preview.data}
          loading={apply.isPending}
          onClick={() => apply.mutate(undefined)}
        >
          Apply to sessions
        </Button>,
      ]}
    >
      <Flex vertical gap={16}>
        <Flex gap={16} wrap align="center">
          <Segmented
            value={game}
            onChange={(value) => setGame(value as Game)}
            options={games.map((g) => ({ value: g, label: GAME_LABELS[g] }))}
          />
          <Radio.Group value={method} onChange={(e) => setMethod(e.target.value)}>
            <Radio.Button value="length">By session length</Radio.Button>
            <Radio.Button value="equal">Equal</Radio.Button>
            <Radio.Button value="custom">Custom weights</Radio.Button>
          </Radio.Group>
        </Flex>

        <Table
          size="small"
          rowKey="prizeId"
          pagination={false}
          dataSource={prizes}
          scroll={{ x: 560 }}
          columns={[
            { title: 'Prize', dataIndex: 'name' },
            {
              title: 'Day total',
              width: 130,
              render: (_, p) => (
                <InputNumber
                  min={0}
                  value={totals[p.prizeId] ?? 0}
                  onChange={(value) => setTotals((t) => ({ ...t, [p.prizeId]: Number(value ?? 0) }))}
                  aria-label={`${p.name} day total`}
                />
              ),
            },
            ...sessions.map((s) => ({
              title: s.name,
              align: 'right' as const,
              render: (_: unknown, p: Prize) => preview.data?.split[p.prizeId]?.[s.sessionId] ?? '',
            })),
          ]}
        />

        {method === 'custom' && sessions.length > 0 ? (
          <Flex gap={12} wrap align="center">
            <Typography.Text type="secondary">Weights</Typography.Text>
            {sessions.map((s) => (
              <InputNumber
                key={s.sessionId}
                addonBefore={s.name}
                min={0}
                value={weights[s.sessionId] ?? 0}
                onChange={(value) => setWeights((w) => ({ ...w, [s.sessionId]: Number(value ?? 0) }))}
              />
            ))}
          </Flex>
        ) : null}

        {!preview.data ? (
          <Alert type="info" showIcon message="Enter the day totals, then press Preview" />
        ) : (
          <Typography.Text type="secondary">
            Applying replaces these prizes' quantities in every {GAME_LABELS[game]} session of the day.
            Quantities already given are kept.
          </Typography.Text>
        )}
      </Flex>
    </Modal>
  );
}
