---
description: Generate a context-preserving message to use with /compact
argument-hint: '[context hints to preserve]'
---
Analyze the current conversation and generate a preservation message to append after `/compact`.

## Procedure

1. Analyze the conversation and extract the items below (include only what exists — skip empty sections)
2. Show the user `/compact` + the generated message (do NOT execute it — just display)
3. The user can edit or use it as-is

## Items to Extract (include only if present)

### Main objective
- The overarching purpose/topic of this session (one line)

### Full task list
- Numbered list of all tasks
- Status for each: done / in progress / not started

### Completed work
- Key results of finished tasks (decisions made, files changed, etc.)

### Currently in progress
- The task being worked on right now
- The last user question/instruction (including unanswered ones)

### Key decisions
- Important agreements from this session (things that should not be reversed)

### Reference files/paths
- File paths needed for the work

### Session memory keywords
- If the session-memory-notify hook is active, keywords are auto-injected after compact — omit this section
- If the hook is not present, check `~/.claude-box/data/session-memory/{session-id}/` for keywords and include them

## Output Format

```
/compact This session is about [main objective in one line].

## Completed
- [item]

## In Progress
- [item]
- Last question: [content]

## Key Decisions
- [item]

## Reference Files
- [path]

## Session Memory Keywords
- [keyword list]
```

## Rules
- Keep the compact message short — if it's too long it defeats the purpose. **1-2 lines per item max.**
- Do NOT include code snippets (use file paths instead)
- Do NOT copy file contents (reference paths only)
