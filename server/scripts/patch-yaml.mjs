#!/usr/bin/env node
/**
 * Set specific keys in a YAML file, in place, preserving comments and layout.
 *
 * Why not just write the whole config? Because Geyser and Floodgate own their
 * config schemas — including a `config-version` that drives their migration
 * logic. Hand-writing a full config means guessing at a schema that changes
 * between releases, and a wrong guess stops the plugin from loading at all.
 *
 * Instead we let each plugin generate its own defaults on first run, then
 * change only the handful of values this setup actually depends on.
 *
 * Usage:
 *   node patch-yaml.mjs <file> <dotted.key>=<value> [<dotted.key>=<value> ...]
 *
 * Only scalar values are supported, which is all we need.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const INDENT_OF = (line) => line.match(/^(\s*)/)[1].length;
const IS_SKIPPABLE = (line) => !line.trim() || line.trim().startsWith('#');

/**
 * @returns {{ok: true, lines: string[]} | {ok: false, reason: string}}
 */
export function setKey(lines, dottedPath, value) {
  const parts = dottedPath.split('.');
  let searchStart = 0;
  let searchEnd = lines.length;

  for (let p = 0; p < parts.length; p++) {
    const key = parts[p];
    let blockIndent = null;
    let found = -1;

    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i];
      if (IS_SKIPPABLE(line)) continue;
      const indent = INDENT_OF(line);

      // The first non-comment line fixes the indentation of this block.
      if (blockIndent === null) blockIndent = indent;
      // Dedent means we have walked out of the block entirely.
      if (indent < blockIndent) break;
      if (indent !== blockIndent) continue;

      const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:/);
      if (m && m[1] === key) {
        found = i;
        break;
      }
    }

    if (found === -1) return { ok: false, reason: `key not found: ${dottedPath} (at "${key}")` };

    // Last segment: rewrite the value, keeping the original indentation.
    if (p === parts.length - 1) {
      const indent = lines[found].match(/^(\s*)/)[1];
      const next = [...lines];
      next[found] = `${indent}${key}: ${value}`;
      return { ok: true, lines: next };
    }

    // Otherwise descend into this key's block.
    const parentIndent = INDENT_OF(lines[found]);
    searchStart = found + 1;
    searchEnd = lines.length;
    for (let i = found + 1; i < lines.length; i++) {
      if (IS_SKIPPABLE(lines[i])) continue;
      if (INDENT_OF(lines[i]) <= parentIndent) {
        searchEnd = i;
        break;
      }
    }
  }

  return { ok: false, reason: `unreachable for ${dottedPath}` };
}

/** Apply `key=value` pairs to a YAML string. Returns the new text. */
export function patch(text, assignments) {
  let lines = text.split('\n');
  const applied = [];
  const missing = [];

  for (const assignment of assignments) {
    const eq = assignment.indexOf('=');
    if (eq === -1) throw new Error(`Malformed assignment (expected key=value): ${assignment}`);
    const path = assignment.slice(0, eq);
    const value = assignment.slice(eq + 1);

    const result = setKey(lines, path, value);
    if (result.ok) {
      lines = result.lines;
      applied.push(path);
    } else {
      missing.push(result.reason);
    }
  }

  return { text: lines.join('\n'), applied, missing };
}

// --- CLI -------------------------------------------------------------------
// Requiring arguments as well as a direct invocation means importing this
// module — from the test suite, or a future script — can never exit the
// process or write to stderr as a side effect.
if (process.argv[1]?.endsWith('patch-yaml.mjs') && process.argv.length > 2) {
  const [file, ...assignments] = process.argv.slice(2);
  if (!file || assignments.length === 0) {
    process.stderr.write('usage: patch-yaml.mjs <file> <key=value> [...]\n');
    process.exit(2);
  }

  const original = readFileSync(file, 'utf8');
  const { text, applied, missing } = patch(original, assignments);
  writeFileSync(file, text);

  for (const key of applied) process.stdout.write(`    set ${key}\n`);
  // A missing key is a warning, not a failure: plugins rename keys between
  // versions, and the generated default is usually still workable.
  for (const reason of missing) process.stderr.write(`    warning: ${reason}\n`);
}
