// Official Ant Design 5 compatibility patch for React 19 (popups, messages, modals)
import '@ant-design/v5-patch-for-react-19';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/router';
import { theme } from './app/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ConfigProvider theme={theme} locale={enGB}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
