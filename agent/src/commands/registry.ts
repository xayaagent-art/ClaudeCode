import type { BotContext, Command } from '../types';

/**
 * Name -> command lookup with alias support and a single dispatch entry point.
 *
 * Phase 2 registers LLM tool-calls against this same registry, so the model
 * and human players end up driving one identical capability surface.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly aliases = new Map<string, string>();

  register(...cmds: Command[]): this {
    for (const cmd of cmds) {
      if (this.commands.has(cmd.name)) {
        throw new Error(`Duplicate command registration: ${cmd.name}`);
      }
      this.commands.set(cmd.name, cmd);
      for (const alias of cmd.aliases ?? []) {
        this.aliases.set(alias, cmd.name);
      }
    }
    return this;
  }

  get(name: string): Command | undefined {
    const canonical = this.aliases.get(name) ?? name;
    return this.commands.get(canonical);
  }

  list(): Command[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Parse a raw chat line and run the matching command.
   *
   * @returns true if the line was a command directed at us (whether or not it
   *          succeeded), false if it was ordinary chat we should ignore.
   */
  async dispatch(ctx: BotContext, sender: string, message: string): Promise<boolean> {
    const prefix = ctx.config.commandPrefix;
    if (!message.startsWith(prefix)) return false;

    const [rawName, ...args] = message.slice(prefix.length).trim().split(/\s+/);
    if (!rawName) return false;

    const cmd = this.get(rawName.toLowerCase());
    if (!cmd) {
      ctx.bot.chat(`I don't know "${prefix}${rawName}". Try ${prefix}help.`);
      return true;
    }

    ctx.log.info(`<${sender}> ${prefix}${rawName}${args.length ? ' ' + args.join(' ') : ''}`);
    try {
      await cmd.execute(ctx, sender, args);
    } catch (err) {
      // A crashing command must never take the bot process down.
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.error(`command "${cmd.name}" failed: ${msg}`, err);
      ctx.bot.chat(`Something went wrong running ${prefix}${cmd.name}.`);
    }
    return true;
  }
}
