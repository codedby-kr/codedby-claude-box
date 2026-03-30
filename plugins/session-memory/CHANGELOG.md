# Changelog

## v1.0.0

- Initial release
- Session-start hook: merged session-id-capture + session-memory-notify into single file with per-step try-catch
- Session memory skill: read-only keyword search/recall/list with cross-session search
- Save command: keyword-based save with frontmatter (keyword, summary, timestamps), overwrite/append prompt
- Compact message generator: analyzes conversation and generates structured /compact preservation message
- Update command: standard 3-step (git pull + rm cache + claude plugin update)
- Data path: ~/.claude-box/data/session-memory/{session-id}/
