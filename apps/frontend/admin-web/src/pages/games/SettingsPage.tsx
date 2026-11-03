/**
 * Game rules (super admin): screen reservation time, repeat winners, unused prizes.
 * Games admins can see them; only the super admin can change them.
 */
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Form, InputNumber, Radio, Switch } from 'antd';
import { useEffect } from 'react';
import { type Settings, gamesApi } from '../../api/games';
import { useAuth } from '../../app/auth';
import { PageHeader } from '../../components/PageHeader';
import { PageLoading } from '../../components/PageLoading';
import { useAction } from '../../hooks/useAction';

type FormValues = Omit<Settings, 'paused'>;

export function SettingsPage() {
  const { role } = useAuth();
  const canEdit = role === 'super-admin';
  const settings = useQuery({ queryKey: ['games', 'settings'], queryFn: gamesApi.settings });
  const [form] = Form.useForm<FormValues>();
  const save = useAction(gamesApi.saveSettings, { success: 'Rules saved', refresh: [['games', 'settings']] });

  useEffect(() => {
    if (settings.data) form.setFieldsValue(settings.data);
  }, [settings.data, form]);

  if (!settings.data) return <PageLoading />;

  return (
    <>
      <PageHeader
        title="Game rules"
        description="Rules for Spin the Wheel and Lucky Dip. LKDR approves these before the event."
      />
      {!canEdit ? (
        <Alert
          type="info"
          showIcon
          message="Only the super admin can change these rules"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Card style={{ maxWidth: 680 }}>
        <Form form={form} layout="vertical" disabled={!canEdit} onFinish={(values) => save.mutate(values)}>
          <Form.Item
            label="Screen reserved for one player (seconds)"
            name="lockTimeoutSeconds"
            extra="If the visitor does not start in time, the screen is freed and they can scan again."
          >
            <InputNumber min={20} max={300} />
          </Form.Item>
          <Form.Item
            label="One main prize per visitor per day"
            name="repeatWinnerRule"
            valuePropName="checked"
            extra="After winning a main prize, a visitor can only win other prizes that day."
          >
            <Switch />
          </Form.Item>
          <Form.Item label="Unused prizes at the end of a session" name="unusedPrizes">
            <Radio.Group
              options={[
                { value: 'expire', label: 'Keep them unused (reported)' },
                { value: 'roll-over', label: 'Move them to the next session that day' },
              ]}
            />
          </Form.Item>
          {canEdit ? (
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              Save rules
            </Button>
          ) : null}
        </Form>
      </Card>
    </>
  );
}
