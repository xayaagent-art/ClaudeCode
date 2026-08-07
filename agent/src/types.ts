import type { Bot } from 'mineflayer';
import type { ActionManager } from './actions/ActionManager';
import type { AgentConfig } from './config';
import type { Logger } from './logger';

/**
 * Everything a command or action needs in order to do its job.
 *
 * Phase 2 (LLM / autonomy) will extend this object with `memory`, `goals`,
 * `personality` and `tools` — keeping every capability behind this single
 * context object is what makes that additive rather than invasive.
 */
export interface BotContext {
  bot: Bot;
  log: Logger;
  actions: ActionManager;
  config: AgentConfig;
  /** The bot's own username, cached for convenience. */
  username: string;
}

/**
 * A chat command a human player can issue, e.g. `!come`.
 *
 * Commands are intentionally thin: they parse intent and delegate to an
 * action. Phase 2 will register LLM-driven "tools" through this same
 * interface so the model and humans share one capability surface.
 */
export interface Command {
  /** Command name WITHOUT the prefix, e.g. `come`. */
  name: string;
  /** Alternative names, without the prefix. */
  aliases?: string[];
  /** One-line description, surfaced by `!help`. */
  description: string;
  /** Usage hint, surfaced by `!help`. */
  usage: string;
  /**
   * @param ctx     shared bot context
   * @param sender  username of the player who issued the command
   * @param args    whitespace-split arguments after the command name
   */
  execute(ctx: BotContext, sender: string, args: string[]): void | Promise<void>;
}

/** A snapshot of the bot's vitals, used by `!status` and terminal logging. */
export interface StatusSnapshot {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  action: string;
  dimension: string;
  inventory: Array<{ name: string; count: number }>;
}
