---
description: Switch all plugin files back to English (영문으로 되돌리기)
allowed-tools: Bash(node:*)
---

Run the localize script to switch this plugin back to English:

```
node "${CLAUDE_PLUGIN_ROOT}/commands/localize-en.js" "${CLAUDE_PLUGIN_ROOT}"
```

After the script runs, report the results to the user in Korean:
- **영문으로 복원**: list of files restored from `.en.md` / `.en.mjs`
- **백업 제거**: list of `.en` backups removed
- If nothing was restored (no `.en` backups found), tell the user it is already in English.

Then tell the user: "영문화 완료. `/reload-plugins`를 입력하거나 Claude Code를 재시작하세요."
Do NOT attempt to run /reload-plugins — it's a slash command only the user can type.
