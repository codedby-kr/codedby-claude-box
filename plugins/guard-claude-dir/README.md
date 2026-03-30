[한국어](./README.ko.md)

# guard-claude-dir

The last permission prompts that `--dangerously-skip-permissions` doesn't skip.

**Latest: v1.0.0** · [Changelog](./CHANGELOG.md)

Even with bypass permissions enabled, Claude Code still shows permission dialogs for every operation on `.claude/` files — Edit, Write, cp, mv, rm, sed -i. The `.claude/` directory is a protected zone that bypass mode deliberately does not cover. Every time the AI touches a config file, you get a prompt. In a session that modifies settings or CLAUDE.md, that's 10-20 interruptions you thought bypass mode would prevent.

This hook intercepts those operations before Claude Code's built-in check triggers, blocks them, and tells the AI to use node-based alternatives (`fs.copyFileSync`, `fs.unlinkSync`) that bypass the protection entirely. The AI switches on its own — you never see a dialog.

As a bonus, it also prevents critical config files (CLAUDE.md, settings.json, settings.local.json, .claude.json) from being deleted or moved — with no workaround offered, because losing these files breaks Claude Code.

## Why

1. **Bypass permissions doesn't bypass `.claude/`.** You enabled `--dangerously-skip-permissions` to avoid interruptions, but `.claude/` operations still prompt. This hook covers that gap.
2. **Node workarounds exist but the AI doesn't know them.** `node -e "require('fs').copyFileSync(...)"` doesn't trigger the built-in check, but the AI defaults to `cp`, `mv`, `rm` — which do. This hook teaches the AI the workaround automatically.
3. **Critical files need real protection, not just a dialog.** If the AI tries to `rm settings.json` and you click "Allow" without reading carefully, Claude Code breaks. This hook blocks that with no workaround — the dialog never appears, and neither does the option to accidentally approve.

## How it works

The hook has two distinct roles:

**Role 1 — Skip permission prompts** intercepts operations that would trigger a `.claude/` permission dialog, blocks them, and suggests a node-based workaround. The AI uses the workaround autonomously — no user interaction needed. This is why you install the plugin.

**Role 2 — Critical file protection** blocks `rm` and `mv FROM` on essential config files with no workaround. These files must not disappear. This runs silently in the background.

| Operation | .claude/ file | Critical file |
|---|---|---|
| `Edit` / `Write` | Blocked → node copy+edit+copy | Same |
| `cp FROM .claude/` | Blocked → `copyFileSync` | Same |
| `mv FROM .claude/` | Blocked → `copyFileSync + unlinkSync` | **Blocked, no workaround** |
| `rm .claude/file` | Blocked → `unlinkSync` | **Blocked, no workaround** |
| `sed -i .claude/file` | Blocked → copy+sed+copy | Same |
| `cat .claude/file` | Passes through | Passes through |
| `node -e "fs.copyFileSync(...)"` | Passes through | Passes through |
| `cp TO .claude/` | Passes through | Passes through |

## Installation

```
/plugin install guard-claude-dir@codedby-claude-box
```

No setup needed — the PreToolUse hook auto-registers on install.

### Updating

```
/guard-claude-dir:update
```

Then type `/reload-plugins` or restart Claude Code.

<details>
<summary>Manual update (if /guard-claude-dir:update doesn't work)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/guard-claude-dir/
claude plugin update guard-claude-dir@codedby-claude-box -s user
```

Restart Claude Code.

> PowerShell users: replace `~` with `$HOME` in the commands above.

</details>

<details>
<summary>What counts as a "critical file"?</summary>

These files are protected from deletion and moving (Role 2):

- `~/.claude/claude.md` (and project `.claude/claude.md`)
- `~/.claude/settings.json` (and project `.claude/settings.json`)
- `~/.claude/settings.local.json` (and project `.claude/settings.local.json`)
- `~/.claude.json`

Content modification (Edit, Write, sed -i) on critical files is handled normally by Role 1 — blocked with a node workaround suggested. Only operations that remove the file entirely (rm, mv FROM) are blocked with no workaround.

</details>

<details>
<summary>Memory path exception</summary>

`~/.claude/projects/*/memory/` paths are used by Claude Code's auto-memory feature, which writes via the Edit/Write tools. This hook exempts Edit/Write on memory paths so auto-memory continues to work.

Bash operations (cp, mv, rm, sed -i) on memory paths are NOT exempt — the built-in still prompts for those, so the hook pre-empts them.

</details>

<details>
<summary>Limitations</summary>

- **Node.js required.** The hook runs as `node guard-claude-dir.mjs`. If you installed Claude Code via the native installer without Node.js, the hook won't execute. In that case, you fall back to the built-in permission dialogs (which still protect your files, just with more clicking).
- **Fail-open on errors.** If the hook crashes (JSON parse failure, unexpected input), it exits with code 0 (allow). This prevents hook bugs from blocking all tool usage, but means a broken hook provides no protection.
- **No redirect detection.** `curl http://... > ~/.claude/settings.json` or `python3 -c "..." > ~/.claude/file` are not caught by the write pattern list. Claude Code typically uses the Write tool for file creation rather than shell redirects, so this is low risk.
- **`-t` flag not handled.** `mv -t /tmp/ ~/.claude/settings.json` inverts the argument order (target first). The hook assumes the last argument is the destination. This syntax is unlikely to appear in Claude Code's output.
- **Quote-aware but not shell-complete.** The command splitter handles `"..."`, `'...'`, and `\\` escapes. It does not handle heredocs, `$(...)` substitution, or backtick command substitution. These edge cases are rare in Claude Code's tool calls.

</details>


## Disclaimer

This plugin modifies Claude Code's behavior through hooks, skills, and commands. It is provided as-is with no warranty. Use at your own risk. The author is not responsible for any data loss, configuration corruption, or unintended behavior resulting from its use. Always back up important files before installing or updating plugins that interact with system configuration.

## License

MIT
