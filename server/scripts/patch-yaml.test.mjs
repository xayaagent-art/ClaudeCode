import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { patch, setKey } from './patch-yaml.mjs';

// Abridged but structurally faithful sample of a generated Geyser config.
const GEYSER = `# Geyser default config
bedrock:
  # The IP address that will listen for connections
  address: 0.0.0.0
  # The port that will listen for connections
  port: 19132
  clone-remote-port: false
  motd1: "Geyser"
remote:
  # The IP address of the remote Java server
  address: auto
  port: 25565
  # Can be offline, online, or floodgate.
  auth-type: online
show-coordinates: false
config-version: 4
`;

const lines = (text) => text.split('\n');

describe('setKey', () => {
  it('changes a nested value without touching its comment', () => {
    const result = setKey(lines(GEYSER), 'remote.auth-type', 'floodgate');
    assert.equal(result.ok, true);
    const out = result.lines.join('\n');
    assert.match(out, /^ {2}auth-type: floodgate$/m);
    assert.match(out, /# Can be offline, online, or floodgate\./);
  });

  it('distinguishes identically-named keys in different blocks', () => {
    // `port` exists under BOTH bedrock and remote. Editing one must not touch
    // the other — getting this wrong would silently break the Bedrock listener.
    const result = setKey(lines(GEYSER), 'remote.port', '25599');
    assert.equal(result.ok, true);
    const out = result.lines.join('\n');
    assert.match(out, /^ {2}port: 19132$/m); // bedrock.port untouched
    assert.match(out, /^ {2}port: 25599$/m); // remote.port changed
  });

  it('edits a top-level scalar', () => {
    const result = setKey(lines(GEYSER), 'show-coordinates', 'true');
    assert.equal(result.ok, true);
    assert.match(result.lines.join('\n'), /^show-coordinates: true$/m);
  });

  it('reports a missing key rather than inventing one', () => {
    const result = setKey(lines(GEYSER), 'nope.missing', '1');
    assert.equal(result.ok, false);
    assert.match(result.reason, /not found/);
  });

  it('does not match a nested key as if it were top-level', () => {
    // `address` only exists nested; asking for it at the top level must fail.
    const result = setKey(lines(GEYSER), 'address', '1.2.3.4');
    assert.equal(result.ok, false);
  });
});

describe('patch', () => {
  it('applies several assignments and preserves config-version', () => {
    const { text, applied, missing } = patch(GEYSER, [
      'bedrock.port=19132',
      'remote.auth-type=floodgate',
      'show-coordinates=true',
    ]);

    assert.deepEqual(applied, ['bedrock.port', 'remote.auth-type', 'show-coordinates']);
    assert.deepEqual(missing, []);
    // config-version drives plugin migration logic — we must never alter it.
    assert.match(text, /^config-version: 4$/m);
  });

  it('collects missing keys as warnings instead of throwing', () => {
    const { applied, missing } = patch(GEYSER, ['remote.auth-type=floodgate', 'gone.key=x']);
    assert.deepEqual(applied, ['remote.auth-type']);
    assert.equal(missing.length, 1);
  });

  it('rejects a malformed assignment', () => {
    assert.throws(() => patch(GEYSER, ['no-equals-sign']), /Malformed assignment/);
  });
});
