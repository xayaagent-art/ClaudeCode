import type { Bot } from 'mineflayer';

/** The entity type mineflayer attaches to a tracked player. */
export type PlayerEntity = NonNullable<Bot['players'][string]['entity']>;

/**
 * Find a player's entity, tolerating servers that populate the player list and
 * the entity list out of step.
 *
 * `bot.players[name].entity` is the documented path and works on Paper, but it
 * is only linked once mineflayer has matched an entity-spawn packet to a
 * player-info entry. Some servers (and Paper itself, briefly, right after a
 * player joins) leave that link null while a perfectly usable player entity
 * already exists in `bot.entities`. Falling back to a direct scan makes
 * `!come` / `!follow` work in that window instead of refusing.
 */
export function findPlayerEntity(bot: Bot, username: string): PlayerEntity | null {
  const player = bot.players[username];
  if (player?.entity) return player.entity;

  const uuid = player?.uuid;
  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue;
    if (entity.type !== 'player') continue;
    // Match on username first, then UUID — different server implementations
    // populate one or the other.
    if (entity.username === username) return entity as PlayerEntity;
    if (uuid && entity.uuid === uuid) return entity as PlayerEntity;
  }
  return null;
}

/** Every other player we can currently see, with their entity resolved. */
export function visiblePlayers(
  bot: Bot,
  self: string,
): Array<{ username: string; entity: PlayerEntity }> {
  const out: Array<{ username: string; entity: PlayerEntity }> = [];
  const seen = new Set<string>();

  for (const username of Object.keys(bot.players)) {
    if (username === self) continue;
    const entity = findPlayerEntity(bot, username);
    if (!entity) continue;
    seen.add(username);
    out.push({ username, entity });
  }

  // Catch player entities that never made it into `bot.players` at all.
  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity || entity.type !== 'player') continue;
    const username = entity.username;
    if (!username || username === self || seen.has(username)) continue;
    seen.add(username);
    out.push({ username, entity: entity as PlayerEntity });
  }

  return out.sort((a, b) => a.username.localeCompare(b.username));
}
