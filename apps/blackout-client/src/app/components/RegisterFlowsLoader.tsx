import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { MatrixError, createClient } from 'matrix-js-sdk';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { useAutoDiscoveryInfo } from '../hooks/useAutoDiscoveryInfo';
import {
  RegisterFlowStatus,
  RegisterFlowsResponse,
  parseRegisterErrResp,
} from '../hooks/useAuthFlows';

type RegisterFlowsLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown) => ReactNode;
  children: (registerFlows: RegisterFlowsResponse) => ReactNode;
};

export function RegisterFlowsLoader({
  fallback,
  error,
  children,
}: RegisterFlowsLoaderProps) {
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const baseUrl = autoDiscoveryInfo['m.homeserver'].base_url;
  const mx = useMemo(() => createClient({ baseUrl }), [baseUrl]);

  const [state, load] = useAsyncCallback(
    useCallback(async () => {
      try {
        await mx.registerRequest({});
        return { status: RegisterFlowStatus.InvalidRequest } satisfies RegisterFlowsResponse;
      } catch (registerError) {
        if (registerError instanceof MatrixError && registerError.httpStatus) {
          return parseRegisterErrResp(registerError);
        }

        throw registerError;
      }
    }, [mx])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }

  if (state.status === AsyncStatus.Error) {
    return error?.(state.error);
  }

  return children(state.data);
}
