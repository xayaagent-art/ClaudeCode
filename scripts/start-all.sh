#!/usr/bin/env bash
#
# Start the Paper server, wait until it is actually ready, then start Aiden.
# Ctrl-C stops both.
#
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_LOG="$REPO_DIR/server/logs/start-all.log"

bold=$'\033[1m'; grn=$'\033[32m'; red=$'\033[31m'; ylw=$'\033[33m'; rst=$'\033[0m'

if [[ ! -f "$REPO_DIR/server/paper.jar" ]]; then
  echo "${red}paper.jar not found.${rst} Run ${bold}npm run setup${rst} first." >&2
  exit 1
fi

mkdir -p "$(dirname "$SERVER_LOG")"
: > "$SERVER_LOG"

SERVER_PID=""
AGENT_PID=""

cleanup() {
  echo
  echo "${bold}==> Shutting down${rst}"
  # Stop the agent first so it disconnects cleanly instead of being cut off
  # mid-session by the server going away.
  [[ -n "$AGENT_PID" ]]  && kill "$AGENT_PID"  2>/dev/null
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "${bold}==> Starting Paper server${rst}"
"$REPO_DIR/server/start.sh" 2>&1 | tee "$SERVER_LOG" &
SERVER_PID=$!

# Paper prints `Done (12.345s)! For help, type "help"` once it is accepting
# connections. Polling the log is more reliable than sleeping a fixed time,
# which varies hugely between a first run (world generation) and later runs.
echo "==> Waiting for the server to finish starting (first run generates a world, this can take a few minutes)…"
DEADLINE=$(( SECONDS + 600 ))
until grep -q 'Done (.*)! For help' "$SERVER_LOG" 2>/dev/null; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "${red}Server exited before it finished starting. Last lines:${rst}" >&2
    tail -30 "$SERVER_LOG" >&2
    exit 1
  fi
  if (( SECONDS > DEADLINE )); then
    echo "${red}Timed out waiting for the server.${rst} See $SERVER_LOG" >&2
    exit 1
  fi
  sleep 2
done
echo "${grn}==> Server is up${rst}"

# Report plugin status so a silent Geyser/Floodgate failure is obvious rather
# than showing up later as "my iPhone can't find the server".
check_plugin() {
  local name="$1" pattern="$2"
  if grep -qi "$pattern" "$SERVER_LOG"; then
    echo "    ${grn}✓${rst} $name loaded"
  else
    echo "    ${ylw}!${rst} $name did not report loading — check $SERVER_LOG"
  fi
}
check_plugin "Geyser"      "Started Geyser on\|Geyser.*enabled\|\[Geyser"
check_plugin "Floodgate"   "floodgate"
check_plugin "ViaVersion"  "ViaVersion"

LAN_IP="$("$REPO_DIR/server/scripts/lan-ip.sh" 2>/dev/null || echo "")"
echo
echo "${bold}==> Connect from your iPhone${rst}"
echo "    Minecraft -> Play -> Servers -> Add Server"
echo "      Server Name    : Minecraft AI Lab"
echo "      Server Address : ${LAN_IP:-<run server/scripts/lan-ip.sh>}"
echo "      Port           : 19132"
echo

echo "${bold}==> Starting Aiden${rst}"
( cd "$REPO_DIR/agent" && npm start ) &
AGENT_PID=$!

# Keep the script in the foreground so Ctrl-C reaches the trap.
wait
