/**
 * A2: Games Event sessions. Visitors can play once per session, either game.
 * Sessions open and close on time; staff can open early or end early.
 */
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Flex,
  Form,
  Input,
  Popconfirm,
  Table,
  TimePicker,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  GAMES,
  GAME_LABELS,
  type Game,
  type GameSession,
  type SessionInput,
  gamesApi,
} from '../../api/games';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useAction } from '../../hooks/useAction';
import { colombo, formatDate, timeRange } from '../../lib/format';

interface FormValues {
  name: string;
  date: dayjs.Dayjs;
  time: [dayjs.Dayjs, dayjs.Dayjs];
  games: Game[];
}

export function SessionsPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['games-admin']);
  const sessions = useQuery({ queryKey: ['games', 'sessions'], queryFn: () => gamesApi.sessions() });
  const [editing, setEditing] = useState<GameSession | 'new' | null>(null);
  const refresh = [['games']];

  const open = useAction(gamesApi.openSession, { success: 'Session opened', refresh });
  const close = useAction(gamesApi.closeSession, { success: 'Session ended', refresh });
  const remove = useAction(gamesApi.deleteSession, { success: 'Session deleted', refresh });

  return (
    <>
      <PageHeader
        title="Sessions"
        description="When visitors can play. One play per visitor per session, Spin the Wheel or Lucky Dip."
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
        dataSource={sessions.data?.items ?? []}
        pagination={false}
        scroll={{ x: 760 }}
        columns={[
          { title: 'Day', dataIndex: 'date', render: formatDate },
          { title: 'Session', dataIndex: 'name' },
          { title: 'Time', render: (_, s) => timeRange(s) },
          {
            title: 'Games',
            dataIndex: 'games',
            render: (games: Game[]) => games.map((g) => GAME_LABELS[g]).join(', '),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: GameSession['status']) => <StatusTag status={status} />,
          },
          { title: 'Plays', dataIndex: 'plays', align: 'right' },
          {
            title: '',
            align: 'right',
            render: (_, s) =>
              canEdit ? (
                <Flex gap={4} justify="flex-end">
                  {s.status === 'scheduled' ? (
                    <Button size="small" onClick={() => open.mutate(s.sessionId)}>
                      Open now
                    </Button>
                  ) : null}
                  {s.status === 'open' ? (
                    <Popconfirm title="End this session now?" onConfirm={() => close.mutate(s.sessionId)}>
                      <Button size="small" danger>
                        End now
                      </Button>
                    </Popconfirm>
                  ) : null}
                  <Button size="small" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  {!s.plays ? (
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
      <SessionDrawer session={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SessionDrawer({ session, onClose }: { session: GameSession | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const isNew = session === 'new';
  const save = useAction(
    (input: SessionInput) =>
      isNew || !session ? gamesApi.createSession(input) : gamesApi.updateSession(session.sessionId, input),
    { success: 'Session saved. Allocate prizes to it next.', refresh: [['games']], onSuccess: onClose },
  );

  const initial: Partial<FormValues> =
    session && session !== 'new'
      ? {
          name: session.name,
          date: dayjs(session.date),
          time: [
            dayjs(colombo(session.startsAt).format('HH:mm'), 'HH:mm'),
            dayjs(colombo(session.endsAt).format('HH:mm'), 'HH:mm'),
          ],
          games: session.games,
        }
      : { games: GAMES };

  const submit = (values: FormValues) =>
    save.mutate({
      name: values.name,
      date: values.date.format('YYYY-MM-DD'),
      start: values.time[0].format('HH:mm'),
      end: values.time[1].format('HH:mm'),
      games: values.games,
    });

  return (
    <Drawer
      title={isNew ? 'New session' : 'Edit session'}
      open={session !== null}
      onClose={onClose}
      width={420}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={() => form.submit()} loading={save.isPending}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" initialValues={initial} onFinish={submit} requiredMark={false}>
        <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Give the session a name' }]}>
          <Input placeholder="Session 1" />
        </Form.Item>
        <Form.Item label="Day" name="date" rules={[{ required: true, message: 'Choose the day' }]}>
          <DatePicker style={{ width: '100%' }} format="ddd D MMM YYYY" />
        </Form.Item>
        <Form.Item
          label="Time (Colombo)"
          name="time"
          rules={[{ required: true, message: 'Choose start and end' }]}
        >
          <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label="Games"
          name="games"
          rules={[{ required: true, message: 'Choose at least one game' }]}
        >
          <Checkbox.Group options={GAMES.map((g) => ({ value: g, label: GAME_LABELS[g] }))} />
        </Form.Item>
        <Typography.Paragraph type="secondary">
          Sessions on the same day cannot overlap. They open and close automatically at these times.
        </Typography.Paragraph>
      </Form>
    </Drawer>
  );
}
