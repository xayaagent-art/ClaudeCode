import { formatStatusBlock, formatStatusLine, snapshot } from '../world/observer';
import type { Command } from '../types';

export const statusCommand: Command = {
  name: 'status',
  aliases: ['stats'],
  description: 'Report health, food, position and current action in chat.',
  usage: '!status',
  execute(ctx) {
    const snap = snapshot(ctx);
    // Chat gets the one-liner; the terminal gets the full block with inventory.
    ctx.bot.chat(formatStatusLine(snap));
    ctx.log.info(`status requested:\n${formatStatusBlock(snap)}`);
  },
};
