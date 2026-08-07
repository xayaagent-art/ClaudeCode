import mineflayer, { type Bot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';

import { ActionManager } from './actions/ActionManager';
import { clearControls, configureMovements } from './actions/movement';
import { createRegistry, type CommandRegistry } from './commands';
import type { AgentConfig } from './config';
import { createLogger, type Logger } from './logger';
import type { BotContext } from './types';
import { formatStatusBlock, snapshot } from './world/observer';

/**
 * Owns one bot's whole lifecycle: connecting, wiring events, and reconnecting
 * with exponential backoff when the connection drops.
 *
 * It is a class rather than a function so Phase 2 can run several independent
 * agents in one process simply by constructing several runners.
 */
export class BotRunner {
  private readonly config: AgentConfig;
  private readonly log: Logger;
  private readonly registry: CommandRegistry;

  private bot: Bot | null = null;
  private ctx: BotContext | null = null;

  /** Consecutive failed attempts, used to compute backoff. Reset on spawn. */
  private attempts = 0;
  /** Set by `shutdown()` so an intentional quit does not trigger a reconnect. */
  private stopping = false;
  /** Guards against two reconnects being scheduled for one disconnect. */
  private reconnectTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  /** `spawn` fires on every respawn; we only greet once per connection. */
  private greeted = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.log = createLogger(config.username, config.logLevel);
    this.registry = createRegistry();
  }

  start(): void {
    this.connect();
  }

  /** Disconnect for good — no reconnect will be scheduled. */
  shutdown(): void {
    this.stopping = true;
    this.clearTimers();
    if (this.bot) {
      this.log.info('shutting down…');
      try {
        this.bot.quit('shutting down');
      } catch {
        // Socket may already be gone; nothing useful to do.
      }
    }
  }

  // ---------------------------------------------------------------------------

  private connect(): void {
    const { host, port, username, version, auth } = this.config;
    this.greeted = false;
    this.log.info(
      `connecting to ${host}:${port} as "${username}" ` +
        `(version: ${version ?? 'auto-negotiate'}, auth: ${auth})`,
    );

    const bot = mineflayer.createBot({
      host,
      port,
      username,
      auth,
      version,
      // Keeping this modest reduces the chunk volume the bot has to parse.
      viewDistance: 'short',
    });

    this.bot = bot;
    bot.loadPlugin(pathfinder);

    const actions = new ActionManager(this.log);
    this.ctx = { bot, log: this.log, actions, config: this.config, username };

    this.wireEvents(bot, this.ctx);
  }

  private wireEvents(bot: Bot, ctx: BotContext): void {
    bot.once('login', () => {
      this.log.info(`logged in — server version ${bot.version}`);
    });

    bot.on('spawn', () => {
      // A successful spawn means the connection is healthy: reset backoff.
      this.attempts = 0;
      configureMovements(ctx);

      if (!this.greeted) {
        this.greeted = true;
        const prefix = this.config.commandPrefix;
        // Small delay: chatting the same tick as spawn is sometimes dropped
        // before the server has finished adding us to the player list.
        setTimeout(() => {
          bot.chat(`${this.config.username} online. Say ${prefix}help to see what I can do.`);
        }, 1000);
        this.log.info('spawned into the world');
        this.printStatus(ctx);
        this.startStatusLoop(ctx);
      } else {
        this.log.info('respawned');
      }
    });

    bot.on('chat', (username, message) => {
      if (username === bot.username) return; // never react to our own chat
      void this.registry.dispatch(ctx, username, message);
    });

    // Treat whispers the same as public chat so commands can be issued privately.
    bot.on('whisper', (username, message) => {
      if (username === bot.username) return;
      void this.registry.dispatch(ctx, username, message);
    });

    bot.on('death', () => {
      this.log.warn('died — clearing controls and going idle');
      ctx.actions.stop();
      clearControls(ctx);
    });

    bot.on('kicked', (reason) => {
      this.log.warn(`kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
    });

    bot.on('error', (err) => {
      // Mineflayer emits `error` then `end`; reconnect is handled by `end`.
      this.log.error(`connection error: ${err.message}`);
    });

    bot.on('end', (reason) => {
      this.log.warn(`disconnected (${reason})`);
      this.clearTimers();
      this.bot = null;
      this.ctx = null;
      this.scheduleReconnect();
    });
  }

  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;

    const { reconnectInitialMs, reconnectMaxMs } = this.config;
    // Exponential backoff, capped, so a server that is down does not get
    // hammered — but a transient blip still recovers in ~2 seconds.
    const delay = Math.min(reconnectInitialMs * 2 ** this.attempts, reconnectMaxMs);
    this.attempts += 1;

    this.log.info(`reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.attempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startStatusLoop(ctx: BotContext): void {
    if (this.config.statusIntervalMs <= 0) return;
    this.statusTimer = setInterval(() => this.printStatus(ctx), this.config.statusIntervalMs);
  }

  private printStatus(ctx: BotContext): void {
    this.log.info(`vitals:\n${formatStatusBlock(snapshot(ctx))}`);
  }

  private clearTimers(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
