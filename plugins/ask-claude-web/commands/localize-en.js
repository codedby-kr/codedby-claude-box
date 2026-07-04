#!/usr/bin/env node
/**
 * Switches this plugin back to English (reverses localize-ko).
 * Finds all .en.md and .en.mjs backups, restores each to its active file, then removes the backup.
 * Usage: node localize-en.js <plugin-root-dir>
 */
const fs = require('fs');
const path = require('path');

const root = (process.argv[2] || '').replace(/\\/g, '/');
if (!root) { console.error('Usage: node localize-en.js <plugin-root-dir>'); process.exit(1); }

const results = { restored: [], removed: [], skipped: [] };

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) { walk(full); continue; }
    const enMd = entry.name.match(/^(.+)\.en\.md$/);
    const enMjs = entry.name.match(/^(.+)\.en\.mjs$/);
    const m = enMd || enMjs;
    if (!m) continue;
    const ext = enMd ? '.md' : '.mjs';
    const base = path.join(dir, m[1] + ext).replace(/\\/g, '/');
    // Restore English backup → active file, then drop the backup to return to the pristine state.
    fs.copyFileSync(full, base);
    results.restored.push(base);
    fs.unlinkSync(full);
    results.removed.push(full);
  }
}

walk(root);
console.log(JSON.stringify(results, null, 2));
