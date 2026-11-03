/**
 * Prize catalogue: every prize with its event stock, image and main prize flag,
 * plus how many are allocated to sessions and already given out.
 */
import { IconGift, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Flex,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { type Prize, gamesApi } from '../../api/games';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { ImageUpload } from '../../components/ImageUpload';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';

type PrizeForm = Pick<Prize, 'name' | 'stock' | 'isMainPrize'>;

export function PrizesPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['games-admin']);
  const prizes = useQuery({ queryKey: ['games', 'prizes'], queryFn: gamesApi.prizes });
  const [editing, setEditing] = useState<Prize | 'new' | null>(null);
  const remove = useAction(gamesApi.deletePrize, {
    success: 'Prize deleted',
    refresh: [['games', 'prizes']],
  });

  return (
    <>
      <PageHeader
        title="Prize catalogue"
        description="Stock is for the whole event. Prizes are spread across each session. Main prizes follow the repeat-winner rule."
        extra={
          canEdit ? (
            <Button type="primary" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>
              Add prize
            </Button>
          ) : null
        }
      />
      <Table
        rowKey="prizeId"
        loading={prizes.isLoading}
        dataSource={prizes.data?.items ?? []}
        pagination={false}
        scroll={{ x: 720 }}
        columns={[
          {
            title: 'Prize',
            render: (_, p) => (
              <Flex align="center" gap={12}>
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    width={40}
                    height={40}
                    style={{ objectFit: 'contain', borderRadius: 8 }}
                    preview={false}
                  />
                ) : (
                  <Flex
                    align="center"
                    justify="center"
                    style={{ width: 40, height: 40, borderRadius: 8, background: '#fff4d6' }}
                  >
                    <IconGift size={20} color="#b07f00" />
                  </Flex>
                )}
                <Typography.Text strong>{p.name}</Typography.Text>
                {p.isMainPrize ? (
                  <Tag color="gold" bordered={false}>
                    Main
                  </Tag>
                ) : null}
              </Flex>
            ),
          },
          { title: 'Stock', dataIndex: 'stock', align: 'right' },
          { title: 'Allocated', dataIndex: 'allocated', align: 'right' },
          { title: 'Given', dataIndex: 'given', align: 'right' },
          {
            title: 'Left',
            dataIndex: 'left',
            align: 'right',
            render: (left: number) => <Typography.Text strong>{left}</Typography.Text>,
          },
          {
            title: '',
            align: 'right',
            render: (_, p) =>
              canEdit ? (
                <Flex gap={4} justify="flex-end">
                  <Button size="small" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  {!p.allocated ? (
                    <Popconfirm title={`Delete ${p.name}?`} onConfirm={() => remove.mutate(p.prizeId)}>
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
      {editing ? <PrizeModal prize={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function PrizeModal({ prize, onClose }: { prize: Prize | 'new'; onClose: () => void }) {
  const [form] = Form.useForm<PrizeForm>();
  const existing = prize === 'new' ? null : prize;
  const [image, setImage] = useState({ key: existing?.imageKey ?? null, url: existing?.imageUrl ?? null });

  const save = useAction(
    (values: PrizeForm) => {
      const input = { ...values, imageKey: image.key };
      return existing ? gamesApi.updatePrize(existing.prizeId, input) : gamesApi.createPrize(input);
    },
    { success: 'Prize saved', refresh: [['games', 'prizes']], onSuccess: onClose },
  );

  return (
    <Modal
      open
      title={existing ? `Edit ${existing.name}` : 'Add prize'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save"
      confirmLoading={save.isPending}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={existing ?? { stock: 10, isMainPrize: false }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item label="Image">
          <ImageUpload
            purpose="prize"
            imageUrl={image.url}
            onUploaded={(key, url) => setImage({ key, url })}
          />
        </Form.Item>
        <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Enter the prize name' }]}>
          <Input placeholder="Pen drive 32 GB" />
        </Form.Item>
        <Form.Item label="Stock for the event" name="stock" rules={[{ required: true }]}>
          <InputNumber min={0} max={100000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label="Main prize"
          name="isMainPrize"
          valuePropName="checked"
          extra="Main prizes can be paced and limited to one per visitor per day."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
