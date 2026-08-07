#!/usr/bin/env bash
#
# Print this machine's LAN IPv4 address — the address your iPhone needs.
#
# Deliberately ignores loopback (127.x), Docker/VM bridges and self-assigned
# link-local addresses (169.254.x), none of which your phone can reach.
#
set -uo pipefail

pick_macos() {
  # Ask the routing table which interface actually reaches the internet, then
  # read that interface's address. This beats guessing en0 vs en1, which
  # differs between Wi-Fi-only and Ethernet-adapter Macs.
  local iface
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [[ -n "${iface:-}" ]]; then
    ipconfig getifaddr "$iface" 2>/dev/null && return 0
  fi
  # Fall back to scanning the usual Wi-Fi/Ethernet interfaces in order.
  local i
  for i in en0 en1 en2 en3 en4 en5; do
    ipconfig getifaddr "$i" 2>/dev/null && return 0
  done
  return 1
}

pick_linux() {
  ip -4 -oneline route get 1.1.1.1 2>/dev/null \
    | sed -nE 's/.* src ([0-9.]+).*/\1/p' | head -1
}

case "$(uname -s)" in
  Darwin) ip="$(pick_macos || true)" ;;
  *)      ip="$(pick_linux || true)" ;;
esac

# Last-resort generic scan, filtering out addresses your phone cannot use.
if [[ -z "${ip:-}" ]]; then
  ip="$(
    { ifconfig 2>/dev/null || ip -4 addr show 2>/dev/null; } \
      | grep -oE 'inet (addr:)?[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
      | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
      | grep -vE '^(127\.|169\.254\.)' \
      | head -1
  )"
fi

if [[ -z "${ip:-}" ]]; then
  echo "could not determine LAN IP" >&2
  exit 1
fi

echo "$ip"
