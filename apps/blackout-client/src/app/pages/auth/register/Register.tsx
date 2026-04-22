import React, { useMemo } from 'react';
import { Box, Text, color } from 'folds';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthServer } from '../../../hooks/useAuthServer';
import { RegisterFlowStatus, RegisterFlowsResponse } from '../../../hooks/useAuthFlows';
import { PasswordRegisterForm, SUPPORTED_REGISTER_STAGES } from './PasswordRegisterForm';
import { SupportedUIAFlowsLoader } from '../../../components/SupportedUIAFlowsLoader';
import { RegisterFlowsLoader } from '../../../components/RegisterFlowsLoader';
import { getLoginPath } from '../../pathUtils';
import { RegisterPathSearchParams } from '../../paths';

const useRegisterSearchParams = (searchParams: URLSearchParams): RegisterPathSearchParams =>
  useMemo(
    () => ({
      username: searchParams.get('username') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      token: searchParams.get('token') ?? undefined,
    }),
    [searchParams]
  );

export function Register() {
  const server = useAuthServer();
  const [searchParams] = useSearchParams();
  const registerSearchParams = useRegisterSearchParams(searchParams);

  return (
    <RegisterFlowsLoader
      fallback={() => (
        <Box direction="Column" gap="500">
          <Text size="H2" priority="400">
            Register
          </Text>
          <Text size="T300">Loading registration flow...</Text>
          <Text align="Center">
            Already have an account? <Link to={getLoginPath(server)}>Sign In</Link>
          </Text>
        </Box>
      )}
      error={() => (
        <Box direction="Column" gap="500">
          <Text size="H2" priority="400">
            Register
          </Text>
          <Text style={{ color: color.Critical.Main }} size="T300">
            Failed to get any registration options.
          </Text>
          <Text align="Center">
            Already have an account? <Link to={getLoginPath(server)}>Sign In</Link>
          </Text>
        </Box>
      )}
    >
      {(registerFlows: RegisterFlowsResponse) => (
        <Box direction="Column" gap="500">
          <Text size="H2" priority="400">
            Register
          </Text>
          {registerFlows.status === RegisterFlowStatus.RegistrationDisabled && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Registration has been disabled on this homeserver.
            </Text>
          )}
          {registerFlows.status === RegisterFlowStatus.RateLimited && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              You have been rate-limited. Please try again later.
            </Text>
          )}
          {registerFlows.status === RegisterFlowStatus.InvalidRequest && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Invalid request. Failed to get any registration options.
            </Text>
          )}
          {registerFlows.status === RegisterFlowStatus.FlowRequired && (
            <SupportedUIAFlowsLoader
              flows={registerFlows.data.flows ?? []}
              supportedStages={SUPPORTED_REGISTER_STAGES}
            >
              {(supportedFlows) =>
                supportedFlows.length === 0 ? (
                  <Text style={{ color: color.Critical.Main }} size="T300">
                    This application does not support registration on this homeserver.
                  </Text>
                ) : (
                  <PasswordRegisterForm
                    authData={registerFlows.data}
                    uiaFlows={supportedFlows}
                    defaultUsername={registerSearchParams.username}
                    defaultEmail={registerSearchParams.email}
                    defaultRegisterToken={registerSearchParams.token}
                  />
                )
              }
            </SupportedUIAFlowsLoader>
          )}
          <Text align="Center">
            Already have an account? <Link to={getLoginPath(server)}>Sign In</Link>
          </Text>
        </Box>
      )}
    </RegisterFlowsLoader>
  );
}
