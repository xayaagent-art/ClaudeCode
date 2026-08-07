import type { Bot } from 'mineflayer';
import type { BotContext, StatusSnapshot } from '../types';
import { visiblePlayers } from './players';

/** Round to 1 decimal so logs and chat stay readable. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Capture the bot's vitals. This is the single source of truth for `!status`,
 * the periodic terminal print, and (in Phase 2) the observation that gets fed
 * into the model's context window.
 */
export function snapshot(ctx: BotContext): StatusSnapshot {
  const { bot } = ctx;
  const pos = bot.entity?.position;

  return {
    position: pos
      ? { x: r1(pos.x), y: r1(pos.y), z: r1(pos.z) }
      : { x: 0, y: 0, z: 0 },
    health: bot.health ?? 0,
    food: bot.food ?? 0,
    action: ctx.actions.currentAction,
    dimension: (bot.game?.dimension as string) ?? 'unknown',
    inventory: summariseInventory(bot),
  };
}

/**
 * Collapse the inventory into `name x count` pairs, merging stacks of the
 * same item so a full inventory does not flood the terminal.
 */
export function summariseInventory(bot: Bot): Array<{ name: string; count: number }> {
  const totals = new Map<string, number>();
  for (const item of bot.inventory.items()) {
    totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** One-line vitals summary, used for chat replies and periodic logging. */
export function formatStatusLine(snap: StatusSnapshot): string {
  const { x, y, z } = snap.position;
  return (
    `health ${snap.health}/20 | food ${snap.food}/20 | ` +
    `pos ${x}, ${y}, ${z} | doing: ${snap.action}`
  );
}

/** Multi-line vitals block including inventory, for the terminal. */
export function formatStatusBlock(snap: StatusSnapshot): string {
  const inv =
    snap.inventory.length === 0
      ? '    (empty)'
      : snap.inventory.map((i) => `    ${i.name} x${i.count}`).join('\n');
  const { x, y, z } = snap.position;
  return [
    '  position  : ' + `${x}, ${y}, ${z} (${snap.dimension})`,
    '  health    : ' + `${snap.health}/20`,
    '  hunger    : ' + `${snap.food}/20`,
    '  action    : ' + snap.action,
    '  inventory :',
    inv,
  ].join('\n');
}

/**
 * `!look` — describe the bot's surroundings in the terminal.
 *
 * Returns a human-readable report of nearby players, other entities and the
 * most common blocks in range. Phase 2 reuses this verbatim as the "what do I
 * see" tool exposed to the model.
 */
export function describeSurroundings(ctx: BotContext): string {
  const { bot } = ctx;
  const self = bot.entity?.position;
  if (!self) return 'I have not spawned yet — nothing to see.';

  const lines: string[] = [];
  const dist = (p: { x: number; y: number; z: number }) =>
    Math.round(self.distanceTo(p as never) * 10) / 10;

  // --- players -------------------------------------------------------------
  const players = visiblePlayers(bot, ctx.username).map(
    (p) => `    ${p.username} — ${dist(p.entity.position)} blocks away`,
  );
  lines.push(`  players (${players.length}):`);
  lines.push(players.length ? players.join('\n') : '    (none in range)');

  // --- non-player entities -------------------------------------------------
  const entities = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.type !== 'player')
    .map((e) => ({ name: e.displayName || e.name || e.type, d: dist(e.position) }))
    .filter((e) => e.d <= ctx.config.observeRadius * 2)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((e) => `    ${e.name} — ${e.d} blocks away`);
  lines.push(`  entities (nearest ${entities.length}):`);
  lines.push(entities.length ? entities.join('\n') : '    (none in range)');

  // --- blocks --------------------------------------------------------------
  lines.push(`  blocks within ${ctx.config.observeRadius}:`);
  lines.push(describeBlocks(ctx));

  return lines.join('\n');
}

/**
 * Tally the block types in a cube around the bot.
 *
 * We sample on a stride rather than reading every block: a 16-radius cube is
 * ~35k blocks, which is far too slow to walk every tick. The stride keeps the
 * scan under a few thousand reads while still characterising the area.
 */
function describeBlocks(ctx: BotContext): string {
  const { bot } = ctx;
  const origin = bot.entity.position.floored();
  const radius = ctx.config.observeRadius;
  const stride = 2;

  const counts = new Map<string, number>();
  for (let dx = -radius; dx <= radius; dx += stride) {
    for (let dy = -4; dy <= 4; dy += stride) {
      for (let dz = -radius; dz <= radius; dz += stride) {
        const block = bot.blockAt(origin.offset(dx, dy, dz));
        if (!block || block.name === 'air' || block.name === 'cave_air') continue;
        counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return '    (no blocks loaded yet)';
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => `    ${name} (~${n} sampled)`)
    .join('\n');
}
