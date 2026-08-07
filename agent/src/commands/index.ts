import { comeCommand } from './come';
import { createHelpCommand } from './help';
import { followCommand } from './follow';
import { jumpCommand } from './jump';
import { lookCommand } from './look';
import { CommandRegistry } from './registry';
import { statusCommand } from './status';
import { stopCommand } from './stop';

export { CommandRegistry } from './registry';

/**
 * Assemble the command set. Adding a capability in a later phase means writing
 * one file and adding one line here.
 */
export function createRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(
    comeCommand,
    followCommand,
    stopCommand,
    statusCommand,
    jumpCommand,
    lookCommand,
  );
  // Registered last so it can enumerate everything above it.
  registry.register(createHelpCommand(registry));
  return registry;
}
