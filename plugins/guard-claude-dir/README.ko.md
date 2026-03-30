[English](./README.md)

# guard-claude-dir

`--dangerously-skip-permissions`로도 안 넘어가는, 마지막 남은 권한 요청을 처리합니다.

**Latest: v1.0.0** · [Changelog](./CHANGELOG.md)

bypass 권한을 켜도 Claude Code는 `.claude/` 파일에 대한 모든 작업 — Edit, Write, cp, mv, rm, sed -i — 에서 여전히 권한 요청을 띄웁니다. `.claude/` 디렉토리는 bypass 모드가 의도적으로 건드리지 않는 보호 구역입니다. AI가 설정 파일을 수정할 때마다 다이얼로그가 뜨고, 설정이나 CLAUDE.md를 자주 고치는 세션에서는 bypass 모드를 켰는데도 10-20번 중단됩니다.

이 훅은 Claude Code의 빌트인 체크가 작동하기 전에 해당 작업을 가로채서 차단하고, 보호를 완전히 우회하는 node 기반 대안(`fs.copyFileSync`, `fs.unlinkSync`)을 AI에게 안내합니다. AI가 알아서 전환하므로 다이얼로그는 아예 뜨지 않습니다.

추가로, 핵심 설정 파일(CLAUDE.md, settings.json, settings.local.json, .claude.json)이 삭제되거나 이동되는 것을 우회 방법 없이 차단합니다 — 이 파일들이 사라지면 Claude Code가 깨지기 때문입니다.

## 왜 필요한가

1. **bypass 권한이 `.claude/`는 bypass 안 합니다.** `--dangerously-skip-permissions`를 켰는데도 `.claude/` 작업은 여전히 물어봅니다. 이 훅이 그 빈틈을 메웁니다.
2. **node 우회 방법이 있지만 AI가 모릅니다.** `node -e "require('fs').copyFileSync(...)"` 는 빌트인 체크에 안 걸리지만, AI는 기본적으로 `cp`, `mv`, `rm`을 사용합니다 — 이것들은 걸립니다. 이 훅이 AI에게 우회 방법을 자동으로 안내합니다.
3. **핵심 파일은 다이얼로그가 아니라 진짜 보호가 필요합니다.** AI가 `rm settings.json`을 시도하고 "허용"을 무심코 누르면 Claude Code가 깨집니다. 이 훅은 다이얼로그 자체를 없애고 우회 방법도 안내하지 않습니다 — 실수로 승인할 기회 자체가 없어집니다.

## 동작 방식

훅은 두 가지 역할을 수행합니다:

**역할 1 — 권한 요청 건너뛰기**: `.claude/` 권한 다이얼로그를 띄울 작업을 가로채서 차단하고, node 기반 우회 방법을 안내합니다. AI가 우회 방법을 자율적으로 사용하므로 사용자 개입이 필요 없습니다. 이 플러그인을 설치하는 주된 이유입니다.

**역할 2 — 핵심 파일 보호**: 필수 설정 파일에 대한 `rm`과 `mv FROM`을 우회 방법 없이 차단합니다. 이 파일들은 절대 사라지면 안 됩니다. 백그라운드에서 조용히 동작합니다.

| 작업 | .claude/ 파일 | 핵심 파일 |
|---|---|---|
| `Edit` / `Write` | 차단 → node 복사+편집+복사 | 동일 |
| `cp FROM .claude/` | 차단 → `copyFileSync` | 동일 |
| `mv FROM .claude/` | 차단 → `copyFileSync + unlinkSync` | **차단, 우회 없음** |
| `rm .claude/파일` | 차단 → `unlinkSync` | **차단, 우회 없음** |
| `sed -i .claude/파일` | 차단 → 복사+sed+복사 | 동일 |
| `cat .claude/파일` | 통과 | 통과 |
| `node -e "fs.copyFileSync(...)"` | 통과 | 통과 |
| `cp TO .claude/` | 통과 | 통과 |

## 설치

```
/plugin install guard-claude-dir@codedby-claude-box
```

별도 설정 불필요 — PreToolUse 훅은 설치 시 자동 등록됩니다.

### 업데이트

```
/guard-claude-dir:update
```

이후 `/reload-plugins` 입력 또는 Claude Code를 재시작하세요.

### 한국어 전환

```
/guard-claude-dir:localize-ko
```

문서와 스크립트를 한국어로 전환합니다. 영어 원본은 `.en.md`/`.en.mjs`로 자동 백업됩니다.

<details>
<summary>수동 업데이트 (/guard-claude-dir:update가 안 될 때)</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/guard-claude-dir/
claude plugin update guard-claude-dir@codedby-claude-box -s user
```

Claude Code를 재시작합니다.

> PowerShell 사용자: 위 명령에서 `~`를 `$HOME`으로 바꾸세요.

</details>

<details>
<summary>"핵심 파일"이란?</summary>

다음 파일은 삭제와 이동이 차단됩니다 (역할 2):

- `~/.claude/claude.md` (프로젝트 `.claude/claude.md` 포함)
- `~/.claude/settings.json` (프로젝트 `.claude/settings.json` 포함)
- `~/.claude/settings.local.json` (프로젝트 `.claude/settings.local.json` 포함)
- `~/.claude.json`

핵심 파일의 내용 수정(Edit, Write, sed -i)은 다른 파일과 동일하게 역할 1로 처리됩니다 — 차단 후 node 우회 안내. 파일 자체를 제거하는 작업(rm, mv FROM)만 우회 없이 차단됩니다.

</details>

<details>
<summary>메모리 경로 예외</summary>

`~/.claude/projects/*/memory/` 경로는 Claude Code의 auto-memory 기능이 Edit/Write 도구로 직접 쓰는 곳입니다. 이 훅은 메모리 경로에 대한 Edit/Write를 예외 처리하여 auto-memory가 정상 동작하도록 합니다.

메모리 경로에 대한 Bash 작업(cp, mv, rm, sed -i)은 예외가 아닙니다 — 빌트인이 여전히 권한 요청을 띄우므로 훅이 선제 차단합니다.

</details>

<details>
<summary>제한 사항</summary>

- **Node.js 필요.** 훅은 `node guard-claude-dir.mjs`로 실행됩니다. Node.js 없이 네이티브 인스톨러로 Claude Code를 설치한 경우 훅이 실행되지 않습니다. 이 경우 빌트인 권한 요청(클릭이 더 많지만 파일은 보호됨)으로 돌아갑니다.
- **에러 시 통과.** 훅이 크래시하면(JSON 파싱 실패 등) 코드 0(허용)으로 종료합니다. 훅 버그가 모든 도구 사용을 차단하는 것을 방지하지만, 고장난 훅은 보호를 제공하지 않습니다.
- **리디렉션 미감지.** `curl http://... > ~/.claude/settings.json`이나 `python3 -c "..." > ~/.claude/file`은 write 패턴 목록에 잡히지 않습니다. Claude Code는 보통 파일 생성에 Write 도구를 사용하므로 위험은 낮습니다.
- **`-t` 플래그 미처리.** `mv -t /tmp/ ~/.claude/settings.json`은 인자 순서가 뒤바뀝니다(목적지가 먼저). 훅은 마지막 인자를 목적지로 가정합니다. Claude Code 출력에서 이 구문이 나올 가능성은 낮습니다.
- **따옴표 인식 O, 쉘 완전 파싱 X.** 명령 분리기는 `"..."`, `'...'`, `\\` 이스케이프를 처리합니다. heredoc, `$(...)` 치환, 백틱 명령 치환은 처리하지 않습니다. Claude Code의 도구 호출에서 이런 경우는 드뭅니다.

</details>


## 면책 조항

이 플러그인은 훅, 스킬, 커맨드를 통해 Claude Code의 동작을 변경합니다. 현재 상태 그대로 제공되며 어떠한 보증도 없습니다. 사용에 따른 책임은 사용자에게 있습니다. 데이터 손실, 설정 손상, 의도치 않은 동작에 대해 작성자는 책임지지 않습니다. 시스템 설정과 상호작용하는 플러그인을 설치하거나 업데이트하기 전에 항상 중요한 파일을 백업하세요.

## 라이선스

MIT
