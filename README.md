# codedby-claude-box

Claude Code plugins by **codedby**.

## Available Plugins

| Plugin | Description | Status |
|--------|-------------|--------|
| [ask-claude-web](./plugins/ask-claude-web/) | Two Claudes talk to each other — Claude Code asks claude.ai directly, gets answers, and acts on them | v1.9.0 |
| [statusline](./plugins/statusline/) | Rich status bar for Claude Code — rate limits, context usage, git info, task progress, and more in a single HUD line | v1.0.1 |
| [session-memory](./plugins/session-memory/) | Session-scoped keyword memory — save decisions, recall context after compaction, search across sessions | v1.0.0 |
| [guard-claude-dir](./plugins/guard-claude-dir/) | Skips .claude/ permission prompt dialogs by pre-empting operations with node-based workarounds, and guards critical config files from deletion | v1.0.0 |

## Installation

```bash
# 1. Add this marketplace
/plugin marketplace add codedby-kr/codedby-claude-box

# 2. Install a plugin
/plugin install ask-claude-web@codedby-claude-box
/plugin install statusline@codedby-claude-box
/plugin install session-memory@codedby-claude-box
/plugin install guard-claude-dir@codedby-claude-box
```

## License

MIT
