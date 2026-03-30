#!/usr/bin/env node
// ============================================================================
// guard-claude-dir.mjs — .claude/ directory protection hook (PreToolUse)
// ============================================================================
//
// ■ Why this hook exists
//   Claude Code's built-in prompts users for permission when manipulating .claude/ files.
//   Clicking allow every time is tedious, so this hook intercepts before the built-in
//   and suggests node-based workarounds to the AI. When the AI uses the suggested method,
//   the user never sees a permission dialog.
//
// ■ Two roles
//   Role 1 — Pre-emptive blocking (bypass built-in permission dialogs):
//     Catches operations that would trigger a permission dialog, blocks them first,
//     and suggests node-based workarounds.
//     Targets: Edit/Write, Bash cp/mv FROM, Bash rm, Bash write patterns (sed -i etc.)
//
//   Role 2 — Protection (prevent critical file loss):
//     Blocks rm/mv FROM on critical files to prevent them from being deleted/moved.
//     Regardless of whether the built-in would prompt — the hook blocks first
//     to eliminate the need for the user to click allow/deny.
//     No workaround is suggested — the purpose is protection.
//     Targets: mv FROM + critical files, rm + critical files
//
// ■ Critical file protection (Role 2)
//   Files: CLAUDE.md, settings.json, settings.local.json, .claude.json
//   Scope: Only blocks operations that remove the file (rm delete, mv FROM move)
//   Not blocked: Content modification/overwrite (cp TO, Edit, Write, etc.)
//   Reason: Missing critical files break Claude Code, but content edits are
//           normal configuration changes and should not be blocked.
//
// ■ Memory path exception (~/.claude/projects/*/memory/)
//   - Edit/Write: exempt (auto-memory writes directly via Edit/Write tools)
//   - Bash cp/mv/rm/write patterns: NOT exempt (built-in prompts for these, so pre-empt)
//
// ■ Blocking mechanism
//   exit 2 + stderr message. permissionDecision and continue are unsupported/non-functional.
//
// ■ Decision criteria for blocking
//   This hook blocks in exactly two cases:
//   (1) Operations that trigger a built-in permission dialog → pre-empt + suggest node workaround (Role 1)
//   (2) Operations that would remove critical files (rm, mv FROM) → block, no workaround (Role 2)
//   Everything else passes through. Do not block operations "for safety" if they don't trigger a dialog.
//
// ■ Critical file modification notes (Role 2)
//   rm/mv FROM on critical files is always blocked with NO workaround suggested.
//   This is intentional protection — losing these files breaks Claude Code.
//   Other operations on critical files (cp FROM, Edit, Write, sed -i) are handled
//   the same as any other .claude/ file — Role 1 (pre-empt + suggest workaround).
//   Do not break this distinction when modifying the hook.
//
// ■ Why node workarounds bypass the built-in
//   The built-in triggers permission dialogs for specific shell commands (cp, mv, rm, etc.).
//   node -e "require('fs').copyFileSync(...)" uses the Bash tool but internally calls
//   Node.js APIs, which don't trigger the built-in permission check.
//   PowerShell Copy-Item and cmd /c copy also bypass, but since this hook runs via node,
//   Node.js is guaranteed available, so node workarounds are suggested.
//   (Note: On native installs without Node.js, this hook itself won't execute.)
//
// ■ Version upgrade checklist
//   Claude Code updates may expand the scope of built-in permission dialogs.
//   When new operations start triggering dialogs:
//   1. Add pre-emptive blocking for that operation (Role 1)
//   2. Include a node-based workaround in the blocked message
//   3. Check if the memory exception is affected (test auto-memory behavior)
//
// ■ Testing
//   Always test after modifications. Create test files in .claude/ via node writeFileSync:
//   - Should block: cp FROM, mv FROM, rm, sed -i, Edit, Write → verify [BLOCKED] message
//   - Should pass: cp TO, mv TO, cat, node copyFileSync/unlinkSync → verify normal execution
//   - Memory: Edit/Write → pass, Bash cp/mv/rm/sed-i → block
//   - False positives: .claude-box path → pass, node -e "...;..." → no mis-splitting
//   ⚠️ Critical file testing caution:
//   rm/mv FROM on critical files (settings.json etc.) can only be tested with the actual
//   files at actual paths (creating same-named files elsewhere won't match protectedPaths).
//   If the hook has a bug, it won't block, and the built-in dialog appears —
//   if the user unknowingly clicks allow, the critical file is actually deleted/moved.
//   → Warn the user about the risk before testing; if a dialog appears, always click No.
//   → Back up critical files via node copyFileSync before testing.
//   Cleanup: node -e "require('fs').rmSync('path',{recursive:true,force:true})"
//
// ■ History
//   2026-03-22: Initial — Edit/Write blocking, write pattern blocking, rm/mv criticalFiles protection
//   2026-03-26: Added cp/mv FROM pre-emption, rm full pre-emption,
//               excluded memory exception from cp/mv/rm/write patterns,
//               introduced quote-aware command splitter (fixed node -e "...;..." false positives),
//               changed suggested workaround from cp to node copyFileSync,
//               fixed criticalFiles includes() → containsProtectedPath() false positives
// ============================================================================

import os from 'node:os';

// --- Read stdin (PreToolUse hooks receive JSON via stdin) ---
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

// --- Path normalization ---
// Unifies Windows path variants (C:\, C:/, /c/) for consistent comparison.
// Example: "C:\Users\foo\.claude" → "/c/users/foo/.claude"
function normalizePath(p) {
  if (!p) return '';
  let norm = p.replace(/[\\]/g, '/').toLowerCase();
  const driveMatch = norm.match(/^([a-z]):[/]/);
  if (driveMatch) norm = '/' + driveMatch[1] + norm.slice(2);
  return norm.replace(/[/]+$/, '');
}

try {
  const data = JSON.parse(input);
  const tool = data.tool_name || '';
  const toolInput = data.tool_input || {};

  const home = normalizePath(os.homedir());
  const cwd = normalizePath(data.cwd || process.cwd());

  // --- Protected directories ---
  const globalClaudeDir = home + '/.claude';       // ~/.claude/ (global)
  const globalClaudeJson = home + '/.claude.json';  // ~/.claude.json (global config)
  const projectClaudeDir = cwd + '/.claude';        // project/.claude/

  // --- Memory path detection ---
  // ~/.claude/projects/*/memory/ subtree is written by auto-memory via Edit/Write,
  // so Edit/Write is exempt. Bash operations are NOT exempt.
  const memoryDir = globalClaudeDir + '/projects';

  function isMemoryPath(norm) {
    if (!norm.startsWith(memoryDir + '/')) return false;
    const rest = norm.slice(memoryDir.length + 1);
    return rest.includes('/memory/') || rest.endsWith('/memory');
  }

  // --- Edit/Write protection check ---
  // Memory paths are exempt (auto-memory uses Edit/Write tools — blocking would break memory saves)
  function isProtected(filePath) {
    if (!filePath) return false;
    const norm = normalizePath(filePath);
    if (isMemoryPath(norm)) return false;  // Memory exception — Edit/Write only
    if (norm === globalClaudeJson) return true;
    if (norm === globalClaudeDir || norm.startsWith(globalClaudeDir + '/')) return true;
    if (norm === projectClaudeDir || norm.startsWith(projectClaudeDir + '/')) return true;
    return false;
  }

  // =========================================================================
  // Edit/Write blocking (Role 1: pre-emptive)
  // Built-in prompts for Edit/Write on .claude/ files → hook blocks first + suggests node workaround
  // =========================================================================
  if (tool === 'Edit' || tool === 'Write') {
    const fp = toolInput.file_path || '';
    if (isProtected(fp)) {
      process.stderr.write(
  '[BLOCKED] .claude/ direct edit blocked: ' + fp + '\n' +
  'Procedure: node copyFileSync to /tmp/ → Bash sed -i /tmp/file → node copyFileSync back to original path\n' +
  'Copy: node -e "require(\'fs\').copyFileSync(\'source\',\'dest\')"'
);
      process.exit(2);
    }
  }

  // =========================================================================
  // Bash command inspection
  // =========================================================================
  if (tool === 'Bash') {
    const cmd = toolInput.command || '';
    const cmdLower = cmd.replace(/[\\]/g, '/').toLowerCase();

    // --- Protected path list ---
    // Includes both normalizePath format and Windows original format
    // so paths written in any format will match.
    const homeWin = os.homedir().replace(/[\\]/g, '/').toLowerCase();
    const cwdWin = (data.cwd || process.cwd()).replace(/[\\]/g, '/').toLowerCase();

    const protectedPaths = [
      globalClaudeDir,          // /c/users/.../.claude (normalized)
      globalClaudeJson,
      projectClaudeDir,
      homeWin + '/.claude',     // c:/users/.../.claude (Windows original)
      homeWin + '/.claude.json',
      cwdWin + '/.claude',
      '~/.claude',              // Tilde shorthand
    ];

    // --- Memory path exception list (Bash only) ---
    const memoryPaths = [
      globalClaudeDir + '/projects',
      homeWin + '/.claude/projects',
      '~/.claude/projects',
    ];

    // --- Critical file list (Role 2: protection targets) ---
    // Config files at .claude/ root. Deleting/moving these breaks Claude Code.
    const criticalFileNames = ['claude.md', 'settings.json', 'settings.local.json'];
    const criticalFiles = [];
    criticalFileNames.forEach(f => {
      criticalFiles.push(globalClaudeDir + '/' + f);
      criticalFiles.push(homeWin + '/.claude/' + f);
      criticalFiles.push(projectClaudeDir + '/' + f);
      criticalFiles.push(cwdWin + '/.claude/' + f);
      criticalFiles.push('~/.claude/' + f);
    });
    criticalFiles.push(globalClaudeJson);
    criticalFiles.push(homeWin + '/.claude.json');
    criticalFiles.push('~/.claude.json');

    // --- Path containment check (boundary character validation) ---
    // Prevents false positives where .claude matches .claude-box etc.
    // Only matches when the protected path is followed by /, ", ', space, tab, or end of string.
    // Also used for criticalFiles comparison (prevents settings.json.bak false matches).
    function containsProtectedPath(str, protectedPath) {
      let idx = 0;
      while ((idx = str.indexOf(protectedPath, idx)) !== -1) {
        const afterIdx = idx + protectedPath.length;
        if (afterIdx >= str.length) return true;
        const afterChar = str[afterIdx];
        if (afterChar === '/' || afterChar === '"' || afterChar === "'" || afterChar === ' ' || afterChar === '\t') return true;
        idx++;
      }
      return false;
    }

    // --- Early exit: if no protected path in command, pass immediately ---
    const hasProtectedPath = protectedPaths.some(p => containsProtectedPath(cmdLower, p));
    if (!hasProtectedPath) {
      process.exit(0);
    }

    // --- Write patterns (sed -i, echo >, cat > etc. — direct file modification commands) ---
    const writePatterns = [/\bsed\b.*-i/i, /\becho\b.*>/, /\bcat\b.*>/, /\bprintf\b.*>/, /\btee\b/, /\btruncate\b/, /\bdd\b.*of=/i];

    // --- Quote-aware command splitter ---
    // Splits on &&, ||, ; but ignores these operators inside quotes.
    // Reason: node -e "fs.rmSync('path'); console.log('done')" would be mis-split
    // at the semicolon, creating a fs.rmSync('.../.claude/...') fragment that false-matches.
    function splitCommands(c) {
      const subs = [];
      let cur = '';
      let inSingle = false;
      let inDouble = false;
      let esc = false;
      for (let i = 0; i < c.length; i++) {
        const ch = c[i];
        const next = c[i + 1];
        if (esc) { cur += ch; esc = false; continue; }
        if (ch === '\\') { cur += ch; esc = true; continue; }
        if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; continue; }
        if (ch === '"' && !inSingle) { inDouble = !inDouble; cur += ch; continue; }
        if (!inSingle && !inDouble) {
          if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
            subs.push(cur.trim()); cur = ''; i++; continue;
          }
          if (ch === ';') { subs.push(cur.trim()); cur = ''; continue; }
        }
        cur += ch;
      }
      if (cur.trim()) subs.push(cur.trim());
      return subs.filter(s => s.length > 0);
    }
    const subCommands = splitCommands(cmd);

    // --- Per-subcommand inspection ---
    for (const sub of subCommands) {
      const subLower = sub.replace(/[\\]/g, '/').toLowerCase();

      // Skip if this subcommand doesn't contain any protected path
      const subHasProtected = protectedPaths.some(p => containsProtectedPath(subLower, p));
      if (!subHasProtected) continue;

      // --- Memory path exception handling ---
      // Subcommands containing only memory paths pass through by default,
      // EXCEPT cp/mv/rm and write patterns — built-in prompts for these, so inspect anyway.
      const subHasMemory = memoryPaths.some(mp => {
        const idx = subLower.indexOf(mp);
        if (idx === -1) return false;
        const after = subLower.slice(idx + mp.length);
        return /^[/][^/]+[/]memory([/]|$)/.test(after);
      });
      if (subHasMemory) {
        if (!/\b(cp|mv|rm)\b/.test(subLower) && !writePatterns.some(p => p.test(sub))) {
          // After removing memory paths, check if protected paths remain
          let subWithoutMemory = subLower;
          memoryPaths.forEach(mp => { subWithoutMemory = subWithoutMemory.split(mp).join(''); });
          if (!protectedPaths.some(p => containsProtectedPath(subWithoutMemory, p))) continue;
        }
      }

      // ---------------------------------------------------------------
      // cp/mv FROM .claude/ blocking (Role 1: pre-emptive)
      // Block when source (all args except last) is a .claude/ path.
      // Destination being .claude/ (TO) is currently not blocked (built-in doesn't prompt).
      // Exception: mv FROM + critical file → Role 2 (protection, no workaround).
      // ---------------------------------------------------------------
      if (/\b(cp|mv)\b/.test(sub)) {
        const cmdMatch = sub.match(/\b(cp|mv)\b(.*)/s);
        if (cmdMatch) {
          const verb = cmdMatch[1].toLowerCase();
          const argsStr = cmdMatch[2].trim();
          // Tokenize args (spaces inside quotes are kept as one token)
          const tokens = argsStr.match(/(?:"[^"]*"|'[^']*'|\S)+/g) || [];
          // Remove flags (-r, -rf, --preserve etc.)
          const pathTokens = tokens.filter(t => !/^-/.test(t.replace(/^["']/, '')));

          if (pathTokens.length >= 2) {
            // Last token = destination, rest = sources
            const sources = pathTokens.slice(0, -1);
            const sourcesLower = sources.map(s =>
              s.replace(/["']/g, '').replace(/[\\]/g, '/').toLowerCase()
            );

            const sourceHasProtected = sourcesLower.some(src =>
              protectedPaths.some(p => containsProtectedPath(src, p))
            );

            if (sourceHasProtected) {
              // Role 2: mv FROM + critical file → block with no workaround (source would be lost)
              if (verb === 'mv' && criticalFiles.some(f => containsProtectedPath(subLower, f))) {
                process.stderr.write(
                  '[BLOCKED] Critical config file mv blocked: ' + sub.trim() + '\n' +
                  'Protected: CLAUDE.md, settings.json, settings.local.json, .claude.json'
                );
                process.exit(2);
              }
              // Role 1: pre-emptive block + node workaround
              const alt = verb === 'cp'
                ? 'node -e "require(\'fs\').copyFileSync(\'source\',\'dest\')"'
                : 'node -e "require(\'fs\').copyFileSync(\'source\',\'dest\'); require(\'fs\').unlinkSync(\'source\')"';
              process.stderr.write(
                `[BLOCKED] .claude/ ${verb} blocked (pre-empting built-in permission dialog)\n` +
                `Use instead: ${alt}`
              );
              process.exit(2);
            }
          }
        }
      }

      // ---------------------------------------------------------------
      // Write pattern blocking (Role 1: pre-emptive)
      // sed -i, echo >, cat >, printf >, tee, truncate, dd of= etc.
      // Block if a subcommand with a .claude/ path contains a write pattern.
      // ---------------------------------------------------------------
      if (writePatterns.some(p => p.test(sub))) {
        process.stderr.write(
          '[BLOCKED] .claude/ bash write blocked\n' +
          'Procedure: node copyFileSync to /tmp/ → Bash sed -i /tmp/file → node copyFileSync back to original path\n' +
          'Copy: node -e "require(\'fs\').copyFileSync(\'source\',\'dest\')"\n' +
          'False positive? If a command mixes .claude/ reads with writes to other paths, it gets blocked. Split into separate commands and retry.'
        );
        process.exit(2);
      }

      // ---------------------------------------------------------------
      // rm blocking
      // Critical files: Role 2 — prevent deletion (no workaround suggested)
      // Non-critical files: Role 1 — pre-emptive block + node unlinkSync workaround
      // ---------------------------------------------------------------
      if (/\brm\b/.test(sub)) {
        // Role 2: critical file deletion prevention
        if (criticalFiles.some(f => containsProtectedPath(subLower, f))) {
          process.stderr.write(
            '[BLOCKED] Critical config file deletion blocked: ' + sub.trim() + '\n' +
            'Protected: CLAUDE.md, settings.json, settings.local.json, .claude.json'
          );
          process.exit(2);
        }
        // Role 1: pre-emptive block + node workaround
        process.stderr.write(
          '[BLOCKED] .claude/ rm blocked (pre-empting built-in permission dialog)\n' +
          'Use instead: node -e "require(\'fs\').unlinkSync(\'path\')"'
        );
        process.exit(2);
      }

    }
  }

  // Passed all checks — allow through
  process.exit(0);
} catch {
  // On errors (JSON parse failure etc.), fail open — don't let hook errors block other work
  process.exit(0);
}
