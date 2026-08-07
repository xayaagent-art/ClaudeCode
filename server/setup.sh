#!/usr/bin/env bash
#
# One-time install: downloads Paper + Geyser + Floodgate + ViaVersion,
# configures them for LAN-only play, and accepts the EULA.
# Re-running is safe; it skips anything already present.
#
set -euo pipefail

SERVER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SERVER/.." && pwd)"
PLUGINS="$SERVER/plugins"

bold=$'\033[1m'; red=$'\033[31m'; grn=$'\033[32m'; ylw=$'\033[33m'; rst=$'\033[0m'
say()  { printf '%s==>%s %s\n' "$bold" "$rst" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$grn" "$rst" "$*"; }
warn() { printf '  %s!%s %s\n' "$ylw" "$rst" "$*"; }
die()  { printf '\n%sERROR:%s %s\n' "$red" "$rst" "$*" >&2; exit 1; }

# --- dependencies -----------------------------------------------------------
say "Checking dependencies"

command -v java >/dev/null 2>&1 || die \
"Java is missing. Install it with:

    brew install --cask temurin@21

(If you don't have Homebrew:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\")"

JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
[[ "$JAVA_MAJOR" =~ ^[0-9]+$ ]] || die "Could not read the Java version from: $(java -version 2>&1 | head -1)"
(( JAVA_MAJOR >= 21 )) || die "Java $JAVA_MAJOR found, but Paper and Geyser need Java 21+.
Install it with:  brew install --cask temurin@21"
ok "Java $JAVA_MAJOR"

command -v node >/dev/null 2>&1 || die "Node.js is missing. Install it with:  brew install node"
ok "Node $(node -v)"
command -v curl >/dev/null 2>&1 || die "curl is required but was not found."

# The version resolver reads minecraft-data from the bot's node_modules.
[[ -d "$REPO/bot/node_modules" ]] || ( cd "$REPO/bot" && npm install --no-audit --no-fund )
ok "bot dependencies"

# --- pick a version both Paper and Mineflayer support -----------------------
# Geyser always emulates the NEWEST Java client, but Mineflayer only speaks
# versions minecraft-data ships, which lags. So we run the server at the newest
# version Mineflayer supports and let ViaVersion bridge Geyser down to it.
say "Resolving a compatible Minecraft version"
INFO="$(node "$SERVER/scripts/resolve-version.mjs")" \
  || die "Could not reach papermc.io to resolve a version. Check your internet connection."
VERSION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version)' "$INFO")"
PAPER_URL="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).url)' "$INFO")"
ok "Minecraft $VERSION"

# --- downloads --------------------------------------------------------------
mkdir -p "$PLUGINS"

fetch() { # <url> <dest> <label>
  [[ -f "$2" ]] && { ok "$3 (already downloaded)"; return 0; }
  printf '  downloading %s…\n' "$3"
  curl -fsSL --retry 3 --retry-delay 2 -o "$2.part" "$1" || die "Failed to download $3"
  mv "$2.part" "$2"
  ok "$3"
}

gh_asset() { # <owner/repo> <regex>
  curl -fsSL "https://api.github.com/repos/$1/releases/latest" | node -e '
    let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const re=new RegExp(process.argv[1]);
      const a=(JSON.parse(d).assets||[]).find(x=>re.test(x.name));
      if(!a){process.exit(1)}
      process.stdout.write(a.browser_download_url)})' "$2"
}

say "Downloading server and plugins"
fetch "$PAPER_URL" "$SERVER/paper.jar" "Paper $VERSION"
fetch "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot" \
      "$PLUGINS/Geyser-Spigot.jar" "Geyser"
fetch "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot" \
      "$PLUGINS/floodgate-spigot.jar" "Floodgate"
fetch "$(gh_asset ViaVersion/ViaVersion '^ViaVersion-.*\.jar$')"   "$PLUGINS/ViaVersion.jar"   "ViaVersion"
fetch "$(gh_asset ViaVersion/ViaBackwards '^ViaBackwards-.*\.jar$')" "$PLUGINS/ViaBackwards.jar" "ViaBackwards"

# --- EULA + server.properties ----------------------------------------------
say "Writing configuration"
printf '# https://aka.ms/MinecraftEULA\neula=true\n' > "$SERVER/eula.txt"
ok "EULA accepted"

if [[ ! -f "$SERVER/server.properties" ]]; then
  cat > "$SERVER/server.properties" <<EOF
# LOCAL LAN SERVER — DO NOT PORT FORWARD.
#
# online-mode=false disables Mojang account checks. It is required because the
# Mineflayer bot has no Minecraft account. The cost: anyone who can reach this
# port can join as ANY username. Safe only on a trusted LAN.
online-mode=false

# Offline mode cannot sign chat, and without this nobody can talk.
enforce-secure-profile=false

server-ip=
server-port=25565
motd=Aiden Lab
max-players=10
level-name=world

# Peaceful so the bot (and you) can't be killed while testing.
gamemode=survival
difficulty=peaceful
spawn-monsters=false

spawn-protection=0
allow-flight=true
view-distance=10
simulation-distance=10
white-list=false
enable-command-block=false
enable-query=false
enable-rcon=false
EOF
  ok "server.properties (offline-mode, peaceful, LAN-only)"
else
  warn "server.properties exists — leaving it alone"
fi

# --- first run: let the plugins write their own configs ---------------------
# Geyser and Floodgate own their config schemas (including a config-version
# that drives migrations), so we let them generate defaults rather than
# hand-writing a config that would break on the next release.
GEYSER_CFG="$PLUGINS/Geyser-Spigot/config.yml"
if [[ ! -f "$GEYSER_CFG" ]]; then
  say "Starting the server once to generate plugin configs and the world"
  echo "    (a few minutes on first run)"
  FIRSTLOG="$SERVER/logs/setup-firstrun.log"
  mkdir -p "$SERVER/logs"; : > "$FIRSTLOG"

  ( cd "$SERVER" && java -Xms1G -Xmx2G -jar paper.jar --nogui >> "$FIRSTLOG" 2>&1 ) &
  PID=$!
  DEADLINE=$(( SECONDS + 600 )); READY=0
  while (( SECONDS < DEADLINE )); do
    grep -q 'Done (.*)! For help' "$FIRSTLOG" 2>/dev/null && { READY=1; break; }
    kill -0 "$PID" 2>/dev/null || break
    sleep 2
  done
  # Paper treats SIGTERM as a graceful shutdown (saves the world, stops).
  kill -0 "$PID" 2>/dev/null && { kill -TERM "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true; }
  (( READY == 1 )) || { tail -40 "$FIRSTLOG" >&2; die "Server failed to start. Log: $FIRSTLOG"; }
  ok "plugin configs and world generated"
fi

# --- point Geyser at Bedrock + Floodgate ------------------------------------
if [[ -f "$GEYSER_CFG" ]]; then
  say "Configuring Geyser"
  node "$SERVER/scripts/patch-yaml.mjs" "$GEYSER_CFG" \
    "bedrock.address=0.0.0.0" \
    "bedrock.port=19132" \
    "bedrock.motd1=Aiden Lab" \
    "bedrock.server-name=Aiden Lab" \
    "remote.address=auto" \
    "remote.port=25565" \
    "remote.auth-type=floodgate"
  ok "Bedrock listener on UDP 19132, Floodgate auth"
else
  warn "Geyser config not found — did the Geyser jar load? See $SERVER/logs/"
fi

[[ -f "$PLUGINS/floodgate/key.pem" ]] && ok "Floodgate key generated" \
  || warn "Floodgate key.pem missing — Bedrock logins will fail"

printf '\n%sSetup complete.%s Run: %snpm start%s\n\n' "$bold" "$rst" "$bold" "$rst"
