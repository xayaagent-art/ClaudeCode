#!/usr/bin/env bash
#
# The only command you need: sets up on first run, then starts the Paper
# server and Aiden together. Ctrl-C stops both.
#
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$REPO/server/logs/run.log"

bold=$'\033[1m'; grn=$'\033[32m'; red=$'\033[31m'; ylw=$'\033[33m'; rst=$'\033[0m'

# First run does the whole install; later runs skip straight to launching.
if [[ ! -f "$REPO/server/paper.jar" ]]; then
  echo "${bold}==> First run: installing the server (this takes a few minutes)${rst}"
  bash "$REPO/server/setup.sh" || exit 1
fi

[[ -d "$REPO/bot/node_modules" ]] || ( cd "$REPO/bot" && npm install --no-audit --no-fund )

mkdir -p "$(dirname "$LOG")"
: > "$LOG"

SERVER_PID=""
BOT_PID=""
cleanup() {
  echo
  echo "${bold}==> Stopping${rst}"
  [[ -n "$BOT_PID" ]]    && kill "$BOT_PID"    2>/dev/null
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "${bold}==> Starting Minecraft server${rst}"
bash "$REPO/server/start.sh" 2>&1 | tee "$LOG" &
SERVER_PID=$!

# Poll the log rather than sleeping: startup time varies a lot between a
# freshly generated world and a warm one.
echo "==> Waiting for the server to be ready…"
DEADLINE=$(( SECONDS + 600 ))
until grep -q 'Done (.*)! For help' "$LOG" 2>/dev/null; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "${red}Server exited during startup. Last lines:${rst}" >&2
    tail -30 "$LOG" >&2
    exit 1
  fi
  (( SECONDS > DEADLINE )) && { echo "${red}Timed out. See $LOG${rst}" >&2; exit 1; }
  sleep 2
done
echo "${grn}==> Server ready${rst}"

# Surface a silent Geyser failure now, rather than as "my iPhone can't connect".
if grep -qi "Started Geyser on" "$LOG"; then
  echo "    ${grn}✓${rst} Geyser listening on UDP 19132"
else
  echo "    ${ylw}!${rst} Geyser did not report starting — check $LOG"
fi

IP="$(bash "$REPO/server/scripts/lan-ip.sh" 2>/dev/null || echo "")"
echo
echo "${bold}=========================================${rst}"
echo "${bold} On your iPhone: Minecraft > Play >${rst}"
echo "${bold} Servers > Add Server${rst}"
echo
echo "   Server Name    : Aiden Lab"
echo "   Server Address : ${IP:-<run: npm run ip>}"
echo "   Port           : 19132"
echo "${bold}=========================================${rst}"
echo

echo "${bold}==> Starting Aiden${rst}"
( cd "$REPO/bot" && node bot.js ) &
BOT_PID=$!

wait
