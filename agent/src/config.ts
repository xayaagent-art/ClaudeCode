import 'dotenv/config';
import type { LogLevel } from './logger';

/**
 * All runtime configuration lives here so no other module reads `process.env`
 * directly. Phase 2 adds `OPENAI_API_KEY` / model settings alongside these.
 */
export interface AgentConfig {
  host: string;
  port: number;
  username: string;
  /**
   * Minecraft protocol version. `undefined` lets mineflayer auto-negotiate
   * against the server, which is what we want when the server version is
   * pinned by the bootstrap script.
   */
  version: string | undefined;
  /** `offline` for a LAN dev server with online-mode=false. */
  auth: 'offline' | 'microsoft';
  commandPrefix: string;
  logLevel: LogLevel;
  /** Backoff bounds for automatic reconnect. */
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  /** How often to print vitals to the terminal. 0 disables. */
  statusIntervalMs: number;
  /** Radius used by `!look` when scanning for blocks. */
  observeRadius: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

export function loadConfig(): AgentConfig {
  const version = str('MC_VERSION', 'auto');
  const auth = str('MC_AUTH', 'offline');

  if (auth !== 'offline' && auth !== 'microsoft') {
    throw new Error(`MC_AUTH must be "offline" or "microsoft", got "${auth}"`);
  }

  return {
    host: str('MC_HOST', '127.0.0.1'),
    port: num('MC_PORT', 25565),
    username: str('BOT_USERNAME', 'Aiden'),
    // "auto" is our sentinel for "let mineflayer negotiate".
    version: version === 'auto' ? undefined : version,
    auth,
    commandPrefix: str('COMMAND_PREFIX', '!'),
    logLevel: str('LOG_LEVEL', 'info') as LogLevel,
    reconnectInitialMs: num('RECONNECT_INITIAL_MS', 2000),
    reconnectMaxMs: num('RECONNECT_MAX_MS', 30000),
    statusIntervalMs: num('STATUS_INTERVAL_MS', 30000),
    observeRadius: num('OBSERVE_RADIUS', 16),
  };
}
