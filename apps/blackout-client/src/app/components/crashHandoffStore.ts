// One-shot in-memory store that hands a captured React render error from
// `CrashBoundary` to a downstream bug-report form. Lives in module state —
// not sessionStorage — because stack traces and componentStack strings can
// contain matrix IDs, room IDs, and other identifiers we don't want
// persisted across page loads.
//
// `consume` reads and clears in one call; subsequent reads return null.

export interface CrashHandoff {
  message: string;
  stack: string;
  componentStack: string;
  capturedAt: number;
}

let stored: CrashHandoff | null = null;

export const setCrashHandoff = (handoff: CrashHandoff): void => {
  stored = handoff;
};

export const peekCrashHandoff = (): CrashHandoff | null => stored;

export const consumeCrashHandoff = (): CrashHandoff | null => {
  const out = stored;
  stored = null;
  return out;
};

export const __test__ = {
  reset: () => {
    stored = null;
  },
};
