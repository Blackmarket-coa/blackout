import to from 'await-to-js';
import {
  IAuthData,
  MatrixClient,
  MatrixError,
  RegisterRequest,
  RegisterResponse,
} from 'matrix-js-sdk';
import { useEffect } from 'react';
import { useStore } from 'jotai';
import { getMxIdLocalPart, getMxIdServer } from '../../../utils/matrix';
import { getLoginPath } from '../../pathUtils';
import { saveSession } from '../../../../client/sessionManager';
import { initMatrixFromStoredSession } from '../../../../client/initMatrix';
import { setFallbackSession } from '../../../state/sessions';

export enum RegisterError {
  UserTaken = 'UserTaken',
  UserInvalid = 'UserInvalid',
  UserExclusive = 'UserExclusive',
  PasswordWeak = 'PasswordWeak',
  PasswordShort = 'PasswordShort',
  InvalidRequest = 'InvalidRequest',
  Forbidden = 'Forbidden',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomRegisterResponse = {
  baseUrl: string;
  response: RegisterResponse;
};

export type RegisterResult = [IAuthData, undefined] | [undefined, CustomRegisterResponse];

export const register = async (
  mx: MatrixClient,
  requestData: RegisterRequest
): Promise<RegisterResult> => {
  const [err, res] = await to<RegisterResponse, MatrixError>(mx.registerRequest(requestData));

  if (err) {
    if (err.httpStatus === 401) {
      const authData = err.data as IAuthData;
      return [authData, undefined];
    }

    if (err.errcode === 'M_USER_IN_USE') {
      throw new MatrixError({ errcode: RegisterError.UserTaken });
    }
    if (err.errcode === 'M_INVALID_USERNAME') {
      throw new MatrixError({ errcode: RegisterError.UserInvalid });
    }
    if (err.errcode === 'M_EXCLUSIVE') {
      throw new MatrixError({ errcode: RegisterError.UserExclusive });
    }
    if (err.errcode === 'M_WEAK_PASSWORD') {
      throw new MatrixError({ errcode: RegisterError.PasswordWeak, error: err.data.error });
    }
    if (err.errcode === 'M_PASSWORD_TOO_SHORT') {
      throw new MatrixError({ errcode: RegisterError.PasswordShort, error: err.data.error });
    }
    if (err.httpStatus === 429) {
      throw new MatrixError({ errcode: RegisterError.RateLimited });
    }
    if (err.httpStatus === 400) {
      throw new MatrixError({ errcode: RegisterError.InvalidRequest });
    }
    if (err.httpStatus === 403) {
      throw new MatrixError({ errcode: RegisterError.Forbidden });
    }

    throw new MatrixError({
      errcode: RegisterError.Unknown,
      error: err.data?.error,
    });
  }

  return [
    undefined,
    {
      baseUrl: mx.baseUrl,
      response: res,
    },
  ];
};

export const useRegisterComplete = (
  data: CustomRegisterResponse | undefined,
  onRequireLogin?: (path: string) => void
) => {
  const store = useStore();

  useEffect(() => {
    if (!data) return;

    const { response, baseUrl } = data;
    const userId = response.user_id;
    const accessToken = response.access_token;
    const deviceId = response.device_id;

    if (accessToken && deviceId) {
      saveSession({
        baseUrl,
        accessToken,
        userId,
        deviceId,
      });
      setFallbackSession(accessToken, deviceId, userId, baseUrl);
      void initMatrixFromStoredSession(store);
      return;
    }

    const username = getMxIdLocalPart(userId);
    const userServer = getMxIdServer(userId);
    if (userServer && username) {
      onRequireLogin?.(`${getLoginPath(userServer)}?username=${encodeURIComponent(username)}`);
    }
  }, [data, onRequireLogin, store]);
};
