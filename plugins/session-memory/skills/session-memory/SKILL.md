---
name: session-memory
description: Search and load keyword-based session memory. Provides list, recall, search commands. To save, use /session-memory:save-memory.
---

# Session Memory (read-only)

Search and load keyword-based entries from session memory. This skill is **read-only** — it does not create or modify files. Use `/session-memory:save-memory` to save.

## Usage

Behavior depends on the argument (`$ARGUMENTS`):

### No argument or `help` → Quick Reference Card

```
[Session Memory]

  Save:   /session-memory:save-memory [keyword]        Save conversation content by keyword
  List:   /session-memory list              List keywords in current session
  Recall: /session-memory recall <keyword>  Load keyword content
  Search: /session-memory search <query>    Search keywords and content
  All:    /session-memory list --sessions   List all saved sessions

  Example: /session-memory:save-memory auth-flow
           /session-memory recall auth-flow
```

### `list` → List keywords in current session

1. Get session ID from the `<session-identity>` block's `CLAUDE_SESSION_ID` value. Fallback: `fallback-{YYYY-MM-DD}`
2. Glob `~/.claude-box/data/session-memory/{session-id}/*.md`
3. Read `keyword` and `summary` from each file's frontmatter
4. Output as table:
   ```
   | keyword | summary | updated |
   ```
5. If no files found: "No saved memories in this session. Use `/session-memory:save-memory` to save."

### `list --sessions` → List all saved sessions

1. Glob `~/.claude-box/data/session-memory/*/` directories
2. Show file count and most recent update time per session
3. Mark the current session ID with `(current)`

### `recall <keyword>` → Load keyword content

1. Get session ID
2. Normalize keyword to kebab-case (spaces→hyphens, lowercase, Korean characters preserved)
3. Read `~/.claude-box/data/session-memory/{session-id}/{keyword}.md`
4. If file not found:
   - Show all keywords in the current session
   - Suggest similar keywords if any exist

### `search <query>` → Search keywords and content

1. Get session ID
2. Grep `~/.claude-box/data/session-memory/{session-id}/` for the query
3. Show matched files with keyword, summary, and matching lines

### `search --all <query>` → Search across all sessions

1. Grep `~/.claude-box/data/session-memory/` for the query
2. Group results by session ID

## Auto-recall Guide

When previous decisions are needed after context compaction:
1. Check if memory files exist for the current session via Glob
2. Scan frontmatter keyword/summary list
3. Read files with keywords relevant to the current task
4. Resume work using the recovered context

## Notes

- This skill is read-only. File creation/modification/deletion is handled by `/session-memory:save-memory`.
- Uses only Glob, Grep, and Read tools.
- If the session memory directory does not exist, show "No saved session memory" and stop.