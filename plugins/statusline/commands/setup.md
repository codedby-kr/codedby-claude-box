---
description: Set up statusline HUD (copies script + configures settings.json)
allowed-tools: Bash(node:*)
---

This command sets up the statusline HUD by:
1. Copying statusline.mjs to a stable path outside the plugin cache
2. Registering it in ~/.claude/settings.json

## Steps

### Step 1: Copy statusline.mjs to stable path

The plugin cache may be cleared on updates, so statusline.mjs is copied to `~/.claude-box/statusline/statusline.mjs`.

Use `${CLAUDE_PLUGIN_ROOT}` to locate the source file — this env var is set by Claude Code when running plugin commands.

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  console.error('ERROR: CLAUDE_PLUGIN_ROOT not set. Run this command via /statusline:setup.');
  process.exit(1);
}

const srcFile = path.join(pluginRoot, 'hud', 'statusline.mjs');
if (!fs.existsSync(srcFile)) {
  console.error('ERROR: statusline.mjs not found at ' + srcFile);
  process.exit(1);
}

const destDir = path.join(os.homedir(), '.claude-box', 'statusline');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, 'statusline.mjs');
fs.copyFileSync(srcFile, dest);
console.log('Copied statusline.mjs to ' + dest);
"
```

### Step 2: Register in settings.json

**CRITICAL: Use atomic read-modify-write to prevent JSON corruption.**

Check if statusLine is already configured. If it is, warn the user and ask for confirmation before overwriting. Do NOT overwrite without user consent.

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (settings.statusLine) {
  console.log('WARNING: statusLine is already configured:');
  console.log(JSON.stringify(settings.statusLine, null, 2));
  process.exit(0);
}

const slPath = path.join(os.homedir(), '.claude-box', 'statusline', 'statusline.mjs');
settings.statusLine = {
  type: 'command',
  command: 'node ' + slPath,
  padding: 0
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('statusLine registered in settings.json');
"
```

If statusLine is already configured, tell the user what's currently set and ask if they want to overwrite it. If they confirm, re-run the script above but remove the `if (settings.statusLine)` check.

### Step 3: Verify

Tell the user: "Setup complete. Restart Claude Code or start a new session to see the status bar."
