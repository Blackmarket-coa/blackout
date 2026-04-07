import { readAuthRuntimeConfig } from '../services/auth';

export interface SecurityPreflightSummary {
  jwtSecretsConfigured: number;
  tokenTransport: 'header' | 'cookie' | 'both';
  cookieSecureValidated: boolean;
}

export const runSecurityPreflight = (): SecurityPreflightSummary => {
  const auth = readAuthRuntimeConfig();
  return {
    jwtSecretsConfigured: auth.verificationSecrets.length,
    tokenTransport: auth.tokenTransport,
    cookieSecureValidated:
      auth.tokenTransport === 'header' ? true : Boolean(auth.cookieName && auth.cookieSameSite),
  };
};
