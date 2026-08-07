import { comeToPlayer } from '../actions/movement';
import type { Command } from '../types';

export const comeCommand: Command = {
  name: 'come',
  aliases: ['here'],
  description: 'Walk to the player who issued the command.',
  usage: '!come',
  async execute(ctx, sender) {
    await comeToPlayer(ctx, sender);
  },
};
