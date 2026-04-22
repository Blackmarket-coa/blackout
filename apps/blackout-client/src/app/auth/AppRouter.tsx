import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import LegacyClientLayout from '../pages/client/LegacyClientLayout';
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
        <LegacyClientLayout />
      </AuthenticatedRoute>
    ),
  },
  {
    path: '/room/:roomId',
    element: (
      <AuthenticatedRoute>
        <LegacyClientLayout />
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
