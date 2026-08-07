import { Movements, goals } from 'mineflayer-pathfinder';
import type { BotContext } from '../types';
import { findPlayerEntity, type PlayerEntity } from '../world/players';

/** How close `!come` tries to get to the target player, in blocks. */
const ARRIVE_DISTANCE = 2;
/** Distance `!follow` maintains behind the target player, in blocks. */
const FOLLOW_DISTANCE = 3;

/**
 * Build the movement ruleset for this bot. Called once per spawn because it
 * depends on the world/version data that only exists after spawning.
 *
 * Phase 2 will vary these per personality (a cautious agent might set
 * `allowParkour = false`, a miner would enable `canDig`).
 */
export function configureMovements(ctx: BotContext): void {
  const movements = new Movements(ctx.bot);
  // Keep the bot from rearranging the world just to reach someone. Digging and
  // block placement get enabled deliberately in the building/mining phase.
  movements.canDig = false;
  movements.allow1by1towers = false;
  ctx.bot.pathfinder.setMovements(movements);
  ctx.log.debug('pathfinder movements configured');
}

/** Explicitly tagged so TypeScript narrows cleanly at every call site. */
type PlayerLookup =
  | { ok: true; entity: PlayerEntity }
  | { ok: false; reason: string };

/**
 * Resolve a player's entity, or explain why we cannot see them.
 * Players outside render distance are listed in `bot.players` but have no
 * entity to path towards.
 */
function resolvePlayerEntity(ctx: BotContext, username: string): PlayerLookup {
  const entity = findPlayerEntity(ctx.bot, username);
  if (entity) return { ok: true, entity };

  if (!ctx.bot.players[username]) {
    return { ok: false, reason: `I don't see a player called ${username}.` };
  }
  return {
    ok: false,
    reason: `${username}, you're too far away for me to locate. Move closer.`,
  };
}

/**
 * `!come` — walk once to the player who issued the command.
 */
export async function comeToPlayer(ctx: BotContext, username: string): Promise<void> {
  const found = resolvePlayerEntity(ctx, username);
  if (!found.ok) {
    ctx.bot.chat(found.reason);
    return;
  }

  const { x, y, z } = found.entity.position;
  const goal = new goals.GoalNear(x, y, z, ARRIVE_DISTANCE);

  ctx.actions.start(`walking to ${username}`, () => {
    // Cancelling a pathfinder goal is how we abort an in-flight `goto`.
    ctx.bot.pathfinder.setGoal(null);
  });
  ctx.bot.chat(`On my way, ${username}!`);

  try {
    await ctx.bot.pathfinder.goto(goal);
    ctx.bot.chat(`I made it, ${username}.`);
    ctx.actions.complete(`walking to ${username}`);
  } catch (err) {
    // `goto` rejects when the goal is changed or the path becomes impossible —
    // an interruption by `!stop` is normal, so this is not an error path.
    const message = err instanceof Error ? err.message : String(err);
    ctx.log.warn(`walk to ${username} ended early: ${message}`);
    if (ctx.actions.currentAction === `walking to ${username}`) {
      ctx.bot.chat(`I couldn't reach you, ${username}.`);
      ctx.actions.complete(`walking to ${username}`);
    }
  }
}

/**
 * `!follow` — continuously track the player until stopped.
 *
 * Uses a *dynamic* goal so pathfinder re-evaluates as the player moves,
 * rather than us polling their position on a timer.
 */
export function followPlayer(ctx: BotContext, username: string): void {
  const found = resolvePlayerEntity(ctx, username);
  if (!found.ok) {
    ctx.bot.chat(found.reason);
    return;
  }

  const goal = new goals.GoalFollow(found.entity, FOLLOW_DISTANCE);

  ctx.actions.start(`following ${username}`, () => {
    ctx.bot.pathfinder.setGoal(null);
  });
  // `true` marks the goal dynamic: pathfinder keeps recomputing as they move.
  ctx.bot.pathfinder.setGoal(goal, true);
  ctx.bot.chat(`Following you, ${username}. Say ${ctx.config.commandPrefix}stop when you've had enough.`);
}

/**
 * `!jump` — a single hop. Deliberately does not disturb the current action.
 */
export function jump(ctx: BotContext): void {
  ctx.bot.setControlState('jump', true);
  // One tick of "jump held" is enough; releasing immediately avoids bunny-hopping.
  setTimeout(() => ctx.bot.setControlState('jump', false), 250);
}

/**
 * Release every movement control. Used by `!stop` and on death/respawn so no
 * control state leaks across lives.
 */
export function clearControls(ctx: BotContext): void {
  ctx.bot.pathfinder.setGoal(null);
  for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'] as const) {
    ctx.bot.setControlState(control, false);
  }
}
