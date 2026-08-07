# Minecraft AI Lab — Phase 1

A local Minecraft world you join from an **iPhone (Bedrock Edition)**, hosted on your Mac,
with a **Mineflayer-controlled bot** standing in the world beside you.

Phase 1 is deliberately **not** an AI project yet: there is no LLM, no autonomy, no memory.
It is the substrate those things get built on. The bot ("Aiden") connects, walks, follows
and answers chat commands — nothing decides anything on its own.

```
  iPhone (Minecraft Bedrock)
        │  UDP 19132
        ▼
  ┌───────────────────────────────────────┐
  │  Geyser      Bedrock → Java translation│
  │  Floodgate   auth without a Java acct  │
  │  ViaVersion  bridges the version gap   │
  ├───────────────────────────────────────┤
  │  Paper server        (localhost:25565) │
  └───────────────────────────────────────┘
        ▲  TCP 25565
        │
  Aiden (Node.js + TypeScript + Mineflayer)
```

Everything runs on one machine. Nothing is exposed to the internet.

---

## Why the version numbers are computed, not hard-coded

There is a real conflict between two of these components:

| Component | Constraint |
|---|---|
| **Geyser** | Always emulates the **newest** Java client. Bedrock clients auto-update and cannot be pinned. |
| **Mineflayer** | Can only speak versions that `minecraft-data` ships, which typically **lags** the newest Java release. |

So there is usually **no single version both support natively**. The setup resolves this by
running the server at the newest version *Mineflayer* supports, and installing **ViaVersion**
so Geyser's newer emulated client can still connect down to it.

That choice is deliberate: it keeps the **bot** on a native, well-tested protocol path and
puts the translation on the Geyser side, which already does far heavier translation anyway.

`server/scripts/resolve-version.mjs` performs this intersection at install time by reading
the Paper API and your actual installed `minecraft-data`, so it stays correct as both move.

---

## Prerequisites

| Requirement | Check | Install |
|---|---|---|
| Homebrew | `brew --version` | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| Java 21+ | `java -version` | `brew install --cask temurin@21` |
| Node 18+ | `node -v` | `brew install node` |

Java 21 is a hard floor — both Paper and Geyser require it.

---

## Quick start

```bash
npm run setup       # one time: downloads Paper + plugins, writes config, accepts the EULA
npm run start:all   # every time after that: server + Aiden, one command
```

`npm run setup` is safe to re-run; it skips anything already downloaded. Use
`bash server/bootstrap.sh --force` to reset configuration back to defaults.

The first `npm run setup` starts the server once on its own and then stops it. That is
intentional: Geyser and Floodgate own their config schemas (including a `config-version`
that drives their migration logic), so rather than hand-writing configs that would go stale
between releases, the setup lets each plugin generate its own defaults and then edits only
the specific keys this project depends on. It also generates the world, so the first real
start is fast.

Individual pieces, if you want them in separate terminals:

```bash
npm run server      # Paper only
npm run agent       # Aiden only (needs the server running)
npm run lan-ip      # print the address your iPhone needs
npm test            # unit tests
npm run typecheck   # TypeScript, no emit
```

---

## Joining from your iPhone

1. Make sure the iPhone and the Mac are on the **same Wi-Fi network**.
2. Run `npm run lan-ip` on the Mac to get its address.
3. On the iPhone: **Minecraft → Play → Servers → Add Server**

   | Field | Value |
   |---|---|
   | Server Name | `Minecraft AI Lab` |
   | Server Address | the address from `npm run lan-ip` (e.g. `192.168.1.42`) |
   | Port | `19132` |

Your Bedrock username will appear in-game with a `.` prefix (e.g. `.YourGamerTag`).
That is Floodgate keeping Bedrock names from colliding with Java names — it is expected.

### Confirming you and Aiden are in the same world

Any one of these is sufficient:

- Type `!status` in Minecraft chat. Aiden replies with its health, food and coordinates.
- Type `!come`. Aiden walks to you.
- Press **T** equivalent (the chat bubble) and run `/list` — both names appear.
- Compare coordinates: enable **Show Coordinates**, then check Aiden's `!status` position
  against your own. Walk toward it and you will see the bot standing there.

---

## Chat commands

Issue these in Minecraft chat. They work from Bedrock and Java clients alike.

| Command | Behaviour |
|---|---|
| `!come` | Walks to the player who issued it |
| `!follow` | Continuously follows that player until stopped |
| `!stop` | Cancels the current action |
| `!status` | Replies in chat with health, food, position, current action |
| `!jump` | Jumps once |
| `!look` | Describes nearby players, entities and blocks **in the terminal** |
| `!help` | Lists every command |

The bot also prints position, health, hunger and inventory to its terminal on spawn and
every 30 seconds (`STATUS_INTERVAL_MS`).

---

## Security: what offline mode actually means

`server.properties` sets **`online-mode=false`**. This is required — Mineflayer has no
Minecraft account, and without it the bot cannot log in at all.

The consequence is real and worth stating plainly:

> With `online-mode=false`, the server does **not** verify anyone's identity.
> Anyone who can reach port 25565 can join as **any username**, including yours,
> with your inventory and your permissions.

This is acceptable **only** because the server never leaves your LAN. To keep it that way:

- **Do not port forward** 25565 or 19132 on your router.
- **Do not** place the Mac in your router's DMZ.
- **Do not** put this behind a tunnel (ngrok, playit.gg, Tailscale Funnel) and share it.
- Treat anyone on your Wi-Fi as someone who can join. On an untrusted network
  (a café, a shared flat), don't run it.

Also disabled deliberately: `enable-query`, `enable-rcon`, and Floodgate metrics — fewer
listening ports and no outbound telemetry from a machine on your home network.

`enforce-secure-profile=false` is also set. Offline-mode servers cannot produce signed chat
profiles, and without this neither the bot nor Bedrock players can chat.

If you ever want this reachable from outside your house, the correct answer is a proper
whitelist plus `online-mode=true` and a real proxy — not port forwarding this config.

---

## Project structure

```
├── server/
│   ├── bootstrap.sh              one-time setup: downloads, config, EULA
│   ├── start.sh                  launches Paper
│   └── scripts/
│       ├── resolve-version.mjs   picks a Paper+Mineflayer compatible version
│       ├── patch-yaml.mjs        edits generated plugin configs in place
│       └── lan-ip.sh             prints the Mac's LAN IPv4
│
├── agent/
│   ├── src/
│   │   ├── index.ts              entry point / process lifecycle
│   │   ├── bot.ts                connection, events, reconnect backoff
│   │   ├── config.ts             all env parsing lives here
│   │   ├── logger.ts             levelled logging
│   │   ├── types.ts              BotContext + Command contracts
│   │   ├── actions/              what the bot can *do*
│   │   │   ├── ActionManager.ts  current action + guaranteed teardown
│   │   │   └── movement.ts       pathfinder-backed movement
│   │   ├── commands/             how humans *ask* for it
│   │   │   ├── registry.ts       lookup + dispatch
│   │   │   └── come|follow|stop|status|jump|look|help.ts
│   │   └── world/                what the bot *perceives*
│   │       ├── observer.ts       vitals + surroundings
│   │       └── players.ts        robust player-entity resolution
│   ├── .env.example
│   └── tsconfig.json
│
└── scripts/start-all.sh          server + agent, one command
```

The split between `actions/`, `commands/` and `world/` is the important part. A command
parses *intent*; an action *performs* it; the world module *observes*. Phase 2 adds a fourth
caller — the model — that consumes `world/` and drives `actions/` through the same
`CommandRegistry`, without rewriting any of it.

### Configuration

`agent/.env` (created by `npm run setup` from `.env.example`) controls host, port, username,
command prefix, log level, reconnect backoff and status interval. Nothing else reads
`process.env` directly.

---

## Troubleshooting

**iPhone can't find the server.**
Check both devices are on the same Wi-Fi (not one on 5 GHz guest network). Confirm the
address with `npm run lan-ip` — it changes when your router hands out a new DHCP lease.
Check the server log for `Started Geyser on 0.0.0.0:19132`.

**macOS firewall prompt.**
Allow incoming connections for `java` when macOS asks. If you dismissed it:
**System Settings → Network → Firewall → Options**, and allow `java`.

**Aiden connects then immediately disconnects.**
Almost always a version mismatch. Check `MC_VERSION` in `agent/.env` against the version
Paper reports on startup, or set `MC_VERSION=auto` to let it negotiate.

**`!come` says "you're too far away".**
The bot only paths to players it can actually see. Move within render distance.

**Server won't start: "unsupported class file major version".**
Java is older than 21. `brew install --cask temurin@21`.

---

## Phase 2 and beyond (not built yet)

The seams are already in place for: OpenAI integration, autonomous decision-making, tool
calling, long-term memory, personalities, self-created goals, building, crafting, mining,
combat, exploration, multiple independent agents, and inter-agent communication.

Concretely: `BotContext` is the extension point for memory/goals/personality, `Command` is
already the shape a tool-call needs, `ActionManager` gives a planner safe interruption, and
`BotRunner` is per-agent — running several is constructing several.

---

## Other projects in this repository

This repo also contains `footprint/` and `wheelsniper/`, which are unrelated to the
Minecraft lab.
