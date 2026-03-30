#!/usr/bin/env node
/**
 * PreToolUse hook: Injects context window usage into AI via additionalContext.
 *
 * Reads ctx-for-hook.json written by statusline.mjs and injects usage data.
 * If the file doesn't exist, outputs nothing (0 token cost).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const input = await new Promise((resolve) => {
  const chunks = [];
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) { settled = true; process.stdin.destroy(); resolve(Buffer.concat(chunks).toString('utf-8')); }
  }, 3000);
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } });
  process.stdin.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(''); } });
});

try {
  const data = JSON.parse(input);
  const sessionId = data.session_id || '';

  if (!sessionId) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    process.exit(0);
  }

  const sessionDir = path.join(os.homedir(), '.claude-box', 'data', 'session-memory', sessionId);
  const hookFile = path.join(sessionDir, 'ctx-for-hook.json');

  if (!fs.existsSync(hookFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    process.exit(0);
  }

  const ctx = JSON.parse(fs.readFileSync(hookFile, 'utf-8'));

  // Delete after injection
  try { fs.unlinkSync(hookFile); } catch {}

  // Log
  try {
    const logFile = path.join(sessionDir, 'ctx-notify.log');
    const ts = new Date().toISOString();
    const sid = sessionId.slice(0, 8);
    fs.appendFileSync(logFile, `${ts} | sid:${sid} | hook-inject pct:${ctx.pct} used:${ctx.used} total:${ctx.total}\n`);
  } catch {}

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `<context-usage>\nCurrent session context window usage.\nCONTEXT_UTILIZATION=${ctx.pct}%\nCONTEXT_USED_TOKENS=${ctx.used}\nCONTEXT_WINDOW_SIZE=${ctx.total}\nMEASURED_AT=${new Date(ctx.timestamp).toISOString()}\n</context-usage>`
    }
  }));

} catch {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}
