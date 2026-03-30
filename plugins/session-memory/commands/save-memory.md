---
description: Save important decisions, design outcomes, and key conclusions to session memory
argument-hint: '[keyword to save]'
---
Save important decisions, design discussions, and key conclusions from the current conversation to session memory.

## Procedure

1. Get session ID from the `<session-identity>` block's `CLAUDE_SESSION_ID` value. Fallback: `fallback-{YYYY-MM-DD}`
2. Ensure session directory exists: `~/.claude-box/data/session-memory/{session-id}/`
3. If a keyword argument is provided (`$ARGUMENTS`):
   - Extract only the content related to that keyword from the recent conversation
4. If no argument:
   - Identify saveable topics from the current conversation and confirm with the user
5. Normalize each keyword to kebab-case (spaces→hyphens, lowercase, Korean characters preserved)
6. Create/update `~/.claude-box/data/session-memory/{session-id}/{keyword}.md`:
   - Frontmatter: keyword, summary (one line), created, updated
   - Body: decisions, rationale, relevant file paths, code snippets
7. If the same keyword already exists, ask the user: overwrite or append?
   - Overwrite: replace body, keep created, update updated and summary
   - Append: add new content below existing body, keep created, update updated and summary
8. After saving, show the full keyword list for the current session
