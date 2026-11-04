/**
 * Treasure Hunt event logos: loaded once from QuickLook (on the first day) and used for every
 * session of the event. Only scans of these logos count. Loading again adds logos QuickLook added
 * later and refreshes names, nothing is removed.
 */
import { IconCloudDownload, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Input, Popconfirm, Table, Typography } from 'antd';
import { useState } from 'react';
import { type EventLogo, huntApi } from '../../api/hunt';
import { useAuth } from '../../app/auth';
import { hasRole } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';

const matches = (logo: EventLogo, text: string) =>
  [logo.productName, logo.companyName, logo.logoCode, logo.logoId].some((v) =>
    v?.toLowerCase().includes(text.toLowerCase()),
  );

export function EventLogosPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, ['hunt-admin']);
  const logos = useQuery({ queryKey: ['hunt', 'logos'], queryFn: huntApi.logos });
  const [search, setSearch] = useState('');
  const load = useAction(huntApi.loadLogos, {
    success: (result) => `Loaded ${result.loaded} logos from QuickLook`,
    refresh: [['hunt', 'logos']],
  });
  const items = logos.data?.items ?? [];
  const shown = search.trim() ? items.filter((l) => matches(l, search.trim())) : items;

  return (
    <>
      <PageHeader
        title="Event logos"
        description="The stall logos of the event, loaded once from QuickLook. They count in every session, each logo once per visitor."
        extra={
          canEdit ? (
            <Popconfirm
              title="Load the event logos from QuickLook?"
              description="New logos are added and names refreshed. Nothing is removed."
              onConfirm={() => load.mutate()}
            >
              <Button type="primary" icon={<IconCloudDownload size={16} />} loading={load.isPending}>
                Load logos from QuickLook
              </Button>
            </Popconfirm>
          ) : null
        }
      />
      <Flex vertical gap={16}>
        {!logos.isLoading && items.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message="No event logos yet"
            description="Scans are kept, but none count until the event logos are loaded from QuickLook."
          />
        ) : null}
        <Flex justify="space-between" align="center" gap={12} wrap>
          <Input
            allowClear
            prefix={<IconSearch size={16} />}
            placeholder="Search by name, company, code or logo ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Typography.Text type="secondary">{items.length} logos</Typography.Text>
        </Flex>
        <Table
          rowKey="logoId"
          loading={logos.isLoading}
          dataSource={shown}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: 760 }}
          columns={[
            {
              title: 'Logo',
              width: 72,
              render: (_, l) =>
                l.logoUrl ? (
                  <img src={l.logoUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                ) : null,
            },
            { title: 'Name', dataIndex: 'productName' },
            {
              title: 'Company',
              dataIndex: 'companyName',
              render: (v: string | null) => v ?? <Typography.Text type="secondary">None</Typography.Text>,
            },
            { title: 'Code', dataIndex: 'logoCode' },
            {
              title: 'Logo ID',
              dataIndex: 'logoId',
              render: (v: string) => (
                <Typography.Text code copyable style={{ fontSize: 12 }}>
                  {v}
                </Typography.Text>
              ),
            },
          ]}
        />
      </Flex>
    </>
  );
}
