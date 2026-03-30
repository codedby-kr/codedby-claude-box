#!/usr/bin/env node
/**
 * Switches this plugin to Korean.
 * Finds all .ko.md and .ko.mjs files, backs up English originals as .en.*, then replaces.
 * Usage: node localize-ko.js <plugin-root-dir>
 */
const fs = require('fs');
const path = require('path');

const root = (process.argv[2] || '').replace(/\\/g, '/');
if (!root) { console.error('Usage: node localize-ko.js <plugin-root-dir>'); process.exit(1); }

const results = { backed: [], replaced: [], skipped: [] };

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) { walk(full); continue; }
    const koMd = entry.name.match(/^(.+)\.ko\.md$/);
    const koMjs = entry.name.match(/^(.+)\.ko\.mjs$/);
    const m = koMd || koMjs;
    if (!m) continue;
    const ext = koMd ? '.md' : '.mjs';
    const base = path.join(dir, m[1] + ext).replace(/\\/g, '/');
    const en = path.join(dir, m[1] + '.en' + ext).replace(/\\/g, '/');
    if (fs.existsSync(base)) {
      if (!fs.existsSync(en)) { fs.copyFileSync(base, en); results.backed.push(en); }
      else { results.skipped.push(en + ' (already exists)'); }
    }
    fs.copyFileSync(full, base);
    results.replaced.push(base);
  }
}

walk(root);
console.log(JSON.stringify(results, null, 2));
