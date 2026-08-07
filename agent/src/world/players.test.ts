import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Bot } from 'mineflayer';

import { findPlayerEntity, visiblePlayers } from './players';

/**
 * Minimal stand-in for a mineflayer Bot. We only need `players` and
 * `entities`, which is exactly what the lookup helpers read.
 */
function fakeBot(opts: {
  players?: Record<string, { uuid?: string; entity?: unknown }>;
  entities?: Record<string, unknown>;
  self?: unknown;
}): Bot {
  return {
    players: opts.players ?? {},
    entities: opts.entities ?? {},
    entity: opts.self ?? { id: 0 },
  } as unknown as Bot;
}

describe('findPlayerEntity', () => {
  it('returns the entity linked on the player list', () => {
    const entity = { id: 7, type: 'player', username: 'Yash' };
    const bot = fakeBot({ players: { Yash: { entity } } });

    assert.equal(findPlayerEntity(bot, 'Yash'), entity);
  });

  it('falls back to the entity list when the player link is null', () => {
    // This is the state a server leaves us in briefly after a player joins:
    // the player list knows the name, but the entity is not linked yet.
    const entity = { id: 7, type: 'player', username: 'Yash' };
    const bot = fakeBot({
      players: { Yash: { entity: undefined } },
      entities: { 7: entity },
    });

    assert.equal(findPlayerEntity(bot, 'Yash'), entity);
  });

  it('falls back by UUID when the entity carries no username', () => {
    const entity = { id: 7, type: 'player', uuid: 'abc-123' };
    const bot = fakeBot({
      players: { Yash: { uuid: 'abc-123', entity: undefined } },
      entities: { 7: entity },
    });

    assert.equal(findPlayerEntity(bot, 'Yash'), entity);
  });

  it('returns null when the player is genuinely not visible', () => {
    const bot = fakeBot({ players: { Yash: { entity: undefined } } });

    assert.equal(findPlayerEntity(bot, 'Yash'), null);
  });

  it('never returns a non-player entity that happens to share a name', () => {
    const cow = { id: 9, type: 'mob', username: 'Yash' };
    const bot = fakeBot({ players: { Yash: {} }, entities: { 9: cow } });

    assert.equal(findPlayerEntity(bot, 'Yash'), null);
  });
});

describe('visiblePlayers', () => {
  it('excludes the bot itself', () => {
    const self = { id: 1, type: 'player', username: 'Aiden' };
    const other = { id: 2, type: 'player', username: 'Yash' };
    const bot = fakeBot({
      players: { Aiden: { entity: self }, Yash: { entity: other } },
      entities: { 1: self, 2: other },
      self,
    });

    const seen = visiblePlayers(bot, 'Aiden');
    assert.deepEqual(
      seen.map((p) => p.username),
      ['Yash'],
    );
  });

  it('includes players present only in the entity list', () => {
    const self = { id: 1, type: 'player', username: 'Aiden' };
    const ghost = { id: 3, type: 'player', username: 'Ghost' };
    const bot = fakeBot({
      players: {},
      entities: { 1: self, 3: ghost },
      self,
    });

    const seen = visiblePlayers(bot, 'Aiden');
    assert.deepEqual(
      seen.map((p) => p.username),
      ['Ghost'],
    );
  });

  it('does not list the same player twice', () => {
    const self = { id: 1, type: 'player', username: 'Aiden' };
    const other = { id: 2, type: 'player', username: 'Yash' };
    const bot = fakeBot({
      players: { Yash: { entity: other } },
      entities: { 1: self, 2: other },
      self,
    });

    assert.equal(visiblePlayers(bot, 'Aiden').length, 1);
  });
});
