/**
 * Picks the QuickLook logos that count in a hunt session. QuickLook has many logos, most of them
 * not part of this event, so only scans of the selected logos are counted.
 * Search QuickLook's registered logos, tick the event's ones, or start from another session's
 * selection (for example the previous event).
 */
import { IconCopy, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Flex, Input, Modal, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { type EventLogo, type HuntSession, huntApi } from '../../api/hunt';
import { useAction } from '../../hooks/useAction';
import { formatDate } from '../../lib/format';

const PAGE_SIZE = 20;

interface Filters {
  name: string;
  company: string;
  logoCode: string;
}

export function LogoPicker({
  session,
  sessions,
  onClose,
}: { session: HuntSession; sessions: HuntSession[]; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Map(session.logos.map((l) => [l.logoId, l])));
  const [draft, setDraft] = useState<Filters>({ name: '', company: '', logoCode: '' });
  const [filters, setFilters] = useState<Filters>(draft);
  const [page, setPage] = useState(1);

  const logos = useQuery({
    queryKey: ['hunt', 'quicklook-logos', filters, page],
    queryFn: () =>
      huntApi.searchLogos({
        name: filters.name || undefined,
        company: filters.company || undefined,
        logoCode: filters.logoCode || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    retry: false,
  });
  const save = useAction(() => huntApi.setLogos(session.sessionId, [...selected.values()]), {
    success: 'Logos saved',
    refresh: [['hunt']],
    onSuccess: onClose,
  });

  const others = sessions.filter((s) => s.sessionId !== session.sessionId && s.logos.length > 0);
  const toggle = (logo: EventLogo, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(logo.logoId, logo);
      else next.delete(logo.logoId);
      return next;
    });
  const search = () => {
    setFilters(draft);
    setPage(1);
  };
  const notConnected = logos.error instanceof ApiError && logos.error.code === 'LEADERBOARD_NOT_CONNECTED';

  return (
    <Modal
      open
      width={880}
      title={`Logos for ${session.name}`}
      onCancel={onClose}
      okText={`Save ${selected.size} logo${selected.size === 1 ? '' : 's'}`}
      onOk={() => save.mutate(undefined)}
      okButtonProps={{ loading: save.isPending }}
      destroyOnHidden
    >
      <Flex vertical gap={14}>
        <Typography.Text type="secondary">
          Only scans of these logos count in this session. Tick the logos registered for this event.
        </Typography.Text>

        {others.length > 0 ? (
          <Flex gap={8} align="center" wrap>
            <IconCopy size={16} />
            <Typography.Text>Start from another session</Typography.Text>
            <Select
              style={{ minWidth: 320 }}
              placeholder="Choose a session"
              options={others.map((s) => ({
                value: s.sessionId,
                label: `${formatDate(s.date)}, ${s.name} (${s.logos.length} logos)`,
              }))}
              onChange={(id: string) => {
                const from = others.find((s) => s.sessionId === id);
                if (from) setSelected(new Map(from.logos.map((l) => [l.logoId, l])));
              }}
            />
          </Flex>
        ) : null}

        <Flex gap={6} wrap style={{ maxHeight: 120, overflowY: 'auto' }}>
          {selected.size === 0 ? (
            <Typography.Text type="warning">No logos selected yet. Nothing will count.</Typography.Text>
          ) : (
            [...selected.values()].map((logo) => (
              <Tag
                key={logo.logoId}
                closable
                onClose={() => toggle(logo, false)}
                bordered={false}
                color="purple"
              >
                {logo.productName}
              </Tag>
            ))
          )}
        </Flex>

        <Flex gap={8} wrap>
          <Input
            placeholder="Product name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onPressEnter={search}
            style={{ flex: 2, minWidth: 180 }}
            allowClear
          />
          <Input
            placeholder="Company"
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            onPressEnter={search}
            style={{ flex: 2, minWidth: 160 }}
            allowClear
          />
          <Input
            placeholder="Logo code"
            value={draft.logoCode}
            onChange={(e) => setDraft({ ...draft, logoCode: e.target.value })}
            onPressEnter={search}
            style={{ flex: 1, minWidth: 120 }}
            allowClear
          />
          <Button icon={<IconSearch size={16} />} onClick={search}>
            Search
          </Button>
        </Flex>

        {logos.error ? (
          <Alert
            type={notConnected ? 'info' : 'warning'}
            showIcon
            message={
              logos.error instanceof ApiError ? logos.error.message : 'QuickLook logos could not be loaded'
            }
            description={
              notConnected
                ? 'Add the Leaderboard API address and key for this environment, then reopen this window.'
                : undefined
            }
          />
        ) : (
          <Table
            rowKey="logoId"
            size="small"
            loading={logos.isFetching}
            dataSource={logos.data?.items ?? []}
            locale={{ emptyText: <Empty description="No logos match this search" /> }}
            rowSelection={{
              selectedRowKeys: [...selected.keys()],
              preserveSelectedRowKeys: true,
              onSelect: (logo, on) => toggle(logo, on),
              onSelectAll: (on, _rows, changed) => {
                for (const logo of changed) toggle(logo, on);
              },
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: logos.data?.total ?? 0,
              onChange: setPage,
              showSizeChanger: false,
              size: 'small',
            }}
            scroll={{ x: 640, y: 320 }}
            columns={[
              {
                title: 'Logo',
                render: (_, logo) =>
                  logo.logoUrl ? (
                    <img src={logo.logoUrl} alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
                  ) : null,
                width: 64,
              },
              { title: 'Product', dataIndex: 'productName' },
              {
                title: 'Company',
                dataIndex: 'companyName',
                render: (c: string | null) => c ?? <Typography.Text type="secondary">Hidden</Typography.Text>,
              },
              { title: 'Code', dataIndex: 'logoCode', render: (c: string | null) => c ?? '' },
            ]}
          />
        )}
      </Flex>
    </Modal>
  );
}
