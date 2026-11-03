import { Skeleton } from 'antd';

/** Placeholder while a page's code or data loads. */
export function PageLoading() {
  return <Skeleton active paragraph={{ rows: 6 }} style={{ padding: 8 }} />;
}
