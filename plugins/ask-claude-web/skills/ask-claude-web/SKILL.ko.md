---
name: ask-claude-web
argument-hint: "claude.ai와 [주제나 맥락] 의논해"
description: "'웹 클로드', '웹클로드', 'claude.ai', 'web Claude', '클로드 웹', '클로드 챗봇', 'Claude chatbot'이 통신 대상으로 언급되면 이 스킬을 로드할 것. claude.ai 웹 탭에 메시지를 보내고 응답을 받는 자동 통신 스킬. 의논, 검증, 리뷰, 질문, 인사, 전달, 공유, 상의 등 claude.ai와의 모든 상호작용에 해당. chrome-devtools MCP 기반. claude.ai 탭과의 실시간 대화 전용."
---

# ask-claude-web 스킬

## 개요

chrome-devtools MCP를 통해 Claude Code와 claude.ai 간의 협업을 자동화하는 스킬. 의논, 검토, 검증, 질문에 다회전 대화 지원.

## 규칙

- evaluate_script에 파일 내용을 절대 넣지 마라 (template literal, args, DataTransfer, Read 도구 전부 금지). 파일 첨부는 클립보드 Ctrl+V만 사용.
- 대량 토큰을 소모하는 방식 사용 금지. (예: take_snapshot은 1회에 13만자 토큰 소모)

## 사전 조건

- **Chrome**이 실행 중이어야 함 — 꺼져 있으면 사용자에게 Chrome을 직접 실행해달라고 안내할 것. 시스템 명령으로 Chrome을 켜지 마라 — MCP 초기화 이후에 뜬 Chrome에는 연결할 수 없다.
- `chrome://inspect/#remote-debugging` 토글이 ON이어야 함
- **chrome-devtools MCP 서버**가 Claude Code에 연결되어 있어야 함 (`/mcp`에서 `chrome-devtools · ✔ connected` 확인)
- Chrome에 **claude.ai 탭**이 열려있어야 함 (로그인 상태)
- **세션 첫 연결 시**: Chrome에 원격 디버깅 허용 확인창이 뜬다 — 사용자가 **허용(Allow)**을 눌러야 한다. Claude Code 세션당 1회 발생.
- **연결 실패 시**: Chrome이 켜진 상태에서 `/mcp`로 chrome-devtools를 재연결(reconnect)하라고 안내할 것.

## claude.ai 탭 선택

사용자가 탭/URL/새 채팅을 지정했는지 확인한다. 지정했으면 그것을 사용 — list_pages 결과와 무관하게.
지정하지 않았으면: 현재 열린 claude.ai 채팅창을 사용. 탭 번호를 모르면 `list_pages` → `select_page`. 탭이 없으면 `new_page`로 열기.
claude.ai 탭이 없으면 기억된 URL 또는 `https://claude.ai/`로 이동.

## 메시지 전송

> `{baseDir}` = 이 SKILL.md가 있는 디렉토리. DOM 스크립트: `{baseDir}/scripts/`. OS 스크립트: `${CLAUDE_PLUGIN_ROOT}/scripts/`.

### 텍스트만

send.js를 `__EXPECTED_ATTACHMENTS__` = 0으로 실행. 아래 "send.js 실행" 참조.

### 파일 첨부 있음

1. 클립보드에 파일 복사:

| OS | 명령 |
|----|------|
| **Windows** | `powershell -File "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files.ps1" "파일1.md" "파일2.md"` |
| **macOS** | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files-mac.sh" "파일1.md" "파일2.md"` |
| **Linux** | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files-linux.sh" "파일1.md" "파일2.md"` |

여러 파일 경로 → 한 번의 Ctrl+V로 전부 첨부.

2. 입력창 포커스 (evaluate_script):
   - 셀렉터: `[contenteditable="true"][data-placeholder]` → fallback `[contenteditable="true"]`
   - 반환: 'FOCUSED' 또는 'NOT_FOUND'

3. 붙여넣기:
   `press_key` — `Control+v` (Windows/Linux) 또는 `Meta+v` (macOS)

4. (선택) 파일 첨부 확인 (evaluate_script, ~100토큰):
   - `fieldset` 내 삭제 버튼 수를 파일삭제 정규식으로 카운트; 파일명은 삭제 버튼 aria-label(`"<ts>_<파일> 제거"`) 또는 칩 리프 텍스트(`"<ts>_<파일>"`)에서 — `^\d+_` 타임스탬프 접두사 제거
   - 반환: { count, names: [파일명] }

5. send.js를 `__EXPECTED_ATTACHMENTS__` = 파일 수로 실행. 아래 "send.js 실행" 참조.

### send.js 실행

실행: `{baseDir}/scripts/send.js`를 Read로 읽어 플레이스홀더를 치환한 뒤 evaluate_script에 **그대로 전달 — 재작성 금지**.
- `__MESSAGE__` → 전송할 메시지 텍스트 (`"` → `\"` 이스케이프)
- `__EXPECTED_ATTACHMENTS__` → 예상 첨부 파일 수 (텍스트만: 0, 파일 있음: 파일 수)

결과 처리:
- { sent: true } → 건강 체크로 진행
- { sent: false, error: 'STILL_STREAMING' } → 응답 대기 후 재시도
- { sent: false, error: 'CLEANUP_FAILED' } → send.js 재시도
- { sent: false, error: 'MISSING_ATTACHMENTS' } → 파일 다시 붙여넣기 후 재시도
- { sent: false, error: 'SEND_BTN_NOT_FOUND' } → L2 정규식 폴백도 실패; "고장 대응" 절 참조 (반환된 `buttons` 목록이 진단 자료)
- { error: 'INPUT_NOT_FOUND' } → L2 폴백도 실패; "고장 대응" 절 참조

### 전송 확인 — 건강 체크 (단일 async evaluate_script)

- 2초 대기 후 3가지를 한번에 확인:
  1. 입력창 비어있는지 (textContent.length < 5)
  2. 스트리밍 시작됐는지 (stop 버튼: aria-label "Stop Response", "응답 중단", "Stop response")
  3. 응답 나타나는지 (extract-response.js와 같은 방식으로 응답 길이 확인)
- 반환: { inputEmpty, inputTextLen, isStreaming, responseLen }
- 판정:
  - 입력창 비어있음 + 스트리밍 중 → 전송 성공, 응답 대기로 진행
  - 입력창에 텍스트 남음 + 스트리밍 아님 → 전송 실패, send.js 재실행 (최대 2회)
  - 입력창 비어있음 + 스트리밍 아님 → 모호, responseLen으로 추가 판단

## 응답 대기

실행: `{baseDir}/scripts/wait-streaming.js`를 Read로 읽어 `__TIMEOUT__`을 치환(300000 기본, 600000 웹 검색/딥 리서치) 후 evaluate_script에 **그대로 전달 — 재작성 금지**.
반환: 'DONE' 또는 'TIMEOUT'

결과 처리:
DONE → 안정성 체크로 진행.

TIMEOUT → **반드시 안정성 체크를 먼저 실행** 후 판단:
- stable + len > 0 → 응답 완료, 추출 진행
- len 0 → claude.ai 오류, 메시지 재전송
- !stable + len > 0 → 생성 중 확인됨 (claude.ai의 컨텍스트 압축 중일 수 있음 — 정상 동작, 대기 연장). wait-streaming.js 1회 재시도 (+5분):
  → DONE → 안정성 체크로 진행
  → TIMEOUT → **반드시 안정성 체크를 다시 실행**:
    - stable + len > 0 → 응답 완료, 추출 진행
    - 그 외 → 진단 모드:
      1. 부분 응답 추출 — 의미 있는 내용인가?
      2. 마지막 전송 메시지가 페이지에 있는지 확인 (전송 실패?)
      3. 의미 있는 내용 → 부분 응답 사용, "응답이 불완전할 수 있음" 경고
         전송 메시지 없음 → 재전송. 전송 메시지 있으나 의미 있는 응답 없음 → 재전송

wait-streaming.js가 에러를 반환하면 — 수동 폴링 (evaluate_script):
- stop 버튼(aria-label: "응답 중단", "Stop Response", "Stop response") 또는 `[data-is-streaming="true"]` 체크
- 반환: { isStreaming, hasStopButton, hasStreamingAttr }
- 3~5초 간격 반복, isStreaming false면 완료

### 응답 완료 확인 — 안정성 체크 (단일 async evaluate_script)

- extract-response.js와 같은 방식으로 응답 텍스트 길이를 2회 측정 (3초 간격)
- 두 번의 길이가 동일하고 0보다 크면 완료
- 반환: { len1, len2, stable: len1 === len2 && len1 > 0 }
- stable: false → 반복 (최대 3회), 이후에도 불안정하면 추출 시도

## 응답 읽기

추출 전 대화 컨테이너를 맨 아래로 스크롤 (evaluate_script, 권장):
- 마지막 `[data-testid="user-message"]`에서 부모를 올라가며 스크롤 가능 요소(scrollHeight > clientHeight + 100) 찾아 scrollTop = scrollHeight
- 반환: 'SCROLLED' 또는 'NO_SCROLLABLE_FOUND'
- 제약: 응답 추출과 반드시 별도 evaluate_script 호출 (브라우저 렌더링 시간 필요)

### 마지막 응답 추출

실행: `{baseDir}/scripts/extract-response.js`를 Read로 읽어 evaluate_script에 **그대로 전달 — 재작성 금지**.
스크린샷으로 읽지 마라 — 긴 응답은 화면에 다 안 들어온다.

결과 처리:
응답 전체 텍스트 → 그대로 사용.
'ASSISTANT_RESPONSE_NOT_FOUND' → DOM 구조 변경 가능성, evaluate_script로 탐색.

추출 후, 응답이 보낸 질문과 맥락이 맞는지 그리고 이전 응답이 아닌지 확인 필요.

⚠️ **서버 불안정**
claude.ai가 장애 중일 때 토스트 에러가 뜰 수 있다. 증상: 빈 응답, 또는 이전 대화의 응답이 추출됨.
의심되면 바로 재시도하지 말고 잠시 기다린 후 판단할 것.
스피너는 응답 상태 판단에 사용 불가 — 응답 완료 후에도 항상 페이지에 존재함. stop 버튼(aria-label: "응답 중단", "Stop Response", "Stop response") 또는 `[data-is-streaming="true"]`로만 판단.

### 에러 응답 원칙

**추출된 응답이 이상하면(너무 짧거나 예상과 다른 내용), 가정만으로 판단하지 말고 — 스크린샷을 찍거나 DOM을 다시 읽어 실제 상태를 확인한 후 행동하라.**

## 아티팩트 수신

웹 클로드가 아티팩트(코드 파일 등)를 생성하면 **컨텍스트 소모 0**으로 로컬에 저장한다.

### Chrome 다운로드 경로 감지

아티팩트 수신 전 Chrome 다운로드 디렉토리를 확인:
```
Bash - node -e "const p=require('path'),os=require('os'); const prefs=JSON.parse(require('fs').readFileSync(p.join(os.homedir(),'AppData/Local/Google/Chrome/User Data/Default/Preferences'),'utf8')); console.log(prefs.download?.default_directory || p.join(os.homedir(),'Downloads'))"
```
> macOS: `~/Library/Application Support/Google/Chrome/Default/Preferences`
> Linux: `~/.config/google-chrome/Default/Preferences`

### 응답에 아티팩트가 있는지 확인 (evaluate_script)

- 셀렉터: 마지막 응답의 `[data-testid*="artifact"]`, `[role="button"]`
- "Download"/"다운로드" 포함 텍스트에서 이름 추출 ("all"/"모두" 제외)
- 반환: { count, artifacts: [이름 문자열] }

### 아티팩트 다운로드 클릭 (evaluate_script)

- 마지막 응답에서 artifactName을 포함하는 카드 특정
- 셀렉터: `[data-testid*="artifact"]`, `[role="button"]`
- 해당 카드 내부에서 다운로드 버튼 탐색 (aria-label 또는 텍스트에 /download|다운로드/i)
- 제약: 버튼 탐색은 반드시 카드 내부만. `document.querySelectorAll('button')` 페이지 전체 탐색 금지
- 검증: 생성 코드에 `document.querySelectorAll('button')`이 있으면 잘못된 것
- 반환: 'downloading <name>' 또는 'CARD_NOT_FOUND' / 'DL_BTN_NOT_FOUND'

### 다운로드 절차 (클릭 후)

1. 다운로드 완료 대기 (1-2초):
```
Bash - sleep 2
```

2. 다운로드 폴더에서 최신 파일 찾기 (Chrome은 중복 시 `(N)` 추가):
```
Bash - ls -t "<다운로드경로>/파일명"* | head -1
```

3. 원하는 위치로 이동:
```
Bash - mv "<다운로드파일경로>" "<최종위치>"
```

4. 추가 아티팩트에 대해 반복.

> 참고:
> - Chrome은 중복 다운로드를 `파일명 (N).확장자`로 저장. `ls -t glob | head -1`로 최신 파일 선택.
> - 아티팩트가 없는 응답은 count 0 반환.
> - "Download" 버튼 텍스트는 UI 언어에 따라 다름 (`Download` / `다운로드`).

---

## 영어 대화 모드 — 토큰 절약

claude.ai와의 대화: 사용자가 보고 있으면 사용자 언어, 자동 처리면 "Answer in English only." 붙여서 영어로.
사용자에게 보여주는 텍스트(CLI 출력, 보고)는 항상 사용자 언어.

## 다회전 대화

의논/검토/검증 시 결론이 나올 때까지 후속 메시지를 보낸다. 동의하지 않거나 반론이 있으면 자신의 의견을 전달하라. 단순 질문은 1회로 충분.
메시지에 현재 상황 + 필요한 입력(리뷰/검증/의견) + 자신의 분석과 구체적 질문을 포함. 자료만 던지고 "어떻게 생각해?" 금지.

## 대화 결론 보존

claude.ai와 대화 후, 파일에 기록되지 않은 결정/발견이 있으면 기록으로 남겨라. 전체 대화를 복사하지 말고 결론만 추출.

## 검증 프로토콜 태그 (VERIFICATION_TAG)

웹 클로드에게 검증을 요청할 때, 메시지 끝에 이 태그를 붙인다.

**태그 (검증 요청 메시지 끝에 그대로 붙여넣기):**
```
---
[VERIFICATION PROTOCOL]
After your review, end your response with exactly one of:
⚠️ CORRECTIONS: [N] — fix these and send back for re-verification.
✅ CONFIRMED — no issues found.
---
```

**사용 규칙:**
- 검증(VERIFY) 메시지에만 붙인다
- 지시 요청(INSTRUCT) 메시지에는 붙이지 않는다
- `"Answer in English only."`와 독립적으로 붙인다 (영어 지시는 모든 메시지에 별도 적용)

---

## 견고성 & 셀렉터 해석

스크립트는 UI 요소를 **L1(정확 aria-label) → L2(양국어 정규식)** 순으로 해석한다. 단일 하드코딩 문자열을 쓰지 않는다. 이로써 라벨 변경, 동적 접미사(예: `"<ts>_<파일>.png 제거"`), EN/KR 언어를 코드 수정 없이 흡수한다. 우선순위: 안정 앵커(`data-testid`, ARIA role/heading, live-region status) > aria-label/텍스트 정규식 > 구조적 위치. 빌드 생성 CSS 클래스는 단독 의존 금지(`.font-claude-response`는 *우선* 경로일 뿐 폴백 있음).

스크립트가 쓰는 정규식 (한 패턴이 두 언어 모두 커버):
- Stop 버튼: `/(중단|중지|stop\s*response)/i`
- 전송 버튼: `/(보내기|전송|send\s*message)/i`
- 파일 삭제: `/(제거|삭제|remove|delete)\s*$/i` — 접미사 매칭, `"제거"`와 `"<ts>_<파일> 제거"` 모두 매칭

**읽기 vs 행동 비대칭**: 추출(읽기)은 구조 점수화(L3)까지 폴백 가능 — 오선택해도 추출 후 맥락 검증에서 잡히므로. 전송·삭제(행동)는 L2에서 멈추고 **추측하지 않고 중단** — 잘못된 행동은 되돌리기 어렵기 때문.

## 검증된 셀렉터

| 구성 요소 | 해석 방식 | 검증일 | 비고 |
|-----------|----------|--------|------|
| Stop 버튼 | 위 정규식; L1 정확 `"응답 중단"`/`"Stop response"` | 2026-06-25 | `[data-is-streaming="true"]`도 사용 |
| 파일 삭제 | 위 정규식(접미사) | 2026-06-25 | `"<ts>_<파일> 제거"` 동적 라벨 대응 |
| 전송 버튼 | 위 정규식; L1 정확 `"메시지 보내기"`/`"Send Message"` | 2026-06-25 | 존재+활성화까지 폴링 (React 렌더 레이스) |
| 응답 본문 | `.font-claude-response`(우선) → 마지막 user-message의 콘텐츠 보유 형제 → 구조(L3) | 2026-06-25 | sr-only "Claude 응답:" 헤딩 없는 깨끗한 텍스트 |
| 사용자 앵커 | `[data-testid="user-message"]` | 2026-06-25 | 추출 앵커 — 가장 치명적 의존성 |

## 고장 대응 (L2 폴백으로도 안 될 때)

claude.ai의 DOM 구조는 사용 도중 바뀌지 않는다(SPA 번들이 페이지 로드 시점에 고정됨). 진짜 구조 변화는 세션 시작/페이지 (재)로드 시점 — 보통 사용자가 보고 있을 때 표면화된다. 그래서 자율 수정은 불필요하고, 컨펌받은 사람 검토 수정이 더 안전하다.

1. **즉시 스킬 사용 중단** — 고장난 셀렉터로 웹 클로드에 계속 재시도 금지(연쇄 오류·토큰 낭비 방지).
2. **무엇이 깨졌는지 보고**: 실패한 동작/셀렉터 + DOM에서 관찰된 실제 aria-label/구조 (스크립트는 `SEND_BTN_NOT_FOUND` 시 압축된 `buttons` 목록을 반환; 다른 실패도 동등 정보 수집 — **take_snapshot 금지**).
3. **수리 경로를 제시·선택받기** (기본값은 작업 무게로 판단):
   - (a) 이 세션에서 지금 수정
   - (b) 서브에이전트로 격리 수정 (요약만 반환 → 메인 컨텍스트 오염 최소)
   - (c) 진단을 temp 디렉토리의 `.md`로 떨구고 새 세션에서 수정
   - 기본값: 스킬이 계속 필요 → (b)/(a); 메인 작업이 무겁고 스킬 불필요 → (c)
4. 어떤 수정이든 **사용자 컨펌 후에만** 적용하고, 제안한 셀렉터는 **라이브 DOM에 재검증** — 이전 진단을 맹신하지 말 것(그 사이 또 바뀌었을 수 있음).

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| chrome-devtools MCP disconnected | `/mcp`에서 chrome-devtools 선택 후 재연결 |
| 입력 필드를 못 찾음 | claude.ai UI 업데이트됨 — `evaluate_script`로 `[contenteditable="true"]` 탐색 |
| 응답을 못 읽음 | `[data-testid="user-message"]` 셀렉터 변경됨 — `evaluate_script`로 DOM 재탐색 |
| "Server running at: starting…" | MCP 클라이언트(Claude Code)가 도구를 호출해야 서버가 시작됨 |
