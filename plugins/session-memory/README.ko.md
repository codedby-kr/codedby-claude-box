[English](./README.md)

# session-memory

세션 중 내린 결정을 저장하고, 컨텍스트 압축 후에도 되찾을 수 있습니다 — 같은 말을 두 번 하지 않아도 됩니다.

**Latest: v1.0.0** · [Changelog](./CHANGELOG.md)

Claude Code는 컨텍스트를 압축하면 모든 걸 잊어버립니다. 핵심 결정, 설계 근거, 합의한 방향 — 전부 사라집니다. 같은 설명을 다시 하거나, 더 나쁜 경우 Claude가 이전과 다른 결정을 내립니다.

이 플러그인은 세션별로 키워드 기반 메모리를 제공합니다. 중요한 맥락을 키워드로 저장하면 압축 후에도 유지됩니다. SessionStart 훅이 압축 후 키워드 목록을 자동으로 다시 주입하므로, 직접 알려주지 않아도 Claude가 무엇이 저장되어 있는지 알 수 있습니다.

데이터는 `~/.claude-box/data/session-memory/{session-id}/`에 마크다운 파일로 저장됩니다. 데이터베이스나 외부 의존성 없이 동작합니다.

## 왜 필요한가

1. `/compact` 실행 후 Claude는 이전 결정을 전부 잊어버립니다. 합의한 내용을 다시 설명해야 하고, 아니면 Claude가 조용히 다른 선택을 합니다.
2. 긴 세션에는 아키텍처 결정, 버그 원인, API 특이사항 등 중요한 맥락이 쌓이는데, compact 메시지에 다 담기엔 너무 많고 잃어버리기엔 너무 중요합니다.
3. 컨텍스트 압축을 넘어서 구조화된 맥락을 유지하는 내장 기능이 없습니다.

session-memory는 키워드로 저장하고 자동으로 다시 가져옵니다.

## 주요 기능

- **키워드 저장** — `/session-memory:save-memory auth-flow`로 현재 대화에서 관련 내용을 추출하여 frontmatter(키워드, 요약, 타임스탬프)가 포함된 마크다운 파일로 저장합니다.
- **압축 후 복원** — `/session-memory recall auth-flow`로 전체 내용을 컨텍스트에 다시 로드합니다. SessionStart 훅이 압축 후 키워드 목록을 다시 주입하므로 Claude가 관련 키워드 recall을 제안할 수 있습니다.
- **검색** — `/session-memory search <검색어>`로 저장된 메모리를 검색합니다. `--all` 플래그로 모든 세션을 검색할 수 있습니다.
- **목록** — `/session-memory list`로 현재 세션의 키워드를 확인합니다. `--sessions`로 전체 세션 목록을 볼 수 있습니다.
- **세션 시작 시 자동 주입** — SessionStart 훅은 시작, 재개, 클리어, 압축 시마다 실행되어 세션 ID와 키워드 목록을 Claude 컨텍스트에 자동으로 주입합니다.
- **Compact 메시지 생성** — `/session-memory:compact-msg`로 대화를 분석하여 `/compact`용 보존 메시지를 생성하며, 세션 메모리 키워드를 포함합니다.

## 설치

```
/plugin install session-memory@codedby-claude-box
```

별도 설정 불필요 — 훅은 자동 등록, 스킬은 자동 탐색, 데이터 디렉토리는 첫 저장 시 자동 생성됩니다.

### 업데이트

```
/session-memory:update
```

이후 `/reload-plugins` 입력 또는 Claude Code를 재시작하세요.

### 한국어 전환

```
/session-memory:localize-ko
```

문서와 스크립트를 한국어로 전환합니다. 영어 원본은 `.en.md`/`.en.mjs`로 자동 백업됩니다.

<details>
<summary>수동 업데이트 (/session-memory:update가 안 될 때)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/session-memory/
claude plugin update session-memory@codedby-claude-box -s user
```

Claude Code를 재시작합니다.

> PowerShell 사용자: 위 명령에서 `~`를 `$HOME`으로 바꾸세요.

</details>

## 사용법

```
/session-memory:save-memory auth-flow          auth-flow 관련 현재 대화 내용 저장
/session-memory:save-memory                    저장할 주제 자동 감지, 사용자 확인

/session-memory list                현재 세션 키워드 목록
/session-memory list --sessions     저장된 전체 세션 목록
/session-memory recall auth-flow    auth-flow 내용 컨텍스트에 로드
/session-memory search JWT          현재 세션에서 "JWT" 검색
/session-memory search --all JWT    전체 세션에서 검색
/session-memory:compact-msg                    compact 보존 메시지 생성
```

## 함께 쓰면 좋은 플러그인

- **statusline** — statusline 플러그인이 기록하는 `ctx-for-hook.json`의 컨텍스트 사용량 데이터가 session-memory의 데이터 디렉토리를 브릿지 경로로 사용합니다. statusline 없이도 session-memory는 정상 동작합니다.

## 데이터 형식

각 키워드는 `~/.claude-box/data/session-memory/{session-id}/{keyword}.md`로 저장됩니다:

```markdown
---
keyword: auth-flow
summary: Redis 블랙리스트를 활용한 JWT 리프레시 토큰 로테이션
created: 2026-03-26T10:30:00Z
updated: 2026-03-26T14:15:00Z
---

## 결정사항
짧은 수명의 액세스 토큰(15분)과 리프레시 토큰 로테이션 사용...

## 근거
...

## 관련 파일
- src/auth/token-service.ts
- src/middleware/auth.ts
```

<details>
<summary>제한 사항</summary>

- **세션 단위 저장.** 메모리는 세션 ID에 묶여 있습니다. 다른 세션의 메모리에 접근하려면 `/session-memory search --all`을 사용하세요.
- **수동 저장 필요.** `/session-memory:save-memory`로 직접 저장해야 합니다. 자동 저장 기능은 없습니다.
- **`~/.claude-box/` 디렉토리.** 데이터는 `~/.claude-box/data/session-memory/`에 저장됩니다. 첫 저장 시 자동 생성됩니다.
- **압축 후 키워드 목록만 주입.** SessionStart 훅은 키워드 목록을 다시 주입하지만, 실제 메모리 내용은 자동 로드되지 않습니다 — 사용자나 Claude가 특정 키워드를 직접 recall해야 합니다.
- **훅에 Node.js 필요.** SessionStart 훅은 `node session-start.mjs`로 실행됩니다. Node.js 없이 네이티브 인스톨러를 사용하는 경우 자동 키워드 주입이 안 되지만, 스킬과 커맨드는 정상 동작합니다.

</details>


## 면책 조항

이 플러그인은 훅, 스킬, 커맨드를 통해 Claude Code의 동작을 변경합니다. 현재 상태 그대로 제공되며 어떠한 보증도 없습니다. 사용에 따른 책임은 사용자에게 있습니다. 데이터 손실, 설정 손상, 의도치 않은 동작에 대해 작성자는 책임지지 않습니다. 시스템 설정과 상호작용하는 플러그인을 설치하거나 업데이트하기 전에 항상 중요한 파일을 백업하세요.

## 라이선스

MIT
