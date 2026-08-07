import { describeSurroundings } from '../world/observer';
import type { Command } from '../types';

export const lookCommand: Command = {
  name: 'look',
  aliases: ['scan'],
  description: 'Describe nearby players, entities and blocks in the terminal.',
  usage: '!look',
  execute(ctx, sender) {
    const report = describeSurroundings(ctx);
    // The spec puts this report in the terminal, so chat only gets an ack.
    ctx.log.info(`surroundings (requested by ${sender}):\n${report}`);
    ctx.bot.chat(`Had a look around, ${sender} — full report is in my terminal.`);
  },
};
