/**
 * A4: logos and stall screens.
 * Logos are uploaded here and loaded by the screens and phones through the API, so they can be
 * changed at any time without a new release. Each stall screen gets a secret link (shown once).
 */
import { IconCopy, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Table,
  Tabs,
  Typography,
} from 'antd';
import { useState } from 'react';
import { GAMES, GAME_LABELS, type Game, type Screen, gamesApi } from '../../api/games';
import { type Logo, platformApi } from '../../api/platform';
import { ImageUpload } from '../../components/ImageUpload';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { formatDateTime } from '../../lib/format';

const SCREEN_WEB_URL = import.meta.env.VITE_SCREEN_WEB_URL ?? 'http://localhost:5176';
const LOGO_HINTS: Record<string, string> = {
  spin: 'Stall screen and phones (Spin the Wheel)',
  'lucky-dip': 'Stall screen and phones (Lucky Dip)',
  event: 'Top of every screen',
  hunt: 'Treasure Hunt leaderboard screen',
};

export function LogosScreensPage() {
  return (
    <>
      <PageHeader title="Logos and screens" description="Changeable logos, and the screens that show them" />
      <Tabs
        items={[
          { key: 'logos', label: 'Logos', children: <LogosTab /> },
          { key: 'screens', label: 'Stall screens', children: <ScreensTab /> },
        ]}
      />
    </>
  );
}

function LogosTab() {
  const logos = useQuery({ queryKey: ['logos'], queryFn: platformApi.logos });
  const save = useAction((logo: Logo) => platformApi.saveLogo(logo.logoId, logo), {
    success: 'Logo updated',
    refresh: [['logos']],
  });
  const items = (logos.data?.items ?? []).filter((l) => l.logoType === 'game' || l.logoType === 'display');

  return (
    <Row gutter={[16, 16]}>
      {items.map((logo) => (
        <Col xs={24} sm={12} xl={6} key={logo.logoId}>
          {/* Equal height cards; the footer sits on the same line in every card */}
          <Card style={{ height: '100%' }} styles={{ body: { height: '100%' } }}>
            <Flex vertical gap={12} style={{ height: '100%' }}>
              <ImageUpload
                purpose="logo"
                size={120}
                imageUrl={logo.imageUrl}
                onUploaded={(key) => save.mutate({ ...logo, imageKey: key })}
              />
              <div>
                <Typography.Text strong>{logo.name}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                  {LOGO_HINTS[logo.targetId ?? ''] ?? logo.logoType}
                </Typography.Paragraph>
              </div>
              <Flex
                vertical
                gap={4}
                style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(0, 0, 0, 0.06)' }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {logo.logoType === 'game' ? 'QuickLook logo ID' : 'Shown on'}
                </Typography.Text>
                <Flex align="center" style={{ height: 24 }}>
                  {logo.logoType === 'game' ? (
                    <Typography.Text code copyable style={{ fontSize: 12 }}>
                      {logo.logoId}
                    </Typography.Text>
                  ) : (
                    <Typography.Text style={{ fontSize: 12 }}>Screens only</Typography.Text>
                  )}
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function ScreensTab() {
  const screens = useQuery({
    queryKey: ['games', 'screens'],
    queryFn: gamesApi.screens,
    refetchInterval: 10_000,
  });
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{ screen: Screen; screenKey: string } | null>(null);
  const refresh = [['games', 'screens']];
  const rotate = useAction(gamesApi.rotateScreenKey, { refresh, onSuccess: setIssued });
  const release = useAction(gamesApi.releaseLock, {
    success: (r) => (r.released ? 'Screen released' : 'The screen was not reserved'),
    refresh,
  });
  const remove = useAction(gamesApi.deleteScreen, { success: 'Screen removed', refresh });

  return (
    <>
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          Add screen
        </Button>
      </Flex>
      <Table
        rowKey="screenId"
        loading={screens.isLoading}
        dataSource={screens.data?.items ?? []}
        pagination={false}
        scroll={{ x: 760 }}
        columns={[
          {
            title: 'Screen',
            dataIndex: 'name',
            render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
          },
          {
            title: 'Shows',
            dataIndex: 'games',
            render: (games: Game[]) => games.map((g) => GAME_LABELS[g]).join(', '),
          },
          {
            title: 'Status',
            dataIndex: 'connections',
            render: (n: number) => (
              <Badge status={n > 0 ? 'success' : 'default'} text={n > 0 ? 'Online' : 'Offline'} />
            ),
          },
          { title: 'Last seen', dataIndex: 'lastSeenAt', render: formatDateTime },
          {
            title: '',
            align: 'right',
            render: (_, s) => (
              <Flex gap={4} justify="flex-end">
                <Popconfirm
                  title="Free this screen?"
                  description="A visitor who has not started yet can scan again."
                  onConfirm={() => release.mutate(s.screenId)}
                >
                  <Button size="small">Release</Button>
                </Popconfirm>
                <Popconfirm
                  title="Create a new screen link?"
                  description="The old link stops working."
                  onConfirm={() => rotate.mutate(s.screenId)}
                >
                  <Button size="small">New link</Button>
                </Popconfirm>
                <Popconfirm title={`Remove ${s.name}?`} onConfirm={() => remove.mutate(s.screenId)}>
                  <Button size="small" type="text" danger>
                    Remove
                  </Button>
                </Popconfirm>
              </Flex>
            ),
          },
        ]}
      />
      {creating ? <CreateScreenModal onClose={() => setCreating(false)} onCreated={setIssued} /> : null}
      {issued ? <ScreenLinkModal issued={issued} onClose={() => setIssued(null)} /> : null}
    </>
  );
}

function CreateScreenModal({
  onClose,
  onCreated,
}: { onClose: () => void; onCreated: (r: { screen: Screen; screenKey: string }) => void }) {
  const [form] = Form.useForm<{ name: string; games: Game[] }>();
  const create = useAction(gamesApi.createScreen, {
    refresh: [['games', 'screens']],
    onSuccess: (result) => {
      onClose();
      onCreated(result);
    },
  });
  return (
    <Modal
      open
      title="Add stall screen"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Create"
      confirmLoading={create.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ games: ['spin'] }}
        onFinish={(v) => create.mutate(v)}
      >
        <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name the screen' }]}>
          <Input placeholder="Spin the Wheel stall" />
        </Form.Item>
        <Form.Item
          label="Shows"
          name="games"
          rules={[{ required: true, message: 'Choose a game' }]}
          extra="One player at a time per screen."
        >
          <Checkbox.Group options={GAMES.map((g) => ({ value: g, label: GAME_LABELS[g] }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ScreenLinkModal({
  issued,
  onClose,
}: { issued: { screen: Screen; screenKey: string }; onClose: () => void }) {
  const { message } = App.useApp();
  const link = `${SCREEN_WEB_URL}/stall?key=${encodeURIComponent(issued.screenKey)}`;
  return (
    <Modal
      open
      title={`Link for ${issued.screen.name}`}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <Typography.Paragraph>
        Open this link once on the stall TV. It is shown only now. If it is lost, create a new link.
      </Typography.Paragraph>
      <Flex gap={8}>
        <Input value={link} readOnly />
        <Button
          icon={<IconCopy size={16} />}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            message.success('Link copied');
          }}
        >
          Copy
        </Button>
      </Flex>
    </Modal>
  );
}
