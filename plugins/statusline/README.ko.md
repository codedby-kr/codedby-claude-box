[English](./README.md)

# statusline

Claude Code 세션의 모든 정보를 화면 하단 한 줄에 보여줍니다.

**Latest: v1.0.1** · [Changelog](./CHANGELOG.md)

Claude Code의 세션 데이터 대부분은 눈에 보이지 않습니다. 레이트 리밋, 컨텍스트 사용량, 토큰 비용, git 상태, 활성 에이전트 — 문제가 생기고 나서야 알게 됩니다. 이 플러그인은 이 모든 정보를 하단 상태 바에 렌더링하며, 프롬프트마다 자동으로 갱신합니다.

순수 Node.js로 작성. 외부 의존성 없음. Claude Code의 `statusLine` API와 OAuth 레이트 리밋 엔드포인트를 활용합니다.

## 왜 필요한가

1. 작업 중간에 레이트 리밋에 걸려야 알게 됩니다. 5시간/7일 사용률은 API 호출 뒤에 숨어 있어서 한눈에 확인할 방법이 없습니다.
2. 컨텍스트를 얼마나 썼는지 Claude가 대화를 압축할 때까지 모릅니다. 그때는 이미 늦었습니다.
3. 백그라운드 에이전트, 태스크, 비용, 캐시 효율 — 전부 확인 방법이 제각각입니다.

statusline은 이 모든 걸 자동 갱신되는 한 줄에 넣어줍니다.

## 주요 기능

- **레이트 리밋** — OAuth API에서 5시간/7일 사용률을 가져옴. 70%/90%에서 색상 변경(초록/노랑/빨강), 리셋까지 남은 시간 표시. 데이터가 오래되면 `~` 표시. 토큰 만료 시 재로그인 경고.
- **컨텍스트 바** — 시각적 프로그레스 바 + 정확한 토큰 수 (예: `ctx:[████████░░] 100k/200k`). 70%에서 노랑, 85%에서 빨강. 위험 수준에서 `COMPACT!` 경고. 1M 컨텍스트는 전체 크기를 빨간색으로 표시.
- **Git 정보** — `git remote`에서 저장소명, `git branch`에서 브랜치명 추출. CWD와 중복되면 경로 표시 생략.
- **세션 통계** — 경과 시간 + 누적 비용(USD).
- **토큰 사용량** — 세션 전체 입출력 토큰.
- **캐시 효율** — 캐시에서 제공된 토큰 비율. 50% 이상 초록, 25% 이상 노랑.
- **태스크 진행률** — transcript에서 파싱한 완료/전체 태스크 수 + 현재 작업 라벨.
- **활성 에이전트** — 실행 중인 서브에이전트/팀 멤버 수. transcript의 tool_use 블록에서 파싱.
- **세션 ID** — 앞 5자. 로그 교차 확인용.
- **CWD** — Fish-shell 스타일 경로 축약 (`~/p/m/f/src`).
- **마지막 활동** — transcript 파일 수정 시각 기반 타임스탬프.
- **컨텍스트 브릿지** — 5-10% 간격으로 `ctx-for-hook.json` 작성. session-memory 플러그인의 context-notify 훅이 이 파일을 읽어 AI에 컨텍스트 사용률을 주입합니다.

모든 요소는 `statusline.mjs`의 `CONFIG.elements` 객체에서 개별 토글 가능합니다.

## 설치

### 자동 설치

```
/statusline:setup
```

`statusline.mjs`를 안정 경로(`~/.claude-box/statusline/`)에 복사하고 `~/.claude/settings.json`에 등록합니다. 안정 경로는 플러그인 캐시 초기화에 영향받지 않으므로, 업데이트 시에도 상태 바가 유지됩니다.

이미 다른 statusLine이 설정되어 있으면 경고 후 중단합니다. 기존 설정을 확인한 뒤 다시 실행하세요.

### 업데이트

```
/statusline:update
```

최신 버전을 가져오고 캐시를 초기화합니다. 이후:
1. `/reload-plugins` 입력 (플러그인 경로 갱신)
2. `/statusline:setup` 실행 (statusline.mjs를 안정 경로에 다시 복사)

또는 Claude Code를 재시작하면 둘 다 자동으로 처리됩니다.

### 한국어 전환

```
/statusline:localize-ko
```

문서와 스크립트를 한국어로 전환합니다. 영어 원본은 `.en.md`/`.en.mjs`로 자동 백업됩니다.

<details>
<summary>수동 설치</summary>

플러그인 디렉토리에서 statusline.mjs를 안정 경로로 복사:

```bash
mkdir -p ~/.claude-box/statusline
cp ~/.claude/plugins/cache/codedby-claude-box/statusline/1.0.0/hud/statusline.mjs ~/.claude-box/statusline/
```

`~/.claude/settings.json`에 추가:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /절대/경로/.claude-box/statusline/statusline.mjs",
    "padding": 0
  }
}
```

시스템의 절대 경로를 사용하세요. settings.json 안에서는 `~`나 `$HOME`이 확장되지 않습니다.

</details>

<details>
<summary>수동 업데이트 (/statusline:update가 안 될 때)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/statusline/
claude plugin update statusline@codedby-claude-box -s user
```

이후 `statusline.mjs`를 `~/.claude-box/statusline/`에 다시 복사하세요. Claude Code를 재시작합니다.

> PowerShell 사용자: 위 명령에서 `~`를 `$HOME`으로 바꾸세요.

</details>

## 함께 쓰면 좋은 플러그인

- **session-memory** — statusline이 기록하는 `ctx-for-hook.json`을 session-memory 플러그인의 context-notify 훅이 읽어서 AI에 컨텍스트 사용률을 주입합니다. 둘 다 설치하면 컨텍스트 인지 기능이 활성화됩니다. statusline만 단독으로 써도 정상 동작합니다.

## 출력 형식

```
Opus 4.6 | 🔒 relogin | 5h:45%(2h) wk:12%(5d) | ctx:[████████░░] 100k/200k | repo:branch | sid:2ea2b | 23m $0.42 | in:45k out:12k | 12:34:56 | cache:67% | task:2/5 | agents:3(sub:2 team:1)
```

각 구간은 ` | `로 구분되며 ANSI 색상으로 렌더링됩니다. 데이터가 없는 요소는 자동으로 생략됩니다.

<details>
<summary>제한 사항</summary>

- **statusLine 슬롯은 하나뿐입니다.** Claude Code는 settings.json에 하나의 `statusLine.command`만 지원합니다. 이 플러그인을 설치하면 기존 상태 바를 대체합니다. `/statusline:setup`은 덮어쓰기 전에 경고합니다.
- **Node.js가 필요합니다.** HUD는 `node statusline.mjs`로 실행됩니다. 네이티브 인스톨러(Node.js 없음)로 Claude Code를 설치한 경우 상태 바가 렌더링되지 않습니다. Node.js 18+을 설치하거나 npm 설치 방식을 사용하세요.
- **OAuth API 의존.** 레이트 리밋 데이터는 `api.anthropic.com/api/oauth/usage`에서 가져옵니다. claude.ai 로그인(Pro/Max 구독)으로 인증된 세션이 필요합니다. API 키 사용자는 레이트 리밋을 제외한 모든 기능을 사용할 수 있습니다.
- **`~/.claude-box/` 디렉토리.** 설치 시 `~/.claude-box/statusline/`을 생성하고, 컨텍스트 브릿지 파일은 `~/.claude-box/data/session-memory/{session-id}/`에 저장됩니다. 디렉토리는 자동 생성됩니다.
- **시스템 임시 디렉토리의 캐시 파일.** Git 정보, 레이트 리밋 응답, transcript 파싱 결과가 `os.tmpdir()`에 짧은 TTL(git 5초, 레이트 리밋 2-5분)로 캐시됩니다. 동시 실행 중인 Claude Code 세션 간에 공유됩니다.

</details>


## 면책 조항

이 플러그인은 훅, 스킬, 커맨드를 통해 Claude Code의 동작을 변경합니다. 현재 상태 그대로 제공되며 어떠한 보증도 없습니다. 사용에 따른 책임은 사용자에게 있습니다. 데이터 손실, 설정 손상, 의도치 않은 동작에 대해 작성자는 책임지지 않습니다. 시스템 설정과 상호작용하는 플러그인을 설치하거나 업데이트하기 전에 항상 중요한 파일을 백업하세요.

## 라이선스

MIT
