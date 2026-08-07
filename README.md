# Aiden — a Minecraft bot you can see from your iPhone

Minimal proof of concept: a Minecraft server on your Mac, joined from **Minecraft Bedrock on
iOS**, with a **Mineflayer bot named Aiden** wandering around next to you.

No AI, no LLM, no database. One command to start everything.

```
iPhone (Bedrock)  --UDP 19132-->  Geyser + Floodgate
                                        |
                                  Paper server  <--TCP 25565--  Aiden (Mineflayer)
```

Everything except the iPhone runs on your Mac. Nothing is exposed to the internet.

---

## Setup

**1. Install Java 21** (Paper and Geyser both require it):

```bash
brew install --cask temurin@21
```

<sub>No Homebrew? `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` — and `brew install node` if you don't have Node.</sub>

**2. Start everything:**

```bash
npm start
```

The first run installs Paper, Geyser, Floodgate and ViaVersion, generates the world, and
starts the server plus Aiden. It takes a few minutes. Every run after that is fast.

When macOS asks whether `java` may accept incoming connections, **click Allow** — if you
dismiss it, your iPhone silently won't be able to connect.

---

## Join from your iPhone

`npm start` prints the exact details when the server is ready. To get them any time:

```bash
npm run ip
```

Then on the iPhone: **Minecraft → Play → Servers → Add Server**

| Field | Value |
|---|---|
| Server Name | `Aiden Lab` |
| Server Address | the output of `npm run ip` (e.g. `192.168.1.42`) |
| Port | `19132` |

Your Bedrock name shows up in game with a `.` prefix (e.g. `.YourGamerTag`). That's Floodgate
keeping Bedrock names from colliding with Java names — expected, not a problem.

---

## What Aiden does

Left alone, every 5 seconds Aiden wanders to a random nearby spot, jumps, or looks around —
so you can tell at a glance that it's alive.

Type these in Minecraft chat:

| Command | Result |
|---|---|
| `!come` | Walks to you |
| `!follow` | Keeps following you |
| `!stop` | Stops and goes back to wandering |

If Aiden replies "I can't see you", you're outside its render distance — walk closer.

---

## Other commands

```bash
npm start      # everything (setup on first run, then server + Aiden)
npm run server # just the Minecraft server
npm run bot    # just Aiden (server must already be running)
npm run ip     # print your Mac's LAN IP
npm run setup  # re-run the installer
```

---

## Files

```
bot/bot.js                       the entire bot (~130 lines)
server/setup.sh                  downloads + configures everything
server/start.sh                  launches Paper
server/scripts/resolve-version.mjs   picks a Paper+Mineflayer compatible version
server/scripts/patch-yaml.mjs        edits generated plugin configs safely
server/scripts/lan-ip.sh             finds your Mac's LAN IP
scripts/start.sh                 the one-command launcher
```

### Why the version isn't hard-coded

Geyser always emulates the **newest** Java client, while Mineflayer only speaks versions
`minecraft-data` ships, which lags behind. There is usually **no version both support
natively**. So `resolve-version.mjs` picks the newest version Paper *and* Mineflayer both
support, and **ViaVersion** bridges Geyser's newer client down to it. That keeps the bot on a
native protocol path and puts the translation on the Geyser side, which already translates
heavily anyway.

---

## Security

The server runs with **`online-mode=false`**, which is required because Mineflayer has no
Minecraft account. This turns off identity verification completely:

> Anyone who can reach port 25565 can join as **any username**, including yours.

That's fine on your own Wi-Fi and nowhere else. So: **don't port forward** 25565 or 19132,
don't use your router's DMZ, and don't tunnel it (ngrok, playit.gg). Query and RCON are
turned off, and the world is set to peaceful so nothing kills you or the bot mid-test.
