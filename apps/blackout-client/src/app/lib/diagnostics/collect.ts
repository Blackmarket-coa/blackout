import packageJson from '../../../../package.json';
import { getConsoleTail } from './consoleCapture';

export interface CollectedDiagnostics {
  readonly clientVersion: string;
  readonly userAgent: string;
  readonly platform: string;
  readonly consoleTail: string[];
}

const safeNavigator = (): Navigator | null => {
  try {
    return typeof navigator !== 'undefined' ? navigator : null;
  } catch {
    return null;
  }
};

export const collectDiagnostics = (): CollectedDiagnostics => {
  const nav = safeNavigator();
  return {
    clientVersion: typeof packageJson.version === 'string' ? packageJson.version : 'unknown',
    userAgent: nav?.userAgent ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    consoleTail: getConsoleTail(),
  };
};
