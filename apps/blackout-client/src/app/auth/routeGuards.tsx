import React, { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { authStateAtom } from '../state/bmc-auth';
import { clientDefaultServer, useClientConfig } from '../hooks/useClientConfig';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
  setAfterLoginRedirectPath,
} from '../pages/afterLoginRedirectPath';
import { getLoginPath } from '../pages/pathUtils';

function AfterLoginRedirect() {
  const target = getAfterLoginRedirectPath() ?? '/';

  useEffect(() => {
    deleteAfterLoginRedirectPath();
  }, []);

  return <Navigate to={target} replace />;
}

function RequireLoginRedirect({
  target,
  redirectPath,
}: {
  target: string;
  redirectPath: string;
}) {
  useEffect(() => {
    setAfterLoginRedirectPath(redirectPath);
  }, [redirectPath]);

  return <Navigate to={target} replace />;
}

export function LoggedOutOnlyRoute({ children }: { children: ReactNode }) {
  const authState = useAtomValue(authStateAtom);

  if (authState === 'logged_in') {
    return <AfterLoginRedirect />;
  }

  return <>{children}</>;
}

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const authState = useAtomValue(authStateAtom);
  const clientConfig = useClientConfig();
  const location = useLocation();

  if (authState === 'logged_in') {
    return <>{children}</>;
  }

  const redirectTarget = `${location.pathname}${location.search}${location.hash}`;

  return (
    <RequireLoginRedirect
      target={getLoginPath(clientDefaultServer(clientConfig))}
      redirectPath={redirectTarget}
    />
  );
}
