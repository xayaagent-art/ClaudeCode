import { jump } from '../actions/movement';
import type { Command } from '../types';

export const jumpCommand: Command = {
  name: 'jump',
  description: 'Jump once.',
  usage: '!jump',
  execute(ctx, sender) {
    jump(ctx);
    ctx.bot.chat(`Hup! (for you, ${sender})`);
  },
};
