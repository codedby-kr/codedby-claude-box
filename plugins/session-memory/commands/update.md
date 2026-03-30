---
description: Update session-memory plugin to the latest version
allowed-tools: Bash(git:*), Bash(rm:*), Bash(claude plugin:*)
---

Run these commands in order:

1. `git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main`
2. `rm -rf ~/.claude/plugins/cache/codedby-claude-box/session-memory/`
3. `claude plugin update session-memory@codedby-claude-box -s user`

> PowerShell users: replace `~` with `$HOME` in the commands above.

Then tell the user: "Update complete. Type `/reload-plugins` or restart Claude Code to apply."
Do NOT attempt to run /reload-plugins — it's a slash command only the user can type.
