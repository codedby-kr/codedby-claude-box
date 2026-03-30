---
argument-hint: '[저장할 키워드]'
---
현재 대화에서 중요한 결정사항, 설계 논의 결과, 핵심 결론 등을 세션 메모리에 저장해줘.

## 저장 절차

1. 세션 ID 획득: 세션 시작 시 `<session-identity>` 블록으로 주입된 `CLAUDE_SESSION_ID` 값을 사용. 없으면 `fallback-{YYYY-MM-DD}` 사용
2. 세션 디렉토리 확인: `~/.claude-box/data/session-memory/{session-id}/` 없으면 생성
3. 인수로 키워드가 주어진 경우 (`$ARGUMENTS`):
   - 해당 키워드에 대한 내용만 최근 대화에서 추출하여 저장
4. 인수가 없는 경우:
   - 현재 대화에서 저장할 만한 주제를 식별하고 사용자에게 확인
5. 각 키워드를 kebab-case로 정규화 (공백→하이픈, 소문자, 한글 유지)
6. `~/.claude-box/data/session-memory/{session-id}/{keyword}.md` 파일 생성/갱신:
   - frontmatter: keyword, summary(한줄), created, updated
   - 본문: 결정사항, 근거, 관련 파일 경로, 코드 스니펫 등
7. 같은 키워드가 이미 있으면 사용자에게 덮어쓰기/추가 확인
   - 덮어쓰기: 본문 교체, created 유지, updated·summary 갱신
   - 추가: 기존 본문 하단에 새 내용 추가, created 유지, updated·summary 갱신
8. 저장 완료 후 현재 세션의 전체 키워드 목록 표시
