// Aiden — a minimal Mineflayer bot.
// Joins the local Paper server, wanders, jumps, looks around, and responds
// to !come / !follow / !stop in chat. No AI, no state machine, no framework.

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const HOST = process.env.MC_HOST || '127.0.0.1';
const PORT = Number(process.env.MC_PORT || 25565);
const NAME = process.env.BOT_NAME || 'Aiden';

// 'idle' lets the wander loop run; anything else means a human is in charge.
let mode = 'idle';
let loop = null;

function connect() {
  console.log(`[${NAME}] connecting to ${HOST}:${PORT}…`);
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: NAME,
    auth: 'offline', // the LAN server runs online-mode=false
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    bot.pathfinder.setMovements(new Movements(bot));
    console.log(`[${NAME}] spawned at ${bot.entity.position}`);
    // Slight delay: chatting on the same tick as spawn is sometimes dropped.
    setTimeout(() => bot.chat(`${NAME} online! Try !come, !follow, !stop`), 1000);
    startIdleLoop(bot);
  });

  bot.on('chat', (user, msg) => {
    if (user === bot.username) return;
    const text = msg.trim().toLowerCase();
    if (text === '!come') come(bot, user);
    else if (text === '!follow') follow(bot, user);
    else if (text === '!stop') stop(bot);
  });

  // One-shot goals (!come, wander) finish here; !follow is continuous so it
  // deliberately stays in follow mode.
  bot.on('goal_reached', () => {
    if (mode === 'come') {
      bot.chat('Made it!');
      mode = 'idle';
    }
  });

  bot.on('error', (e) => console.log(`[${NAME}] error: ${e.message}`));
  bot.on('kicked', (r) => console.log(`[${NAME}] kicked: ${JSON.stringify(r)}`));
  bot.on('death', () => console.log(`[${NAME}] died, respawning`));

  bot.on('end', () => {
    clearInterval(loop);
    mode = 'idle';
    console.log(`[${NAME}] disconnected, retrying in 5s`);
    setTimeout(connect, 5000);
  });
}

/**
 * Find a player's entity. `bot.players[x].entity` is the normal path, but it
 * is briefly null right after someone joins, so fall back to the entity list.
 */
function findPlayer(bot, name) {
  const p = bot.players[name];
  if (p && p.entity) return p.entity;
  return (
    Object.values(bot.entities).find((e) => e.type === 'player' && e.username === name) || null
  );
}

function come(bot, user) {
  const target = findPlayer(bot, user);
  if (!target) return bot.chat(`I can't see you, ${user} — come closer.`);
  mode = 'come';
  bot.chat(`Coming, ${user}!`);
  const { x, y, z } = target.position;
  bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 2));
}

function follow(bot, user) {
  const target = findPlayer(bot, user);
  if (!target) return bot.chat(`I can't see you, ${user} — come closer.`);
  mode = 'follow';
  bot.chat(`Following you, ${user}.`);
  // `true` = dynamic goal: pathfinder re-plans as the player moves.
  bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
}

function stop(bot) {
  mode = 'idle';
  bot.pathfinder.setGoal(null);
  bot.chat('Stopped.');
}

/** Every few seconds, do something visible so the bot is obviously alive. */
function startIdleLoop(bot) {
  clearInterval(loop);
  loop = setInterval(() => {
    if (mode !== 'idle') return; // never interrupt a human's command
    const p = bot.entity.position;
    const here = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    const roll = Math.random();

    if (roll < 0.5) {
      // Wander to a random spot within ~8 blocks.
      const x = p.x + (Math.random() * 16 - 8);
      const z = p.z + (Math.random() * 16 - 8);
      console.log(`[${NAME}] wandering from ${here}`);
      bot.pathfinder.setGoal(new goals.GoalNear(x, p.y, z, 1));
    } else if (roll < 0.75) {
      console.log(`[${NAME}] jumping at ${here}`);
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
    } else {
      // Look somewhere random: yaw all the way round, pitch gently.
      console.log(`[${NAME}] looking around at ${here}`);
      bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6, false);
    }
  }, 5000);
}

connect();
