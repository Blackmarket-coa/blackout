import React, { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthFlows } from '../../../hooks/useAuthFlows';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { useParsedLoginFlows } from '../../../hooks/useParsedLoginFlows';
import { PasswordLoginForm } from './PasswordLoginForm';
import { getRegisterPath } from '../../pathUtils';
import { LoginPathSearchParams } from '../../paths';

const useLoginSearchParams = (searchParams: URLSearchParams): LoginPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      loginToken: searchParams.get('loginToken') ?? undefined,
    }),
    [searchParams]
  );

export function Login() {
  const server = useAuthServer();
  const { loginFlows } = useAuthFlows();
  const [searchParams] = useSearchParams();
  const loginSearchParams = useLoginSearchParams(searchParams);
  const parsedFlows = useParsedLoginFlows(loginFlows.flows);

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Sign In
      </Text>
      {parsedFlows.password && (
        <PasswordLoginForm
          defaultUsername={loginSearchParams.username}
          defaultEmail={loginSearchParams.email}
        />
      )}
      {!parsedFlows.password && (
        <Text style={{ color: color.Critical.Main }}>
          {`This client does not support password login on "${server}" homeserver.`}
        </Text>
      )}
      <Text align="Center">
        Do not have an account? <Link to={getRegisterPath(server)}>Register</Link>
      </Text>
    </Box>
  );
}
