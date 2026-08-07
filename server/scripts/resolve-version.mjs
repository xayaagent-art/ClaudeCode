#!/usr/bin/env node
/**
 * Work out which Minecraft version this stack should run.
 *
 * The constraint that actually matters:
 *
 *   - Geyser always emulates the NEWEST Java client. It can talk to an older
 *     server as long as ViaVersion is installed (which bootstrap.sh does).
 *   - Mineflayer can only speak versions that `minecraft-data` ships. It
 *     typically lags the newest Java release by a few weeks.
 *
 * So the server version is driven by Mineflayer: we pick the NEWEST version
 * that BOTH Paper and Mineflayer support, and let ViaVersion bridge Geyser's
 * newer client down to it. That keeps the bot on a native, well-tested
 * protocol path instead of pushing it through translation.
 *
 * Output: a single line of JSON on stdout, so bootstrap.sh can consume it.
 *   {"version":"1.21.4","build":123,"url":"https://...","source":"fill-v3"}
 */

const PAPER_V3 = 'https://fill.papermc.io/v3/projects/paper';
const PAPER_V2 = 'https://api.papermc.io/v2/projects/paper';
const UA = { 'User-Agent': 'minecraft-ai-lab/1.0 (local dev bootstrap)' };

/** Versions this machine's mineflayer/minecraft-data can actually speak. */
async function mineflayerVersions() {
  // Resolved from the bot workspace so we read the SAME copy the bot uses.
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../../bot/package.json', import.meta.url));
  const mcData = require('minecraft-data');
  // `supportedVersions.pc` is ordered oldest -> newest, which is exactly the
  // order we want to search backwards through.
  return mcData.supportedVersions.pc;
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

/** Newest Paper build for a version, via the current v3 "fill" API. */
async function paperV3(version) {
  const builds = await getJson(`${PAPER_V3}/versions/${version}/builds`);
  const newest = Array.isArray(builds) ? builds[0] : null;
  if (!newest) return null;
  const download = newest.downloads?.['server:default'] ?? newest.downloads?.application;
  if (!download?.url) return null;
  return { build: newest.id ?? newest.build, url: download.url, source: 'fill-v3' };
}

/** Newest Paper build for a version, via the legacy v2 API. */
async function paperV2(version) {
  const data = await getJson(`${PAPER_V2}/versions/${version}/builds`);
  const newest = data.builds?.[data.builds.length - 1];
  if (!newest) return null;
  const name = newest.downloads?.application?.name;
  if (!name) return null;
  return {
    build: newest.build,
    url: `${PAPER_V2}/versions/${version}/builds/${newest.build}/downloads/${name}`,
    source: 'api-v2',
  };
}

async function paperVersionList() {
  try {
    const data = await getJson(PAPER_V3);
    // v3 groups versions by major release; flatten whatever shape we get.
    if (Array.isArray(data.versions)) return data.versions.map((v) => v.id ?? v);
    if (data.versions && typeof data.versions === 'object') {
      return Object.values(data.versions).flat();
    }
  } catch {
    // fall through to v2
  }
  const data = await getJson(PAPER_V2);
  return data.versions ?? [];
}

async function main() {
  const supported = await mineflayerVersions();
  const paperVersions = new Set(await paperVersionList());

  // Walk newest -> oldest and take the first version Paper also publishes.
  for (let i = supported.length - 1; i >= 0; i--) {
    const version = supported[i];
    if (!paperVersions.has(version)) continue;

    // A version can be listed with no usable build yet; try the next one down.
    let info = null;
    try {
      info = (await paperV3(version)) ?? (await paperV2(version));
    } catch {
      info = null;
    }
    if (!info) continue;

    process.stdout.write(JSON.stringify({ version, ...info }) + '\n');
    return;
  }

  throw new Error(
    'No Minecraft version is supported by both Paper and this mineflayer install.',
  );
}

main().catch((err) => {
  process.stderr.write(`resolve-version failed: ${err.message}\n`);
  process.exit(1);
});
