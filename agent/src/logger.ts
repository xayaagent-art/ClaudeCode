/**
 * Minimal dependency-free logger with level filtering.
 *
 * Kept deliberately small: Phase 2 can swap this for pino/winston without any
 * caller changes, since everything goes through the `Logger` interface.
 */

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export interface Logger {
  debug(msg: string, ...rest: unknown[]): void;
  info(msg: string, ...rest: unknown[]): void;
  warn(msg: string, ...rest: unknown[]): void;
  error(msg: string, ...rest: unknown[]): void;
  child(scope: string): Logger;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function createLogger(scope: string, level: LogLevel = 'info'): Logger {
  const threshold = LEVELS.indexOf(level);

  const emit = (lvl: LogLevel, msg: string, rest: unknown[]) => {
    if (LEVELS.indexOf(lvl) < threshold) return;
    const line = `${COLORS[lvl]}${timestamp()} ${lvl.toUpperCase().padEnd(5)}${RESET} ${BOLD}[${scope}]${RESET} ${msg}`;
    // Warnings and errors go to stderr so `npm run agent > log` keeps them visible.
    const sink = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
    sink(line, ...rest);
  };

  return {
    debug: (m, ...r) => emit('debug', m, r),
    info: (m, ...r) => emit('info', m, r),
    warn: (m, ...r) => emit('warn', m, r),
    error: (m, ...r) => emit('error', m, r),
    child: (sub: string) => createLogger(`${scope}:${sub}`, level),
  };
}
