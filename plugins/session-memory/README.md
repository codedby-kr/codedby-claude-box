[한국어](./README.ko.md)

# session-memory

Save decisions during a session, get them back after compaction — without repeating yourself.

**Latest: v1.0.0** · [Changelog](./CHANGELOG.md)

Claude Code forgets everything when the context is compacted. Key decisions, design rationale, agreed-upon approaches — all gone. You end up re-explaining the same things, or worse, Claude makes a different decision the second time around.

This plugin gives each session a persistent keyword-based memory. Save important context with a keyword, and it survives compaction. The session-start hook automatically re-injects the keyword list after every compaction, so Claude knows what's available without you having to remind it.

Data is stored as plain markdown files in `~/.claude-box/data/session-memory/{session-id}/`. No database, no external dependencies.

## Why

1. After `/compact`, Claude loses all prior decisions. You have to re-explain what was agreed upon, or it silently contradicts earlier choices.
2. Long sessions accumulate important context — architecture decisions, bug root causes, API quirks — that's too detailed for a compact message but too important to lose.
3. There's no built-in way to carry structured context across compaction boundaries.

session-memory stores it by keyword and brings it back automatically.

## Features

- **Save by keyword** — `/session-memory:save-memory auth-flow` extracts the relevant discussion from your conversation and saves it as a markdown file with frontmatter (keyword, summary, timestamps).
- **Recall after compaction** — `/session-memory recall auth-flow` loads the full content back into context. The session-start hook lists available keywords after every compaction, so Claude can suggest relevant recalls.
- **Search** — `/session-memory search <query>` greps through saved memories. `--all` flag searches across all sessions.
- **List** — `/session-memory list` shows all keywords in the current session. `--sessions` shows all saved sessions.
- **Auto-inject on session start** — the SessionStart hook fires on startup, resume, clear, and compact. It injects the session ID and keyword list into Claude's context automatically.
- **Compact message generator** — `/session-memory:compact-msg` analyzes the conversation and generates a structured preservation message for `/compact`, incorporating session memory keywords.

## Installation

```
/plugin install session-memory@codedby-claude-box
```

No setup command needed — hooks auto-register, skills auto-discover, data directories are created on first save.

### Updating

```
/session-memory:update
```

Then type `/reload-plugins` or restart Claude Code.

<details>
<summary>Manual update (if /session-memory:update doesn't work)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/session-memory/
claude plugin update session-memory@codedby-claude-box -s user
```

Restart Claude Code.

> PowerShell users: replace `~` with `$HOME` in the commands above.

</details>

## Usage

```
/session-memory:save-memory auth-flow          Save current discussion about auth-flow
/session-memory:save-memory                    Auto-detect saveable topics, confirm with user

/session-memory list                List keywords in current session
/session-memory list --sessions     List all saved sessions
/session-memory recall auth-flow    Load auth-flow content into context
/session-memory search JWT          Search for "JWT" in current session
/session-memory search --all JWT    Search across all sessions
/session-memory:compact-msg                    Generate a compact preservation message
```

## Works with

- **statusline** — the statusline plugin writes `ctx-for-hook.json` with context usage data. If installed, session-memory's data directory is used as the bridge location for context notifications. session-memory works fine without statusline.

## Data format

Each keyword is saved as `~/.claude-box/data/session-memory/{session-id}/{keyword}.md`:

```markdown
---
keyword: auth-flow
summary: JWT refresh token rotation with Redis blacklist
created: 2026-03-26T10:30:00Z
updated: 2026-03-26T14:15:00Z
---

## Decision
Use short-lived access tokens (15min) with refresh token rotation...

## Rationale
...

## Files
- src/auth/token-service.ts
- src/middleware/auth.ts
```

<details>
<summary>Limitations</summary>

- **Session-scoped, not global.** Memories are tied to a session ID. To access memories from a different session, use `/session-memory search --all`.
- **Manual save required.** You must explicitly save with `/session-memory:save-memory`. The plugin does not auto-save.
- **`~/.claude-box/` directory.** Data is stored in `~/.claude-box/data/session-memory/`. This directory is created automatically on first save.
- **Keyword list injection after compaction.** The SessionStart hook re-injects keywords, but the actual memory content is not loaded automatically — you or Claude must explicitly recall specific keywords.
- **Node.js required for the hook.** The SessionStart hook runs as `node session-start.mjs`. Native installer users without Node.js won't get automatic keyword injection, but the skill and commands still work.

</details>


## Disclaimer

This plugin modifies Claude Code's behavior through hooks, skills, and commands. It is provided as-is with no warranty. Use at your own risk. The author is not responsible for any data loss, configuration corruption, or unintended behavior resulting from its use. Always back up important files before installing or updating plugins that interact with system configuration.

## License

MIT
