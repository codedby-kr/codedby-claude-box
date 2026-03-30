---
description: Update statusline plugin to the latest version
allowed-tools: Bash(git:*), Bash(rm:*), Bash(claude plugin:*)
---

아래 명령을 순서대로 실행한다:

1. `git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main`
2. `rm -rf ~/.claude/plugins/cache/codedby-claude-box/statusline/`
3. `claude plugin update statusline@codedby-claude-box -s user`

> PowerShell 사용자: 위 명령에서 `~`를 `$HOME`으로 바꾸세요.

사용자에게 안내:
"업데이트 완료. 적용하려면:
1. `/reload-plugins` 입력 (플러그인 경로 갱신)
2. `/statusline:setup` 실행 (statusline.mjs를 안정 경로에 다시 복사)

또는 Claude Code를 재시작하면 둘 다 자동으로 처리됩니다."

/reload-plugins는 슬래시 커맨드이므로 직접 실행하지 말 것.
