/**
 * Treasure Hunt sessions: time, the QuickLook logos that count, points per stall, number of
 * winners and prizes per rank. While a session runs, its standings are read from QuickLook.
 */
import { IconAlertTriangle, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { type HuntSession, type HuntSessionInput, huntApi } from '../../api/hunt';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { colombo, formatDate, formatTime, timeRange } from '../../lib/format';
import { LogoPicker } from './LogoPicker';

interface FormValues extends Omit<HuntSessionInput, 'date' | 'start' | 'end' | 'logos'> {
  date: dayjs.Dayjs;
  time: [dayjs.Dayjs, dayjs.Dayjs];
  /** New session only: copy the logos of this session */
  logosFrom?: string;
}

export function HuntSessionsPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['hunt-admin']);
  const sessions = useQuery({ queryKey: ['hunt', 'sessions'], queryFn: () => huntApi.sessions() });
  const [editing, setEditing] = useState<HuntSession | 'new' | null>(null);
  const [picking, setPicking] = useState<HuntSession | null>(null);
  const refresh = [['hunt']];
  const sync = useAction(huntApi.sync, { success: 'Read from QuickLook', refresh });
  const items = sessions.data?.items ?? [];
  const start = useAction(huntApi.startSession, { success: 'Session started', refresh });
  const end = useAction(huntApi.endSession, { success: 'Session ended. Standings are frozen.', refresh });
  const remove = useAction(huntApi.deleteSession, { success: 'Session deleted', refresh });

  return (
    <>
      <PageHeader
        title="Treasure Hunt sessions"
        description="A separate event. QuickLook counts the scans of the selected logos, each logo once per visitor. Standings are read from QuickLook about every 15 seconds."
        extra={
          canEdit ? (
            <Button type="primary" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              New session
            </Button>
          ) : null
        }
      />
      <Table
        rowKey="sessionId"
        loading={sessions.isLoading}
        dataSource={items}
        pagination={false}
        scroll={{ x: 1080 }}
        columns={[
          { title: 'Day', dataIndex: 'date', render: formatDate },
          { title: 'Session', dataIndex: 'name' },
          { title: 'Time', render: (_, s) => timeRange(s) },
          {
            title: 'Logos',
            render: (_, s) => (
              <Flex gap={6} align="center">
                {s.logos.length > 0 ? (
                  <Tag bordered={false} color="purple">
                    {s.logos.length}
                  </Tag>
                ) : (
                  <Tag bordered={false} color="orange" icon={<IconAlertTriangle size={12} />}>
                    None
                  </Tag>
                )}
                {canEdit && !s.finalized ? (
                  <Button size="small" type="link" onClick={() => setPicking(s)} style={{ padding: 0 }}>
                    Choose
                  </Button>
                ) : null}
              </Flex>
            ),
          },
          { title: 'Points per stall', dataIndex: 'pointsPerStall', align: 'right' },
          { title: 'Winners', dataIndex: 'winnersCount', align: 'right' },
          { title: 'Players', dataIndex: 'players', align: 'right' },
          {
            title: 'Last read from QuickLook',
            render: (_, s) =>
              s.status === 'scheduled' ? (
                <Typography.Text type="secondary">Not started</Typography.Text>
              ) : s.sync?.error ? (
                <Tooltip title={s.sync.error}>
                  <Tag bordered={false} color="orange">
                    Problem
                  </Tag>
                </Tooltip>
              ) : s.sync?.lastSyncAt ? (
                formatTime(s.sync.lastSyncAt)
              ) : (
                <Typography.Text type="secondary">Waiting</Typography.Text>
              ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: HuntSession['status']) => <StatusTag status={status} />,
          },
          {
            title: '',
            align: 'right',
            render: (_, s) =>
              canEdit ? (
                <Flex gap={4} justify="flex-end">
                  {s.status === 'scheduled' ? (
                    <Button size="small" onClick={() => start.mutate(s.sessionId)}>
                      Start now
                    </Button>
                  ) : null}
                  {s.status === 'open' ? (
                    <Tooltip title="Read the standings from QuickLook now">
                      <Button
                        size="small"
                        icon={<IconRefresh size={14} />}
                        loading={sync.isPending && sync.variables === s.sessionId}
                        onClick={() => sync.mutate(s.sessionId)}
                      />
                    </Tooltip>
                  ) : null}
                  {s.status === 'open' ? (
                    <Popconfirm
                      title="End the hunt now?"
                      description="Standings are frozen and winners are listed."
                      onConfirm={() => end.mutate(s.sessionId)}
                    >
                      <Button size="small" danger>
                        End now
                      </Button>
                    </Popconfirm>
                  ) : null}
                  <Button size="small" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  {s.status === 'scheduled' ? (
                    <Popconfirm title="Delete this session?" onConfirm={() => remove.mutate(s.sessionId)}>
                      <Button size="small" type="text" danger>
                        Delete
                      </Button>
                    </Popconfirm>
                  ) : null}
                </Flex>
              ) : null,
          },
        ]}
      />
      <HuntSessionDrawer session={editing} sessions={items} onClose={() => setEditing(null)} />
      {picking ? <LogoPicker session={picking} sessions={items} onClose={() => setPicking(null)} /> : null}
    </>
  );
}

function HuntSessionDrawer({
  session,
  sessions,
  onClose,
}: { session: HuntSession | 'new' | null; sessions: HuntSession[]; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const existing = session && session !== 'new' ? session : null;
  const save = useAction(
    (input: HuntSessionInput) =>
      existing ? huntApi.updateSession(existing.sessionId, input) : huntApi.createSession(input),
    { success: 'Session saved', refresh: [['hunt']], onSuccess: onClose },
  );

  const initial: Partial<FormValues> = existing
    ? {
        ...existing,
        date: dayjs(existing.date),
        time: [
          dayjs(colombo(existing.startsAt).format('HH:mm'), 'HH:mm'),
          dayjs(colombo(existing.endsAt).format('HH:mm'), 'HH:mm'),
        ],
      }
    : {
        pointsPerStall: 10,
        winnersCount: 3,
        allowPreviousWinners: false,
        prizes: [
          { rank: 1, prizeName: '' },
          { rank: 2, prizeName: '' },
          { rank: 3, prizeName: '' },
        ],
      };

  const withLogos = sessions.filter((s) => s.logos.length > 0);
  const latestWithLogos = [...withLogos].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
  if (!existing) initial.logosFrom = latestWithLogos?.sessionId;

  const submit = ({ date, time, prizes, logosFrom, ...rest }: FormValues) =>
    save.mutate({
      ...rest,
      ...(existing ? {} : { logos: withLogos.find((s) => s.sessionId === logosFrom)?.logos ?? [] }),
      date: date.format('YYYY-MM-DD'),
      start: time[0].format('HH:mm'),
      end: time[1].format('HH:mm'),
      prizes: (prizes ?? [])
        .filter((p) => p.prizeName?.trim())
        .map((p, index) => ({ rank: index + 1, prizeName: p.prizeName.trim() })),
    });

  return (
    <Drawer
      title={existing ? 'Edit hunt session' : 'New hunt session'}
      open={session !== null}
      onClose={onClose}
      width={460}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={() => form.submit()} loading={save.isPending}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial} onFinish={submit}>
        <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Give the session a name' }]}>
          <Input placeholder="Morning hunt" />
        </Form.Item>
        <Form.Item label="Day" name="date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} format="ddd D MMM YYYY" />
        </Form.Item>
        <Form.Item label="Time (Colombo)" name="time" rules={[{ required: true }]}>
          <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item label="Points per new stall" name="pointsPerStall" style={{ flex: 1 }}>
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Winners" name="winnersCount" style={{ flex: 1 }}>
            <InputNumber min={1} max={50} style={{ width: '100%' }} />
          </Form.Item>
        </Flex>
        <Typography.Text strong>Prizes by rank</Typography.Text>
        <Form.List name="prizes">
          {(fields, { add, remove }) => (
            <Flex vertical gap={8} style={{ marginTop: 8, marginBottom: 16 }}>
              {fields.map((field, index) => (
                <Flex key={field.key} gap={8} align="center">
                  <Typography.Text type="secondary" style={{ width: 52 }}>
                    Rank {index + 1}
                  </Typography.Text>
                  <Form.Item name={[field.name, 'prizeName']} style={{ flex: 1, margin: 0 }}>
                    <Input placeholder="Prize name" />
                  </Form.Item>
                  <Button
                    type="text"
                    icon={<IconTrash size={16} />}
                    onClick={() => remove(field.name)}
                    aria-label="Remove rank"
                  />
                </Flex>
              ))}
              <Button onClick={() => add({ rank: fields.length + 1, prizeName: '' })}>Add rank</Button>
            </Flex>
          )}
        </Form.List>
        {!existing ? (
          <Form.Item
            label="Start with the logos of"
            name="logosFrom"
            extra="You can change the logos later with Choose in the Logos column."
          >
            <Select
              allowClear
              placeholder="No logos yet"
              options={withLogos.map((s) => ({
                value: s.sessionId,
                label: `${formatDate(s.date)}, ${s.name} (${s.logos.length} logos)`,
              }))}
            />
          </Form.Item>
        ) : null}
        <Form.Item
          label="Previous winners can win again"
          name="allowPreviousWinners"
          valuePropName="checked"
          extra="When off, someone who won in an earlier session today is skipped."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
