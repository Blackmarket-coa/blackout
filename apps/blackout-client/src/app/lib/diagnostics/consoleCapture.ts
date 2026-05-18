// Ring-buffer wrapper around console.{log,info,warn,error} so the Settings
// "Report a bug" flow can attach the most recent N lines as diagnostics.
//
// Install this at the top of `main.tsx` before any other import emits to
// console — otherwise early logs slip past. Lines are stored in-memory only;
// they never leave the device unless the user opts into "include diagnostics"
// on a bug report.
//
// Also attaches global `window.error` and `unhandledrejection` listeners so
// synchronous crashes that bypass console.error still land in the ring buffer
// (and are exposed via `getLastError()` for the diagnostics collector).

export interface ConsoleCaptureOptions {
  readonly capacity?: number;
  readonly maxLineChars?: number;
}

const DEFAULT_CAPACITY = 50;
const DEFAULT_MAX_LINE_CHARS = 2_000;
const DEDUPE_PREFIX_CHARS = 200;

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

let buffer: string[] = [];
let capacity = DEFAULT_CAPACITY;
let maxLineChars = DEFAULT_MAX_LINE_CHARS;
let installed = false;
let lastDedupeKey: string | null = null;
let lastErrorLine: string | null = null;

const push = (level: string, args: unknown[]): void => {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${args.map(stringifyArg).join(' ')}`;
  const clipped = line.length > maxLineChars ? `${line.slice(0, maxLineChars)}…` : line;

  // Matrix-js-sdk frequently logs to console.error AND then throws, which would
  // surface twice via the window 'error' listener. De-dupe back-to-back records
  // with the same level + first 200 chars.
  const dedupeKey = `${level}|${clipped.slice(0, DEDUPE_PREFIX_CHARS)}`;
  if (dedupeKey === lastDedupeKey) return;
  lastDedupeKey = dedupeKey;

  buffer.push(clipped);
  if (buffer.length > capacity) buffer.shift();
  if (level === 'error') lastErrorLine = clipped;
};

const installWindowErrorListeners = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    const stack = event.error instanceof Error ? event.error.stack : undefined;
    push('error', stack ? [event.message, stack] : [event.message]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const stack = reason instanceof Error ? reason.stack : undefined;
    push('error', ['Unhandled rejection:', reason, ...(stack ? [stack] : [])]);
  });
};

export const installConsoleCapture = (opts: ConsoleCaptureOptions = {}): void => {
  if (installed) return;
  installed = true;
  capacity = opts.capacity ?? DEFAULT_CAPACITY;
  maxLineChars = opts.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...args: unknown[]) => {
    push('log', args);
    original.log(...(args as []));
  };
  console.info = (...args: unknown[]) => {
    push('info', args);
    original.info(...(args as []));
  };
  console.warn = (...args: unknown[]) => {
    push('warn', args);
    original.warn(...(args as []));
  };
  console.error = (...args: unknown[]) => {
    push('error', args);
    original.error(...(args as []));
  };
  installWindowErrorListeners();
};

export const getConsoleTail = (): string[] => [...buffer];

export const getLastError = (): string | null => lastErrorLine;

export const __test__ = {
  reset: () => {
    buffer = [];
    installed = false;
    lastDedupeKey = null;
    lastErrorLine = null;
  },
  pushForTest: (level: string, args: unknown[]) => push(level, args),
};
