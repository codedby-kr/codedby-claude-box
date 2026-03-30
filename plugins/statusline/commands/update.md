---
description: Update statusline plugin to the latest version
allowed-tools: Bash(git:*), Bash(rm:*), Bash(claude plugin:*)
---

Run these commands in order:

1. `git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main`
2. `rm -rf ~/.claude/plugins/cache/codedby-claude-box/statusline/`
3. `claude plugin update statusline@codedby-claude-box -s user`

> PowerShell users: replace `~` with `$HOME` in the commands above.

Then tell the user:
"Update complete. To apply:
1. Type `/reload-plugins` (refreshes the plugin paths)
2. Run `/statusline:setup` (re-copies statusline.mjs to stable path)

Or restart Claude Code — this does both automatically."

Do NOT attempt to run /reload-plugins — it's a slash command only the user can type.
