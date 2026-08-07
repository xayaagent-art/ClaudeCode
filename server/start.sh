#!/usr/bin/env bash
#
# Start the Paper server. Run server/bootstrap.sh first.
#
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SERVER_DIR"

if [[ ! -f paper.jar ]]; then
  echo "paper.jar not found — run ./server/bootstrap.sh first." >&2
  exit 1
fi

# Heap size. 2G is comfortable for a handful of players plus a bot; override
# with MC_MEMORY=4G if you start running several agents.
MEM="${MC_MEMORY:-2G}"

echo "==> Starting Paper (heap ${MEM})"
echo "    Java clients : 25565/TCP"
echo "    Bedrock/iOS  : 19132/UDP  (via Geyser)"
echo

# --nogui keeps it in the terminal so `npm run start:all` can read the log.
exec java \
  -Xms"$MEM" -Xmx"$MEM" \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+AlwaysPreTouch \
  -Dusing.aikars.flags=https://mcflags.emc.gs \
  -jar paper.jar --nogui
