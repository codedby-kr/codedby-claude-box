[English](./README.md)

# ask-claude-web

**복사-붙여넣기 없이 claude.ai와 Claude Code가 직접 대화합니다.**

**최신: v1.8.0** · [변경 이력](./CHANGELOG.md)

PEV Loop (Plan → Execute → Verify), Multi-Agent Orchestration —
2026년 AI 개발의 핵심 패턴들은 모두 "AI가 혼자 하지 않고, 역할을 나눠서 협업한다"는
방향을 가리킵니다. 이 플러그인은 그 협업을 claude.ai와 Claude Code 사이에서 자동화합니다.

chrome-devtools MCP를 통해 질문을 보내고, 응답을 기다리고, 답변을 가져옵니다.
복사-붙여넣기 없이, 추가 비용 없이, 기존 구독 안에서.

---

## 왜 필요한가

많은 개발자가 이미 이렇게 일하고 있습니다:

1. **클로드코드**에서 코드를 작성한다
2. 문제가 생기거나 설계 검토가 필요하면, **claude.ai 웹**을 연다
3. 코드나 상황을 **복사해서 붙여넣고** 의견을 구한다
4. 웹 클로드의 답변을 **다시 복사해서** 클로드코드에 붙여넣는다
5. 반복한다

이렇게 하는 이유는 명확합니다:
- 클로드코드는 코딩 실행은 빠르지만, **혼자 방향을 잡으면 잘못된 길로 깊이 빠지는 경우가 많습니다**
- claude.ai 웹은 같은 모델이지만 **다르게 튜닝되어 있어서**, 코드에만 매몰되지 않는
  넓은 시각을 제공합니다 (더 풍부한 웹 검색, Deep Research, Artifacts 등의 고유 기능 포함)
- **계획→실행→검증을 분리하면 결과물 품질이 확연히 올라간다**는 건
  2026년 개발 커뮤니티의 공통된 합의입니다 (PEV Loop, Spec-Driven Development)

문제는 **복사-붙여넣기가 지겹고, 지치고, 시간을 잡아먹는다**는 겁니다.

**이 플러그인은 그 복사-붙여넣기를 자동으로 해줍니다.**

---

## 배경

저도 같은 식으로 일하고 있었습니다.  
클로드코드로 작업 하기 전이나 작업을 하던 중  
설계나 코드에 긴 논의가 필요할 때마다  
claude.ai를 열고, 복사와 붙여넣기를 무한 반복하는..

다른 사람들은 어떻게 하고 있나 찾아보니까  
대부분은 직접 복붙을 하면서 건초염을 앓고 있거나  
일부는 Anthropic API를 쓰는 방식뿐이었습니다.  
API 방식은 구독과 별개로 비용이 추가 되기도 하고  
제가 원하는 claude.ai를 사용하는게 아니다 보니까  
claude.ai만의 강점을 가져 갈 수도 없었습니다.

그래서 ai에게 만들어 달라고 했더니 그런건 없다고 합니다.  
아무래도 기존에 있는 방식이 아니다 보니 아이디어가 없는 탓이겠죠.  
그냥 제가 만들기로 했습니다.  
chrome-devtools MCP로 claude.ai 웹을 사용해서  
무한 복사-붙여넣기를 자동화하는 플러그인을요.

---

## 주요 기능

- **자동 대화 (백그라운드 가능)**: 복사-붙여넣기, 탭 전환 — 전부 자동. 크롬을 점유하지 않습니다.
- **스크린샷 없이 동작**: 스크린샷 한 장에 ~3,000 토큰이 소모되지만,
  이 플러그인은 DOM에서 직접 필요한 정보만 추출합니다 (~50 토큰, **98% 절약**).
- **파일 첨부 (0 토큰)**: OS 클립보드 경유, 컨텍스트 소모 없음.
- **전체 응답 추출**: DOM 직접 추출, 길이 제한 없음.

<details>
<summary><strong>vs. Claude Computer Use (2026년 3월 출시)</strong></summary>

Computer Use는 Anthropic이 새로 출시한 기능으로, Claude가 마우스/키보드로
데스크톱을 직접 제어합니다. 범용적이지만, claude.ai와의 대화 자동화에는
이 플러그인이 더 적합합니다:

| | 이 플러그인 | Computer Use |
|-|-----------|-------------|
| **속도** | DOM 직접 조작 (스크린샷/시각인식 불필요) | 동작 하나에 2-5초 (스크린샷→인식→클릭) |
| **플랫폼** | Windows, macOS, Linux | macOS 전용 (리서치 프리뷰) |
| **보안** | 브라우저 탭 1개만 접근 | OS 전체 마우스/키보드 제어 + 화면 전체 노출 |
| **정확도** | 결정적 DOM 셀렉터 | 시각 인식 (테마/줌/해상도에 따라 달라짐) |
| **긴 응답** | 한 번에 전체 텍스트 추출 | 화면에 보이는 부분만 → 스크롤 + 결합 필요 |
| **대기** | 비동기 폴러 1회 호출로 자동 대기 (그 사이 다른 작업 가능) | 완료 확인을 위해 계속 스크린샷 촬영 |
| **사용자 자유도** | 컴퓨터 자유롭게 사용 가능 (다른 크롬 탭 포함) | AI가 마우스/키보드 점유, 사용자 작업 불가 |
| **범위** | claude.ai 탭만 | 데스크톱 전체 |
| **상태** | 안정 (v1.0.0부터) | 리서치 프리뷰 ("아직 초기 단계" — Anthropic) |

</details>

<details>
<summary><strong>활용 사례 + 왜 같은 모델인데 다른 결과가 나오는가</strong></summary>

"claude.ai와 의논해"라고 지시하면, 설계 검토, 세컨드 오피니언,
디버깅 방향 상의, 문서화 등 다양한 상황에서 활용할 수 있습니다.
claude.ai의 Deep Research나 더 풍부한 웹 검색도 활용 가능합니다.

**같은 모델 가중치, 다른 시스템 프롬프트와 도구 구성:**

| | claude.ai (웹) | Claude Code |
|-|---------------|-------------|
| **관점** | 코드 + 전체 맥락을 함께 봄 | 코딩 실행에 집중 |
| **고유 도구** | 웹 검색 (결과 직접 요약), Deep Research, Artifacts | 파일 편집, bash, git, MCP |
| **컨텍스트 수명** | 텍스트 대화 위주 → 오래 유지 | 파일/bash/diff로 빠르게 소진 |
| **경향** | 한 발 물러서서 전체를 봄 | 바로 구현에 들어감 |

이 차이를 활용하면 단일 도구로는 불가능한 **계획→실행→검증** 루프가 만들어집니다.
기존 claude.ai 구독 안에서 동작 — **추가 비용 $0**.

> **언어별 참고**: TypeScript, Rust, PHP, Kotlin/Swift 등 클로드코드의 품질이
> 떨어지는 언어에서 웹 클로드의 세컨드 오피니언이 특히 효과적입니다.

> **관련 트렌드**: **PEV Loop** — 웹 클로드가 Plan/Verify, 클로드코드가 Execute.
> **Multi-Agent Orchestration** — 역할을 부여한 서브에이전트가 아닌,
> 애초에 다르게 튜닝된 완제품(claude.ai)과의 협업을 자동화.
> **Agentic Engineering** — Karpathy가 명명한 vibe coding의 다음 단계.

</details>

---

## 설치

### 요구 사항

- **Claude Code** v1.0.0 이상 (플러그인 시스템 지원 필요)
- **claude.ai 계정** — Pro 또는 Max 구독 권장

### 1. Chrome 준비

Chrome을 수동으로 실행 → `chrome://inspect/#remote-debugging` → **"Allow remote debugging for this browser instance"** 체크

### 2. 플러그인 설치

```bash
/plugin marketplace add codedby-kr/codedby-claude-box
/plugin install ask-claude-web@codedby-claude-box
```

### 3. chrome-devtools MCP 설치

```bash
/ask-claude-web:setup
```

OS를 자동 감지하여 chrome-devtools MCP 서버를 설치합니다.

<details>
<summary>수동 MCP 설정 (고급)</summary>

chrome-devtools를 직접 설정하려면:

**macOS / Linux:**
```bash
claude mcp add chrome-devtools -s user -- npx -y chrome-devtools-mcp@latest --autoConnect
```

**Windows:**
```bash
claude mcp add-json chrome-devtools '{"type":"stdio","command":"cmd","args":["/c","npx","-y","chrome-devtools-mcp@latest","--autoConnect"]}' -s user
```

</details>

MCP 연결 확인: `/mcp` → `chrome-devtools · ✔ connected`

### 4. claude.ai 열기

[claude.ai](https://claude.ai) 탭을 열고 로그인. 첫 연결 시 Chrome 권한 대화상자에서 **"허용"** 클릭.

### 업데이트

```
/ask-claude-web:update
```

최신 버전을 가져오고, 캐시를 정리하고, 플러그인을 업데이트합니다.
완료 후 `/reload-plugins` 입력 또는 Claude Code를 재시작하세요.

<details>
<summary>수동 업데이트</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/ask-claude-web/
claude plugin update ask-claude-web@codedby-claude-box -s user
```

완료 후 `/reload-plugins` 입력 또는 Claude Code를 재시작하세요.

> PowerShell 사용자: 위 명령에서 `~`를 `$HOME`으로 바꿔주세요.

</details>

---

## 사용법

- `"claude.ai와 의논해"` / `"ask claude.ai [your question]"`
- `"claude.ai한테 해결해달라고 해"` / `"let claude.ai handle this"`
- `"이건 claude.ai가 더 잘 알 거야"` / `"claude.ai would know this better"`

파일 첨부: `"main.py 첨부해서 claude.ai한테 리뷰 요청해"`

### 커맨드

| 커맨드 | 설명 |
|--------|------|
| `/ask-claude-web:execute-loop-doc` | 문서에 기술된 작업 계획을 항목별로 실행. 웹 클로드가 중간 관리자 역할 — 지시, 검토, 수정 요청. 단독 모드(자체 검증)도 지원. |
| `/ask-claude-web:execute-loop-msg` | 동일한 반복 실행이지만 문서 대신 사용자 메시지에서 작업 계획을 구성. |
| `/ask-claude-web:localize-ko` | 플러그인의 문서와 스크립트를 한국어로 전환. 영어 원본은 `.en.md`/`.en.mjs`로 백업. |

```
/ask-claude-web:execute-loop-doc "계획문서/경로.md" 웹 클로드 검증
/ask-claude-web:execute-loop-msg auth 모듈 리팩터링, 웹 클로드 검증
```

---

## 한국어 전환

스킬, 커맨드, README 등 모든 문서와 스크립트를 한국어로 전환할 수 있습니다:

```
/ask-claude-web:localize-ko
```

영어 원본은 `.en.md`/`.en.mjs`로 자동 백업되며, 원본이 사라지지 않습니다.

<details>
<summary><strong>플랫폼 지원</strong></summary>

| 플랫폼 | 대화 | 파일 첨부 | 상태 |
|--------|------|----------|------|
| **Windows** | ✅ 완전 지원 | ✅ 완전 지원 (PowerShell + 클립보드) | **테스트 완료** |
| **macOS** | ✅ 완전 지원 | ⚠️ 실험적 (osascript) | 미테스트 |
| **Linux** | ✅ 완전 지원 | ⚠️ 실험적 (xclip) | 미테스트 |

대화 기능은 브라우저 DOM 기반이라 모든 플랫폼에서 동작. 파일 첨부는 OS 클립보드 API 의존.
Linux: `sudo apt install xclip` 필요.

</details>

<details>
<summary><strong>제한 사항</strong></summary>

- **DOM 의존성**: claude.ai UI 업데이트 시 셀렉터가 깨질 수 있음. 셀렉터는 **L1(정확 aria-label) → L2(양국어 정규식)** 순으로 해석해 라벨/언어 변화를 흡수하며, 그래도 실패하면 스킬이 **중단하고 진단을 보고한 뒤 사용자 컨펌을 받아 수정**합니다(맹목적 자율 수정 없음).
- **Chrome 수동 설정**: 원격 디버깅을 수동으로 활성화해야 함.
- **세션 권한**: Chrome 권한 대화상자가 세션마다 한 번 표시.
- **Chrome 창 필요**: Chrome이 실행 중이어야 하며, GUI 없이 백그라운드로만 실행하는 헤드리스 모드는 지원하지 않음. (다른 탭에서 작업하거나 Chrome 창이 가려지는 것은 문제 없음)
- **claude.ai 메시지 쿼터**: 자동화된 대화도 구독 메시지 한도에 포함.

</details>

<details>
<summary><strong>문제 해결</strong></summary>

| 문제 | 해결 방법 |
|------|----------|
| MCP 연결 끊김 | `/mcp`에서 chrome-devtools 재연결 |
| 입력 필드를 못 찾음 | claude.ai UI 업데이트 — 스킬이 fallback 셀렉터 시도 |
| 응답 추출 실패 | DOM 구조 변경 — 검증된 셀렉터 표 확인 |
| Chrome 권한 대화상자가 뜸 | 세션당 한 번 표시됨 — "허용" 클릭하면 세션이 끝날 때까지 다시 안 뜸 |
| 연결 타임아웃 | `chrome://inspect/#remote-debugging` 활성화 확인 |

</details>

<details>
<summary><strong>동작 원리</strong></summary>

```
Claude Code ──evaluate_script──▶ Chrome DevTools Protocol ──DOM──▶ claude.ai 탭
     ▲                                                                  │
     └──────────────── 추출된 응답 텍스트 ◀─────────────────────────────┘
```

1. `chrome-devtools MCP`로 claude.ai 탭에서 JavaScript 실행
2. 입력 필드를 찾아 질문 입력 → Enter 전송
3. 스트리밍 완료 감지 (Stop 버튼 / data-is-streaming 속성)
4. DOM 순회로 응답 추출

</details>

---


## 면책 조항

이 플러그인은 훅, 스킬, 커맨드를 통해 Claude Code의 동작을 변경합니다. 현재 상태 그대로 제공되며 어떠한 보증도 없습니다. 사용에 따른 책임은 사용자에게 있습니다. 데이터 손실, 설정 손상, 의도치 않은 동작에 대해 작성자는 책임지지 않습니다. 시스템 설정과 상호작용하는 플러그인을 설치하거나 업데이트하기 전에 항상 중요한 파일을 백업하세요.

## 라이선스

MIT — [LICENSE](../../LICENSE) 참조

> 이 플러그인은 브라우저 통신을 위해 [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp)를 사용합니다.
