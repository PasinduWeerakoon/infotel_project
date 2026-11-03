/** Title, one-line description and actions at the top of every page. */
import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  extra,
}: { title: string; description?: string; extra?: ReactNode }) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 20 }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0, letterSpacing: '-0.01em' }}>
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {description}
          </Typography.Text>
        ) : null}
      </div>
      {extra ? (
        <Flex gap={8} wrap>
          {extra}
        </Flex>
      ) : null}
    </Flex>
  );
}
