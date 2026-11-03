import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { prefetchNextSteps, router } from './app/router';
import { Spinner } from './components/ui/Spinner';

const queryClient = new QueryClient({
  defaultOptions: {
    // The server decides every step, so data is never shown stale and errors are handled per page
    queries: { staleTime: 0, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense
        fallback={
          <div className="grid min-h-dvh place-items-center">
            <Spinner className="size-7 text-sun" />
          </div>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
);

window.addEventListener(
  'load',
  () => window.requestIdleCallback?.(prefetchNextSteps) ?? setTimeout(prefetchNextSteps, 500),
);
