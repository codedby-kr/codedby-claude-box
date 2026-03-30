---
description: Switch all plugin files to Korean (한국어로 전환)
allowed-tools: Bash(node:*)
---

Run the localize script to switch this plugin to Korean:

```
node "${CLAUDE_PLUGIN_ROOT}/commands/localize-ko.js" "${CLAUDE_PLUGIN_ROOT}"
```

After the script runs, report the results to the user in Korean:
- **백업 생성**: list of `.en.md` / `.en.mjs` files created
- **한글로 교체**: list of files replaced
- **스킵**: backups that already existed

Then tell the user: "한글화 완료. `/reload-plugins`를 입력하거나 Claude Code를 재시작하세요."
Do NOT attempt to run /reload-plugins — it's a slash command only the user can type.
