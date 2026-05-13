// Ring-buffer wrapper around console.{log,info,warn,error} so the Settings
// "Report a bug" flow can attach the most recent N lines as diagnostics.
//
// Install this at the top of `main.tsx` before any other import emits to
// console — otherwise early logs slip past. Lines are stored in-memory only;
// they never leave the device unless the user opts into "include diagnostics"
// on a bug report.

export interface ConsoleCaptureOptions {
  readonly capacity?: number;
  readonly maxLineChars?: number;
}

const DEFAULT_CAPACITY = 50;
const DEFAULT_MAX_LINE_CHARS = 2_000;

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

const push = (level: string, args: unknown[]): void => {
  const ts = new Date().toISOString();
  const line = `${ts} [${level}] ${args.map(stringifyArg).join(' ')}`;
  const clipped = line.length > maxLineChars ? `${line.slice(0, maxLineChars)}…` : line;
  buffer.push(clipped);
  if (buffer.length > capacity) buffer.shift();
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
};

export const getConsoleTail = (): string[] => [...buffer];

export const __test__ = {
  reset: () => {
    buffer = [];
    installed = false;
  },
  pushForTest: (level: string, args: unknown[]) => push(level, args),
};
