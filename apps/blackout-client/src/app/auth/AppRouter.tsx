import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import ClientLayout from '../pages/client/ClientLayout';
import { DraupnirRoutePage } from '../features/moderation/draupnir';
import { AuthLayout, Login, Register, ResetPassword } from '../pages/auth';
import { AuthenticatedRoute, LoggedOutOnlyRoute } from './routeGuards';

export const appRouter = createBrowserRouter([
  {
    element: (
      <LoggedOutOnlyRoute>
        <AuthLayout />
      </LoggedOutOnlyRoute>
    ),
    children: [
      {
        path: '/login/:server?/',
        element: <Login />,
      },
      {
        path: '/register/:server?/',
        element: <Register />,
      },
      {
        path: '/reset-password/:server?/',
        element: <ResetPassword />,
      },
    ],
  },
  {
    path: '/',
    element: (
      <AuthenticatedRoute>
        <ClientLayout />
      </AuthenticatedRoute>
    ),
  },
  {
    path: '/room/:roomId',
    element: (
      <AuthenticatedRoute>
        <ClientLayout />
      </AuthenticatedRoute>
    ),
  },
  {
    path: '/moderation/draupnir',
    element: (
      <AuthenticatedRoute>
        <DraupnirRoutePage />
      </AuthenticatedRoute>
    ),
  },
]);
