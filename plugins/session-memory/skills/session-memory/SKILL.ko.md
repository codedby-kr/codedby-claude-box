---
name: session-memory
description: 세션 메모리에서 키워드별 저장 내역을 검색/로드. list, recall, search 명령 제공. 저장은 /session-memory:save-memory 사용.
---

# Session Memory (읽기 전용)

세션 메모리에서 키워드별 저장 내역을 검색하고 로드한다. 이 스킬은 **읽기 전용**이며 Write 도구를 사용하지 않는다.
저장은 `/session-memory:save-memory` 커맨드를 사용한다.

## 사용법

인수(`$ARGUMENTS`)에 따라 동작이 달라진다:

### 인수 없음 또는 `help` → Quick Reference Card 출력

```
[Session Memory]

  저장: /session-memory:save-memory [keyword]        대화 내용을 키워드별로 저장
  목록: /session-memory list              현재 세션 키워드 목록
  읽기: /session-memory recall <keyword>  키워드 본문 불러오기
  검색: /session-memory search <검색어>   키워드/본문 검색
  전체: /session-memory list --sessions   저장된 세션 목록

  예시: /session-memory:save-memory auth-flow
        /session-memory recall auth-flow
```

### `list` → 현재 세션 키워드 목록

1. 세션 ID 획득: `<session-identity>` 블록의 `CLAUDE_SESSION_ID` 값 사용. 없으면 `fallback-{YYYY-MM-DD}`
2. Glob으로 `~/.claude-box/data/session-memory/{session-id}/*.md` 파일 목록 수집
3. 각 파일의 frontmatter에서 `keyword`와 `summary` 읽기
4. 테이블 형태로 출력:
   ```
   | keyword | summary | updated |
   ```
5. 파일이 없으면 "현재 세션에 저장된 메모리가 없습니다. `/session-memory:save-memory`로 저장하세요." 안내

### `list --sessions` → 저장된 전체 세션 목록

1. Glob으로 `~/.claude-box/data/session-memory/*/` 디렉토리 목록 수집
2. 각 세션 디렉토리의 파일 수와 가장 최근 updated 시각 표시
3. 현재 세션 ID와 일치하는 항목에 `(현재)` 표시

### `recall <keyword>` → 키워드 본문 불러오기

1. 세션 ID 획득
2. keyword를 kebab-case로 정규화 (공백→하이픈, 소문자, 한글 유지)
3. `~/.claude-box/data/session-memory/{session-id}/{keyword}.md` 파일 Read
4. 파일이 없으면:
   - Glob으로 현재 세션의 전체 키워드 목록을 보여주고 "해당 키워드를 찾을 수 없습니다" 안내
   - 유사한 키워드가 있으면 제안

### `search <검색어>` → 키워드/본문 검색

1. 세션 ID 획득
2. Grep으로 `~/.claude-box/data/session-memory/{session-id}/` 내 검색어 매칭
3. 매칭된 파일의 keyword, summary, 매칭 라인 표시

### `search --all <검색어>` → 전체 세션 검색

1. Grep으로 `~/.claude-box/data/session-memory/` 전체에서 검색어 매칭
2. 세션 ID별로 그룹핑하여 결과 표시

## 자동 참조 가이드

컨텍스트 압축(compaction) 후 이전 결정사항이 필요할 때:
1. 현재 세션의 메모리 파일이 있는지 Glob으로 확인
2. 있으면 frontmatter의 keyword/summary 목록을 스캔
3. 현재 작업과 관련된 키워드의 본문을 Read로 로드
4. 로드한 내용을 바탕으로 이전 맥락을 복원하여 작업 계속

## 주의사항

- 이 스킬은 읽기 전용이다. 파일 생성/수정/삭제는 `/session-memory:save-memory` 커맨드가 담당한다.
- Glob, Grep, Read 도구만 사용한다.
- 세션 메모리 디렉토리가 존재하지 않으면 "저장된 세션 메모리가 없습니다" 안내 후 종료한다.
