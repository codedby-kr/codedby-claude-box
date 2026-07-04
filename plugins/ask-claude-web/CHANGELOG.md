# Changelog

## 1.9.0
- New command `/ask-claude-web:localize-en` — reverses `localize-ko`: restores English docs/scripts from the `.en.md`/`.en.mjs` backups, then removes those backups to return the plugin to its pristine English state. No-op when already English. The plugin language can now be toggled both ways (`localize-ko` ↔ `localize-en`).

## 1.8.0
- DOM selectors generalized to **L1 (exact aria-label) → L2 (bilingual regex)** resolution — tolerates claude.ai label drift, dynamic suffixes, and EN/KR with no code change
- Fixed file-attachment detection: claude.ai changed the remove-button aria-label to `"<timestamp>_<filename> 제거"`; now matched by suffix regex (was exact-match → counted 0 → false `MISSING_ATTACHMENTS`)
- Fixed response extraction: timestamp sibling (`"오전 12:25"`) was mis-extracted; now skipped via time-pattern + content-element checks, and `.font-claude-response` is preferred for clean text (no sr-only "Claude 응답:" heading duplication)
- extract-response.js: added read-only structural fallback (L3) when ancestor-sibling traversal can't reach the response
- send.js: send button now polled until present **and** enabled (fixes `SEND_BTN_NOT_FOUND` race on a fresh tab's first message, where React renders the button after the fixed 300ms wait); `input` event dispatched to reinforce React registration
- send.js: wait for ProseMirror to normalize `<div>` line breaks into `<p>` before clicking send — fixes multiline text being dropped (only the attached file sent) when a file was attached; the adaptive send-button polling removed the old fixed-delay cushion that had masked this normalization race
- send.js: `getFileNames` reads filenames from remove-button aria-label and chip leaf text (was empty `textContent`); `SEND_BTN_NOT_FOUND` now returns a compact `buttons` list as self-heal diagnostic
- SKILL.md/SKILL.ko.md: new "Robustness & Selector Resolution" and "Self-heal on Unrecoverable Break" sections (halt → report → user-chosen repair path: inline / isolated subagent / fresh session; confirm + live re-verify before applying)

## 1.7.0
- Major SKILL.md refactoring: 597 lines → 270 lines (55% reduction)
- Replaced inline scripts with hint-based approach + 3 external scripts (send.js, wait-streaming.js, extract-response.js)
- 4-zone structure: Setup → Procedure → Behavioral Rules → Reference
- TIMEOUT strategy: stability check first, +5min retry once, diagnostic mode
- Tab selection: "regardless of list_pages results" — prevents pre-selection override
- clip-files scripts: [SKIP] → [FAILED] with OK/FAILED file lists
- extract-response.js: added Korean disclaimer filter ("Claude는 AI이며 실수할 수 있습니다")
- Section heading fix: "### Send message" → "### Run send.js" (removed collision with parent heading)

## 1.6.1
- Replaced 3-step message flow with 2-step flow — removed standalone prep step, merged cleanup into send script
- Send script now includes attachment gate: auto-detects and removes stale attachments from previous cycles before sending
- Polling-based removal (100ms interval, 2s timeout) replaces fixed 300ms delays — adapts to actual DOM speed
- All send responses now include `sentWith` file list and descriptive `message` for context-aware diagnostics
- New error returns: `STILL_STREAMING`, `CLEANUP_FAILED`, `MISSING_ATTACHMENTS` with actionable messages
- Fixed 'web Claude' duplicate in SKILL.md description
- Fixed Computer Use comparison table showing "Stable (v1.0.0)" → "Stable (since v1.0.0)"

## 1.5.0
- Full SKILL.md rewrite — generalized paths (`${CLAUDE_PLUGIN_ROOT}`), bilingual DOM selectors, server instability warning, cleanup plan applied
- Added execute-loop-doc, execute-loop-msg commands (public) and execute-loop-violations [INTERNAL]
- New 3-step universal message sending flow with health check
- Stability check (Step 5) after streaming completion to prevent false positives
- Artifact download procedure with Chrome download path detection
- Verification Protocol Tag for structured verification loops

## 1.4.0
- Added execute-loop-doc and execute-loop-msg commands [INTERNAL] (initial version)
- Applied server-instability warning to SKILL.md
- Applied skill-cleanup-plan (23% reduction: removed duplicate sections, merged changelogs, trimmed overview)
- Added frontmatter triggers: 'discuss with web claude', 'get claude.ai's review'
- Bumped version for marketplace listing update (added statusline, session-memory, guard-claude-dir)

## 1.3.0
- Added `/ask-claude-web:update` command for easy plugin updates without restarting
- Updated README Updating section with new update command

## 1.2.1
- Fixed Windows setup command (`/c` parsed as path by `claude mcp add`)
- Use `claude mcp add-json` for Windows chrome-devtools installation

## 1.2.0
- Removed bundled `.mcp.json` (fixes "MCP server skipped" duplicate error)
- Added `/ask-claude-web:setup` command for chrome-devtools MCP installation
- Added prerequisite check in SKILL.md — guides user to setup command if MCP missing

## 1.1.0
- Reframed skill from Q&A to collaboration/discussion with multi-turn support
- Consolidated DOM selector changelog into single verified selectors table
- Fixed response extraction (opacity-based timestamp filter + structural fallback)
- Updated marketplace README description

## 1.0.0
- Initial release
- Automated conversations with claude.ai via chrome-devtools MCP
- File attachment via OS clipboard (zero context cost)
- Streaming completion detection (async Promise + fallback polling)
- Cross-platform clipboard scripts (Windows tested, macOS/Linux experimental)
- Bilingual skill definition (English + Korean)
