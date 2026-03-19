import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Provider as JotaiProvider } from 'jotai';
import './app/styles/theme.css.ts';
import './app/i18n';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: null,
  },
]);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </JotaiProvider>
  </React.StrictMode>,
);
