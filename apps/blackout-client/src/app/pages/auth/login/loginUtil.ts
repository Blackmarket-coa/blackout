import to from 'await-to-js';
import { MatrixError } from 'matrix-js-sdk';
import { useStore } from 'jotai';
import { ClientConfig, clientAllowedServer } from '../../../hooks/useClientConfig';
import { autoDiscovery, specVersions } from '../../../cs-api';
import {
  type PasswordLoginIdentifier,
  loginWithPassword,
  type PasswordLoginInput,
} from '../../../../client/auth';
import { MatrixInitError } from '../../../../client/initMatrix';

export enum GetBaseUrlError {
  NotAllow = 'NotAllow',
  NotFound = 'NotFound',
}

export const factoryGetBaseUrl = (clientConfig: ClientConfig, server: string) => {
  const getBaseUrl = async (): Promise<string> => {
    if (!clientAllowedServer(clientConfig, server)) {
      throw new Error(GetBaseUrlError.NotAllow);
    }

    const [, discovery] = await to(autoDiscovery(fetch, server));

    let mxIdBaseUrl: string | undefined;
    const [, discoveryInfo] = discovery ?? [];

    if (discoveryInfo) {
      mxIdBaseUrl = discoveryInfo['m.homeserver'].base_url;
    }

    if (!mxIdBaseUrl) {
      throw new Error(GetBaseUrlError.NotFound);
    }

    const [, versions] = await to(specVersions(fetch, mxIdBaseUrl));
    if (!versions) {
      throw new Error(GetBaseUrlError.NotFound);
    }

    return mxIdBaseUrl;
  };

  return getBaseUrl;
};

export enum LoginError {
  ServerNotAllowed = 'ServerNotAllowed',
  InvalidServer = 'InvalidServer',
  Forbidden = 'Forbidden',
  InvalidRequest = 'InvalidRequest',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

const toLoginError = (error: unknown): MatrixError => {
  if (error instanceof Error) {
    if (error.message === GetBaseUrlError.NotAllow) {
      return new MatrixError({ errcode: LoginError.ServerNotAllowed });
    }
    if (error.message === GetBaseUrlError.NotFound) {
      return new MatrixError({ errcode: LoginError.InvalidServer });
    }
  }

  if (error instanceof MatrixInitError) {
    switch (error.code) {
      case 'invalid_credentials':
        return new MatrixError({ errcode: LoginError.Forbidden });
      case 'rate_limited':
        return new MatrixError({ errcode: LoginError.RateLimited });
      case 'invalid_homeserver':
      case 'network_failure':
        return new MatrixError({ errcode: LoginError.InvalidServer });
      case 'captcha_required':
        return new MatrixError({ errcode: LoginError.InvalidRequest });
      default:
        return new MatrixError({ errcode: LoginError.Unknown });
    }
  }

  return new MatrixError({ errcode: LoginError.Unknown });
};

export const usePasswordLogin = () => {
  const store = useStore();

  return async (
    serverBaseUrl: string | (() => Promise<string>),
    identifier: PasswordLoginIdentifier,
    password: string
  ) => {
    const [urlError, url] =
      typeof serverBaseUrl === 'function' ? await to(serverBaseUrl()) : [undefined, serverBaseUrl];

    if (urlError || !url) {
      throw toLoginError(urlError);
    }

    const input: PasswordLoginInput = {
      baseUrl: url,
      identifier,
      password,
    };

    try {
      return await loginWithPassword(store, input);
    } catch (error) {
      throw toLoginError(error);
    }
  };
};
