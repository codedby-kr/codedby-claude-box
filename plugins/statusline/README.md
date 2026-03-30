[한국어](./README.ko.md)

# statusline

Everything you need to know about your Claude Code session — in one line at the bottom of the screen.

**Latest: v1.0.0** · [Changelog](./CHANGELOG.md)

Most of Claude Code's session data is invisible. Rate limits, context usage, token costs, git state, active agents — you only find out when something breaks. This plugin renders all of it as a persistent status bar, updated on every prompt.

Built with pure Node.js. No external dependencies. Works with Claude Code's native `statusLine` API and OAuth rate limit endpoints.

## Why

1. You hit a rate limit mid-task and only find out from the error message. The 5-hour and 7-day usage percentages are buried behind API calls — there's no way to see them at a glance.
2. You don't know how much context you've used until Claude compacts the conversation. By then it's too late to adjust.
3. Background agents, tasks, costs, and cache efficiency are all things you check manually, each time in a different way.

statusline puts all of it in one persistent line that updates automatically.

## Features

- **Rate limits** — 5-hour and 7-day utilization from the OAuth API, with color-coded thresholds (green/yellow/red at 70%/90%) and time-to-reset. Stale data is marked with `~`. Relogin warnings when tokens expire.
- **Context bar** — visual progress bar with exact token counts (e.g., `ctx:[████████░░] 100k/200k`). Turns yellow at 70%, red at 85%. Shows `COMPACT!` warning when critical. 1M context windows show the total in red.
- **Git info** — repository name and branch, extracted from `git remote` and `git branch`. Deduplicates against CWD to avoid showing `myrepo` in both the path and git sections.
- **Session stats** — elapsed time and cumulative USD cost.
- **Token usage** — total input/output tokens for the session.
- **Cache efficiency** — percentage of tokens served from cache vs. fresh input. Green ≥50%, yellow ≥25%.
- **Task progress** — completed/total tasks parsed from the transcript, with the current active task label.
- **Active agents** — count of running subagents and team members, parsed from transcript tool_use blocks.
- **Session ID** — first 5 characters, for cross-referencing logs.
- **CWD** — Fish-shell style abbreviated path (`~/p/m/f/src`).
- **Last activity** — timestamp from transcript file modification time.
- **Context bridge** — writes `ctx-for-hook.json` at 5-10% intervals for the session-memory plugin's context-notify hook. This is how context usage data flows from the HUD to the AI.

Every element is individually toggleable via the `CONFIG.elements` object in `statusline.mjs`.

## Installation

### Quick setup

```
/statusline:setup
```

This copies `statusline.mjs` to a stable path (`~/.claude-box/statusline/`) and registers it in `~/.claude/settings.json`. The stable path survives plugin cache clears — you won't lose your status bar on updates.

If you already have a different statusLine configured, setup will warn you and stop. Review your existing configuration and run setup again to confirm.

### Updating

```
/statusline:update
```

This pulls the latest version and clears the cache. Afterward:
1. Type `/reload-plugins` (refreshes the plugin paths)
2. Run `/statusline:setup` (re-copies statusline.mjs to stable path)

Or simply restart Claude Code — this does both automatically.

<details>
<summary>Manual setup</summary>

Copy `statusline.mjs` from the plugin directory to a stable location:

```bash
mkdir -p ~/.claude-box/statusline
cp ~/.claude/plugins/cache/codedby-claude-box/statusline/1.0.0/hud/statusline.mjs ~/.claude-box/statusline/
```

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /full/path/to/.claude-box/statusline/statusline.mjs",
    "padding": 0
  }
}
```

Use the absolute path from your system. `~` and `$HOME` do not expand inside settings.json.

</details>

<details>
<summary>Manual update (if /statusline:update doesn't work)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/statusline/
claude plugin update statusline@codedby-claude-box -s user
```

Then re-copy `statusline.mjs` to `~/.claude-box/statusline/`. Restart Claude Code.

> PowerShell users: replace `~` with `$HOME` in the commands above.

</details>

## Works with

- **session-memory** — statusline writes `ctx-for-hook.json` with context usage data. The session-memory plugin's context-notify hook reads this file and injects usage into the AI's context. Install both for context-aware behavior. statusline works fine without session-memory — the context bridge file is simply ignored.

## Output format

```
Opus 4.6 | 🔒 relogin | 5h:45%(2h) wk:12%(5d) | ctx:[████████░░] 100k/200k | repo:branch | sid:2ea2b | 23m $0.42 | in:45k out:12k | 12:34:56 | cache:67% | task:2/5 | agents:3(sub:2 team:1)
```

Each segment is separated by ` | ` and rendered with ANSI colors. Elements that have no data are silently omitted.

<details>
<summary>Limitations</summary>

- **Single statusLine slot.** Claude Code supports only one `statusLine.command` in settings.json. Installing this plugin replaces any existing status bar. `/statusline:setup` warns before overwriting.
- **Node.js required.** The HUD runs as `node statusline.mjs`. If you installed Claude Code via the native installer (no Node.js), the status bar won't render. Install Node.js 18+ or use the npm installation method.
- **OAuth API dependency.** Rate limit data comes from `api.anthropic.com/api/oauth/usage`. This requires an OAuth-authenticated Claude Code session (Pro/Max subscription via claude.ai login). API key users see everything except rate limits.
- **`~/.claude-box/` directory.** Setup creates `~/.claude-box/statusline/` for the stable script copy, and context bridge files go to `~/.claude-box/data/session-memory/{session-id}/`. These directories are created automatically.
- **Cache files in system temp.** Git info, rate limit responses, and transcript parsing results are cached in `os.tmpdir()` with short TTLs (5s for git, 2-5min for rate limits). These are shared across concurrent Claude Code sessions.

</details>


## Disclaimer

This plugin modifies Claude Code's behavior through hooks, skills, and commands. It is provided as-is with no warranty. Use at your own risk. The author is not responsible for any data loss, configuration corruption, or unintended behavior resulting from its use. Always back up important files before installing or updating plugins that interact with system configuration.

## License

MIT
