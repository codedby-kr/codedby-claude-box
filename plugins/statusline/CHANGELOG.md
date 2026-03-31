# Changelog

## v1.0.1

- Add Korean localization (statusline.ko.mjs) with Korean comments and KST timestamps
- Default lastActivity and cacheEfficiency to off (toggle in CONFIG)

## v1.0.0

- Initial release
- HUD elements: model, rate limits (OAuth API), context bar, CWD, git branch, session ID, session duration/cost, token usage, cache efficiency, task progress, active agents
- Context-notify hook: injects context utilization into AI via additionalContext
- Setup command: copies statusline.mjs to stable path + registers in settings.json
- Update command: standard 3-step + re-copy statusline.mjs
