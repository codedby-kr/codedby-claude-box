#!/usr/bin/env node
/**
 * session-start.mjs — SessionStart hook (merged)
 *
 * Runs on every SessionStart event (startup, resume, clear, compact).
 * Performs two steps, each in its own try-catch so one failure doesn't block the other:
 *
 *   Step 1: Inject session ID into AI context via <session-identity> tag.
 *           The AI uses this to locate session-scoped memory files.
 *           May be lost after /compact — this hook re-injects it every time.
 *
 *   Step 2: List existing memory keywords for this session.
 *           After compaction, the AI loses awareness of saved memories.
 *           This re-injects the keyword list so the AI knows what's available.
 *
 * Output: single JSON with combined additionalContext from both steps.
 * If both steps fail or no session ID: suppressOutput (0 token cost).
 *
 * Data path: ~/.claude-box/data/session-memory/{session-id}/
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MAX_KEYWORDS_DISPLAY = 15;

// ── Read stdin (3s timeout) ──────────────────────────────────────────────────
const input = await new Promise((resolve) => {
  const chunks = [];
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) { settled = true; process.stdin.destroy(); resolve(Buffer.concat(chunks).toString('utf-8')); }
  }, 3000);
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); }
  });
  process.stdin.on('error', () => {
    if (!settled) { settled = true; clearTimeout(timeout); resolve(''); }
  });
});

// ── Suppress helper ──────────────────────────────────────────────────────────
function suppress() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

try {
  const data = JSON.parse(input);
  const sessionId = data.session_id || data.sessionId || '';

  if (!sessionId) suppress();

  const contextParts = [];

  // ── Step 1: Inject session ID ────────────────────────────────────────────
  try {
    contextParts.push(
      `<session-identity>\nCLAUDE_SESSION_ID=${sessionId}\n</session-identity>`
    );
  } catch {
    // Session ID injection failed — continue to step 2
  }

  // ── Step 2: List existing memory keywords ────────────────────────────────
  try {
    const memoryDir = join(homedir(), '.claude-box', 'data', 'session-memory', sessionId);

    const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    if (files.length > 0) {
      const keywords = files.map(f => f.replace(/\.md$/, '')).filter(k => k.length > 0);

      if (keywords.length > 0) {
        const display = keywords.length > MAX_KEYWORDS_DISPLAY
          ? [...keywords.slice(0, MAX_KEYWORDS_DISPLAY), `+${keywords.length - MAX_KEYWORDS_DISPLAY} more`]
          : keywords;

        contextParts.push(
          `[Session Memory] Saved keywords (${keywords.length}): ${display.join(', ')}\n` +
          `Use /session-memory recall <keyword> to load. Use /session-memory:save-memory <keyword> to save.`
        );
      }
    }
  } catch {
    // No memory directory or read error — silently skip
  }

  // ── Output ───────────────────────────────────────────────────────────────
  if (contextParts.length === 0) suppress();

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: contextParts.join('\n\n')
    }
  }));

} catch {
  suppress();
}
