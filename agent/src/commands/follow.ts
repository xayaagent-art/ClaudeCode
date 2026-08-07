import { followPlayer } from '../actions/movement';
import type { Command } from '../types';

export const followCommand: Command = {
  name: 'follow',
  description: 'Continuously follow the player who issued the command.',
  usage: '!follow',
  execute(ctx, sender) {
    followPlayer(ctx, sender);
  },
};
