import type { Command } from '../types';
import type { CommandRegistry } from './registry';

/**
 * `!help` needs the registry to enumerate commands, so it is built via a
 * factory rather than exported as a plain object.
 */
export function createHelpCommand(registry: CommandRegistry): Command {
  return {
    name: 'help',
    aliases: ['commands'],
    description: 'List everything I can do.',
    usage: '!help',
    execute(ctx) {
      const prefix = ctx.config.commandPrefix;
      const names = registry.list().map((c) => prefix + c.name);
      ctx.bot.chat(`Commands: ${names.join(' ')}`);
      ctx.log.info(
        'help:\n' +
          registry
            .list()
            .map((c) => `    ${(prefix + c.name).padEnd(10)} ${c.description}`)
            .join('\n'),
      );
    },
  };
}
