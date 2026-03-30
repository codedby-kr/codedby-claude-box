# Changelog

## v1.0.0

- Initial release as plugin (previously standalone hook)
- Role 1: Pre-emptive blocking of Edit/Write, cp/mv FROM, rm, write patterns (sed -i, echo >, cat >, tee, truncate, dd of=) on .claude/ paths — suggests node-based workarounds
- Role 2: Critical file protection — blocks rm and mv FROM on CLAUDE.md, settings.json, settings.local.json, .claude.json with no workaround
- Memory path exception: Edit/Write exempt on ~/.claude/projects/*/memory/ (auto-memory support)
- Quote-aware command splitter: prevents false positives with node -e "...;..." patterns
- Boundary-checked path matching: prevents .claude-box and settings.json.bak false positives
- Cross-platform path normalization: Windows (C:\, C:/, /c/), macOS, Linux, tilde (~) paths
- Update command: standard 3-step (git pull + rm cache + claude plugin update)
