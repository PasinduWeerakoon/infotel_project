/** A0: admin sign in. Accounts are created by the super admin (Users and roles). */
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { platformApi } from '../api/platform';

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      await platformApi.login(values.username, values.password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Cannot sign in right now');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        // Same night sky as the games, so staff and visitors see one brand
        background:
          'radial-gradient(60% 45% at 15% 0%, rgb(155 92 255 / 0.55), transparent 70%), radial-gradient(55% 40% at 100% 100%, rgb(56 182 255 / 0.35), transparent 70%), linear-gradient(180deg, #241565, #170e3f)',
      }}
    >
      <Card
        style={{ width: '100%', maxWidth: 400, boxShadow: '0 30px 80px -30px rgb(0 0 0 / 0.6)' }}
        styles={{ body: { padding: 32 } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <Typography.Text strong style={{ fontSize: 17 }}>
            LKDR Admin
          </Typography.Text>
        </div>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Sign in
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Games Event, Treasure Hunt and the prize desk in one place.
        </Typography.Paragraph>
        <Form layout="vertical" requiredMark={false} onFinish={submit} disabled={loading}>
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Enter your username' }]}
          >
            <Input autoComplete="username" autoFocus size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Enter your password' }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
