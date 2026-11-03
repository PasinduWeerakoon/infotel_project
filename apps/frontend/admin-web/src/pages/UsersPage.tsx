/**
 * A7: admin users and roles (super admin only).
 */
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { type AdminUser, ROLE_LABELS, type Role, platformApi } from '../api/platform';
import { useAuth } from '../app/auth';
import { PageHeader } from '../components/PageHeader';
import { useAction } from '../hooks/useAction';
import { formatDateTime } from '../lib/format';

const ROLES = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const PASSWORD_RULE = {
  pattern: /^(?=.*[A-Za-z])(?=.*\d).{10,}$/,
  message: 'At least 10 characters with a letter and a number',
};

const ROLE_ACCESS: { area: string; roles: Role[] }[] = [
  { area: 'Overview', roles: ['super-admin', 'games-admin', 'hunt-admin', 'prize-desk', 'viewer'] },
  {
    area: 'Games Event: sessions, prizes, allocation, logos, screens',
    roles: ['super-admin', 'games-admin'],
  },
  { area: 'Treasure Hunt: sessions, stalls, winners', roles: ['super-admin', 'hunt-admin'] },
  { area: 'Prize desk', roles: ['super-admin', 'games-admin', 'hunt-admin', 'prize-desk'] },
  { area: 'Read-only views and reports', roles: ['super-admin', 'games-admin', 'hunt-admin', 'viewer'] },
  { area: 'Users and game rules', roles: ['super-admin'] },
];

export function UsersPage() {
  const { username: me } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: platformApi.users });
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const update = useAction(
    (input: { username: string; changes: Parameters<typeof platformApi.updateUser>[1] }) =>
      platformApi.updateUser(input.username, input.changes),
    { success: 'User updated', refresh: [['users']] },
  );

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Each person sees only the parts of the dashboard their role needs."
        extra={
          <Button type="primary" icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />
      <Table
        rowKey="username"
        loading={users.isLoading}
        dataSource={users.data?.items ?? []}
        pagination={false}
        scroll={{ x: 760 }}
        style={{ marginBottom: 24 }}
        columns={[
          {
            title: 'Username',
            dataIndex: 'username',
            render: (u: string) => <Typography.Text strong>{u}</Typography.Text>,
          },
          {
            title: 'Role',
            dataIndex: 'role',
            render: (role: Role, user) => (
              <Select
                value={role}
                options={ROLES}
                disabled={user.username === me}
                onChange={(value) =>
                  update.mutate({ username: user.username, changes: { role: value as Role } })
                }
                style={{ width: 150 }}
                variant="borderless"
              />
            ),
          },
          {
            title: 'Last sign in',
            dataIndex: 'lastLoginAt',
            render: (v: string | null) => (v ? formatDateTime(v) : 'Never'),
          },
          {
            title: 'Status',
            render: (_, u) =>
              u.disabled ? (
                <Tag bordered={false}>Disabled</Tag>
              ) : u.lockedUntil && new Date(u.lockedUntil) > new Date() ? (
                <Tag color="red" bordered={false}>
                  Locked
                </Tag>
              ) : (
                <Tag color="green" bordered={false}>
                  Active
                </Tag>
              ),
          },
          {
            title: '',
            align: 'right',
            render: (_, u) =>
              u.username === me ? null : (
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  {u.lockedUntil ? (
                    <Button
                      size="small"
                      onClick={() => update.mutate({ username: u.username, changes: { unlock: true } })}
                    >
                      Unlock
                    </Button>
                  ) : null}
                  <Button size="small" onClick={() => setResetting(u)}>
                    Reset password
                  </Button>
                  <Popconfirm
                    title={u.disabled ? `Enable ${u.username}?` : `Disable ${u.username}?`}
                    onConfirm={() =>
                      update.mutate({ username: u.username, changes: { disabled: !u.disabled } })
                    }
                  >
                    <Button size="small" type="text" danger={!u.disabled}>
                      {u.disabled ? 'Enable' : 'Disable'}
                    </Button>
                  </Popconfirm>
                </span>
              ),
          },
        ]}
      />
      <Card title="What each role can do">
        <Table
          size="small"
          rowKey="area"
          pagination={false}
          dataSource={ROLE_ACCESS}
          scroll={{ x: 720 }}
          columns={[
            { title: 'Area', dataIndex: 'area' },
            ...ROLES.map((r) => ({
              title: r.label,
              align: 'center' as const,
              render: (_: unknown, row: (typeof ROLE_ACCESS)[number]) =>
                row.roles.includes(r.value as Role) ? 'Yes' : '',
            })),
          ]}
        />
      </Card>
      {creating ? <CreateUserModal onClose={() => setCreating(false)} /> : null}
      {resetting ? <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} /> : null}
    </>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form] = Form.useForm<{ username: string; role: Role; password: string }>();
  const create = useAction(platformApi.createUser, {
    success: 'User created',
    refresh: [['users']],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      title="Add user"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Create"
      confirmLoading={create.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ role: 'prize-desk' }}
        onFinish={(v) => create.mutate(v)}
      >
        <Form.Item
          label="Username"
          name="username"
          rules={[
            {
              required: true,
              pattern: /^[a-z0-9._-]{3,40}$/,
              message: 'Lower case letters, numbers, dots or dashes',
            },
          ]}
        >
          <Input placeholder="desk.user3" autoComplete="off" />
        </Form.Item>
        <Form.Item label="Role" name="role">
          <Select options={ROLES} />
        </Form.Item>
        <Form.Item label="Temporary password" name="password" rules={[{ required: true }, PASSWORD_RULE]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [form] = Form.useForm<{ password: string }>();
  const reset = useAction((password: string) => platformApi.updateUser(user.username, { password }), {
    success: 'Password reset',
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      title={`Reset password for ${user.username}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Reset"
      confirmLoading={reset.isPending}
    >
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => reset.mutate(v.password)}>
        <Form.Item label="New password" name="password" rules={[{ required: true }, PASSWORD_RULE]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
