#!/usr/bin/env bash
#
# One-time setup for the local Minecraft AI lab.
#
#   - resolves a Minecraft version that Paper AND mineflayer both support
#   - downloads Paper, Geyser, Floodgate, ViaVersion, ViaBackwards
#   - accepts the EULA and writes a LAN-only, offline-mode configuration
#   - writes agent/.env so the bot matches the server
#
# Safe to re-run: it skips downloads that already exist unless --force.
#
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
PLUGINS_DIR="$SERVER_DIR/plugins"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# --- pretty output ----------------------------------------------------------
bold=$'\033[1m'; red=$'\033[31m'; grn=$'\033[32m'; ylw=$'\033[33m'; rst=$'\033[0m'
say()  { printf '%s==>%s %s\n' "$bold" "$rst" "$*"; }
ok()   { printf '  %s✓%s %s\n' "$grn" "$rst" "$*"; }
warn() { printf '  %s!%s %s\n' "$ylw" "$rst" "$*"; }
die()  { printf '\n%sERROR:%s %s\n' "$red" "$rst" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. Dependency checks
# ---------------------------------------------------------------------------
say "Checking dependencies"

command -v java >/dev/null 2>&1 || die \
"Java is not installed.

  Install it with Homebrew:
      brew install --cask temurin@21

  If you do not have Homebrew:
      /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"

  Then re-run this script."

# Paper 1.21+ and Geyser both require Java 21 or newer.
JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
[[ "$JAVA_MAJOR" =~ ^[0-9]+$ ]] || die "Could not parse the Java version from: $(java -version 2>&1 | head -1)"
(( JAVA_MAJOR >= 21 )) || die \
"Java $JAVA_MAJOR found, but Paper and Geyser need Java 21 or newer.

  Install it with:  brew install --cask temurin@21"
ok "Java $JAVA_MAJOR"

command -v node >/dev/null 2>&1 || die \
"Node.js is not installed.

  Install it with:  brew install node"
NODE_MAJOR="$(node -v | sed -E 's/v([0-9]+).*/\1/')"
(( NODE_MAJOR >= 18 )) || die "Node $NODE_MAJOR found, but Node 18+ is required. Try: brew install node"
ok "Node $(node -v)"

command -v npm >/dev/null 2>&1 || die "npm is not installed (it normally ships with Node)."
ok "npm $(npm -v)"

command -v curl >/dev/null 2>&1 || die "curl is required but was not found."

# The version resolver reads minecraft-data out of the agent workspace, so the
# agent's dependencies must be installed before we can resolve a version.
if [[ ! -d "$REPO_DIR/agent/node_modules/minecraft-data" ]]; then
  say "Installing agent dependencies (needed to determine version compatibility)"
  ( cd "$REPO_DIR/agent" && npm install --no-audit --no-fund )
fi
ok "agent dependencies present"

# ---------------------------------------------------------------------------
# 2. Resolve a mutually-supported Minecraft version
# ---------------------------------------------------------------------------
say "Resolving a Minecraft version supported by BOTH Paper and mineflayer"
RESOLVED="$(node "$SERVER_DIR/scripts/resolve-version.mjs")" || die \
"Could not resolve a Minecraft version.

  This usually means papermc.io was unreachable. Check your internet
  connection and try again."

MC_VERSION="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version)' "$RESOLVED")"
PAPER_BUILD="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).build))' "$RESOLVED")"
PAPER_URL="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).url)' "$RESOLVED")"
ok "Minecraft $MC_VERSION (Paper build $PAPER_BUILD)"

# ---------------------------------------------------------------------------
# 3. Downloads
# ---------------------------------------------------------------------------
mkdir -p "$PLUGINS_DIR"

# fetch <url> <destination> <label>
fetch() {
  local url="$1" dest="$2" label="$3"
  if [[ -f "$dest" && $FORCE -eq 0 ]]; then
    ok "$label already present ($(basename "$dest")) — use --force to re-download"
    return 0
  fi
  printf '  downloading %s…\n' "$label"
  curl -fsSL --retry 3 --retry-delay 2 -o "$dest.part" "$url" \
    || die "Failed to download $label from $url"
  mv "$dest.part" "$dest"
  ok "$label"
}

# Resolve the newest GitHub release asset matching a filename pattern.
gh_latest_asset() {
  local repo="$1" pattern="$2"
  curl -fsSL "https://api.github.com/repos/$repo/releases/latest" \
    | node -e '
        let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
          const re=new RegExp(process.argv[1]);
          const a=(JSON.parse(d).assets||[]).find(x=>re.test(x.name));
          if(!a){process.stderr.write("no asset matching "+process.argv[1]+"\n");process.exit(1)}
          process.stdout.write(a.browser_download_url);
        })' "$pattern"
}

say "Downloading Paper $MC_VERSION"
fetch "$PAPER_URL" "$SERVER_DIR/paper.jar" "Paper server"

say "Downloading plugins"
# Geyser + Floodgate: "latest" always tracks the newest Bedrock protocol, which
# is what we want — Bedrock clients auto-update and cannot be pinned.
fetch "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot" \
      "$PLUGINS_DIR/Geyser-Spigot.jar" "Geyser"
fetch "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot" \
      "$PLUGINS_DIR/floodgate-spigot.jar" "Floodgate"

# ViaVersion lets Geyser's newer emulated Java client connect to our slightly
# older server. ViaBackwards covers the reverse direction.
VV_URL="$(gh_latest_asset "ViaVersion/ViaVersion" '^ViaVersion-.*\.jar$')" \
  || die "Could not find a ViaVersion release asset on GitHub."
fetch "$VV_URL" "$PLUGINS_DIR/ViaVersion.jar" "ViaVersion"

VB_URL="$(gh_latest_asset "ViaVersion/ViaBackwards" '^ViaBackwards-.*\.jar$')" \
  || die "Could not find a ViaBackwards release asset on GitHub."
fetch "$VB_URL" "$PLUGINS_DIR/ViaBackwards.jar" "ViaBackwards"

# ---------------------------------------------------------------------------
# 4. EULA + server configuration
# ---------------------------------------------------------------------------
say "Writing configuration"

# Accepting the Minecraft EULA (https://aka.ms/MinecraftEULA) on your behalf,
# which is what you asked for by running this bootstrap.
cat > "$SERVER_DIR/eula.txt" <<EOF
# Minecraft EULA accepted by server/bootstrap.sh
# https://aka.ms/MinecraftEULA
eula=true
EOF
ok "EULA accepted"

# server.properties is only written if absent, so re-running never clobbers
# world settings you have since tuned by hand.
if [[ -f "$SERVER_DIR/server.properties" && $FORCE -eq 0 ]]; then
  warn "server.properties already exists — leaving it alone (use --force to reset)"
else
  cat > "$SERVER_DIR/server.properties" <<EOF
# ---------------------------------------------------------------------------
# LOCAL LAN DEVELOPMENT SERVER — NOT FOR INTERNET EXPOSURE
#
# online-mode=false disables Mojang account verification. It is required here
# because the Mineflayer bot has no Minecraft account. The consequence is that
# ANYONE who can reach this port can join as ANY username, including yours.
# That is acceptable only because this server stays on your LAN: do not port
# forward it, and do not place it in your router's DMZ.
# ---------------------------------------------------------------------------
online-mode=false

# Offline mode cannot produce signed chat profiles; leaving this on would stop
# the bot (and Bedrock players) from chatting.
enforce-secure-profile=false

# Empty server-ip binds all interfaces so your iPhone can reach it over Wi-Fi.
server-ip=
server-port=25565

motd=Minecraft AI Lab (LAN only)
max-players=10
level-name=world
gamemode=survival
difficulty=easy
force-gamemode=false
pvp=true
spawn-protection=0
allow-flight=true
view-distance=10
simulation-distance=10
enable-command-block=false
white-list=false
allow-nether=true
spawn-monsters=true
network-compression-threshold=256

# Query/RCON stay off: fewer listening ports on a machine on your home network.
enable-query=false
enable-rcon=false
EOF
  ok "server.properties (offline-mode, LAN-only)"
fi

# ---------------------------------------------------------------------------
# 4b. First run — let the plugins generate their own configs
#
# Geyser and Floodgate own their config schemas, including a `config-version`
# that drives their migration logic. Hand-writing a full config means guessing
# at a schema that changes between releases, and a wrong guess stops the plugin
# loading entirely. So we start the server once, let each plugin write its own
# defaults (and generate Floodgate's key.pem), then patch only what we need.
#
# This also generates the world, so the first `npm run start:all` is quick.
# ---------------------------------------------------------------------------
GEYSER_CONFIG="$PLUGINS_DIR/Geyser-Spigot/config.yml"
FLOODGATE_CONFIG="$PLUGINS_DIR/floodgate/config.yml"

if [[ -f "$GEYSER_CONFIG" && $FORCE -eq 0 ]]; then
  ok "plugin configs already generated"
else
  say "Starting the server once so plugins generate their configs"
  echo "    (first run also generates the world — this can take a few minutes)"

  FIRSTRUN_LOG="$SERVER_DIR/logs/bootstrap-firstrun.log"
  mkdir -p "$SERVER_DIR/logs"
  : > "$FIRSTRUN_LOG"

  ( cd "$SERVER_DIR" && java -Xms1G -Xmx2G -jar paper.jar --nogui >> "$FIRSTRUN_LOG" 2>&1 ) &
  FIRSTRUN_PID=$!

  DEADLINE=$(( SECONDS + 600 ))
  READY=0
  while (( SECONDS < DEADLINE )); do
    if grep -q 'Done (.*)! For help' "$FIRSTRUN_LOG" 2>/dev/null; then READY=1; break; fi
    if ! kill -0 "$FIRSTRUN_PID" 2>/dev/null; then break; fi
    sleep 2
  done

  # Paper treats SIGTERM as a graceful shutdown: it saves the world and stops.
  if kill -0 "$FIRSTRUN_PID" 2>/dev/null; then
    kill -TERM "$FIRSTRUN_PID" 2>/dev/null || true
    wait "$FIRSTRUN_PID" 2>/dev/null || true
  fi

  if (( READY == 0 )); then
    echo >&2
    tail -40 "$FIRSTRUN_LOG" >&2
    die "The server did not finish starting. Full log: $FIRSTRUN_LOG"
  fi
  ok "plugin configs generated"
fi

# --- Geyser: Bedrock listener + Floodgate auth ------------------------------
if [[ -f "$GEYSER_CONFIG" ]]; then
  say "Configuring Geyser"
  # 0.0.0.0 listens on every interface so the iPhone can reach it over Wi-Fi.
  # 19132/UDP is the Bedrock default, which also lets the server show up
  # automatically on the same LAN.
  # auth-type: floodgate is what allows Bedrock players in with no Java account.
  node "$SERVER_DIR/scripts/patch-yaml.mjs" "$GEYSER_CONFIG" \
    "bedrock.address=0.0.0.0" \
    "bedrock.port=19132" \
    "bedrock.motd1=Minecraft AI Lab" \
    "bedrock.motd2=LAN only" \
    "bedrock.server-name=Minecraft AI Lab" \
    "remote.address=auto" \
    "remote.port=25565" \
    "remote.auth-type=floodgate" \
    "show-coordinates=true" \
    "log-player-ip-addresses=false"
  ok "Geyser: Bedrock on UDP 19132, auth-type floodgate"
else
  warn "Geyser config not found at $GEYSER_CONFIG — did the Geyser jar load?"
fi

# --- Floodgate --------------------------------------------------------------
# Defaults are already correct for our purposes: it generates key.pem (which
# Geyser reads automatically, since both plugins share this server) and prefixes
# Bedrock names with "." so they can never collide with a Java username.
# We only turn off the outbound metrics ping.
if [[ -f "$FLOODGATE_CONFIG" ]]; then
  say "Configuring Floodgate"
  node "$SERVER_DIR/scripts/patch-yaml.mjs" "$FLOODGATE_CONFIG" \
    "metrics.enabled=false" || true
  if [[ -f "$PLUGINS_DIR/floodgate/key.pem" ]]; then
    ok "Floodgate: key.pem generated, Bedrock auth ready"
  else
    warn "Floodgate key.pem not found — Bedrock logins will fail until it exists"
  fi
else
  warn "Floodgate config not found at $FLOODGATE_CONFIG — did the Floodgate jar load?"
fi

# ---------------------------------------------------------------------------
# 5. Point the agent at this server
# ---------------------------------------------------------------------------
say "Configuring the agent"
ENV_FILE="$REPO_DIR/agent/.env"
if [[ -f "$ENV_FILE" && $FORCE -eq 0 ]]; then
  warn "agent/.env already exists — leaving it alone (use --force to reset)"
else
  sed -e "s/^MC_VERSION=.*/MC_VERSION=$MC_VERSION/" \
      "$REPO_DIR/agent/.env.example" > "$ENV_FILE"
  ok "agent/.env written (MC_VERSION=$MC_VERSION)"
fi

# ---------------------------------------------------------------------------
# 6. Report
# ---------------------------------------------------------------------------
LAN_IP="$("$SERVER_DIR/scripts/lan-ip.sh" 2>/dev/null || echo "")"

cat <<EOF

${bold}Setup complete.${rst}

  Minecraft version : $MC_VERSION (Paper build $PAPER_BUILD)
  Java port         : 25565  (Mineflayer bot, Java Edition)
  Bedrock port      : 19132/UDP  (your iPhone)
  Auth              : offline-mode, Floodgate for Bedrock
  Your Mac's LAN IP : ${LAN_IP:-<could not detect — run server/scripts/lan-ip.sh>}

  Start everything with:   ${bold}npm run start:all${rst}

EOF
