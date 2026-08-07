import { clearControls } from '../actions/movement';
import type { Command } from '../types';

export const stopCommand: Command = {
  name: 'stop',
  aliases: ['halt'],
  description: 'Stop whatever the bot is currently doing.',
  usage: '!stop',
  execute(ctx, sender) {
    const stopped = ctx.actions.stop();
    // Clear controls regardless: this is the "get unstuck" escape hatch, so it
    // should always leave the bot in a known-inert state.
    clearControls(ctx);
    ctx.bot.chat(stopped ? `Stopped ${stopped}, ${sender}.` : `I wasn't doing anything, ${sender}.`);
  },
};
