() => {
  const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
  const lastUserMsg = userMsgs[userMsgs.length - 1];
  if (!lastUserMsg) return 'NO_USER_MSG';

  // 타임스탬프 형제 판별 ("오전 12:25", "11:56 PM" 등). 짧고 시각 패턴으로 시작하면 스킵.
  const isTimestamp = (s) => s.length < 20 && /^(오전|오후|am|pm)?\s*\d{1,2}:\d{2}/i.test(s);
  const CONTENT = 'p, li, h1, h2, h3, pre, code, ol, ul, table';
  const isJunk = (el) => {
    const t = (el.innerText || '').trim();
    if (!t) return true;
    if (/Claude is AI and can make mistakes|Claude는 AI이며 실수할 수 있습니다/.test(t)) return true;
    if (getComputedStyle(el).opacity === '0') return true;
    if (isTimestamp(t)) return true;                                  // 타임스탬프(children 유무 무관)
    if (t.length < 20 && !el.querySelector(CONTENT)) return true;     // 콘텐츠 없는 짧은 메타
    if (el.querySelector('[data-testid="user-message"]')) return true;
    return false;
  };

  // ── L1+L2: 마지막 user-message에서 조상을 올라가며 각 nextElementSibling 검사 ──
  // .font-claude-response(정규 응답 컨테이너, sr-only "Claude 응답:" 헤딩 중복 없는 깨끗한 본문) 우선.
  let current = lastUserMsg;
  for (let depth = 0; depth < 12; depth++) {
    const parent = current.parentElement;
    if (!parent) break;
    const sib = parent.nextElementSibling;
    if (sib) {
      const resp = sib.querySelector('.font-claude-response');
      if (resp && resp.innerText.trim()) return resp.innerText;
      if (!isJunk(sib)) return sib.innerText;
    }
    current = parent;
  }

  // ── L3 (읽기 전용 폴백): 위 휴리스틱이 응답에 도달 못 할 때(DOM 중첩 변경 등) 위치기반 탐색 ──
  // 읽기는 오선택해도 호출측 맥락 검증에서 잡히므로 구조 점수화 허용.
  const fc = document.querySelectorAll('.font-claude-response');
  if (fc.length && fc[fc.length - 1].innerText.trim()) return fc[fc.length - 1].innerText;

  // 마지막 user-message보다 아래 + user-message를 포함하지 않음(=응답측, 이전 턴/전체 컨테이너 배제)
  // + 사이드바(nav/aside) 배제 + 콘텐츠 요소 보유. 그 중 텍스트 최장 = 응답 본문.
  const userTop = lastUserMsg.getBoundingClientRect().top;
  const cands = [...document.querySelectorAll('div, section, article')].filter(el =>
    !el.querySelector('[data-testid="user-message"]') &&
    !el.closest('nav, aside') &&
    el.querySelector(CONTENT) &&
    el.getBoundingClientRect().top >= userTop &&
    el.innerText.trim().length > 20
  );
  if (!cands.length) return 'ASSISTANT_RESPONSE_NOT_FOUND';
  cands.sort((a, b) => b.innerText.trim().length - a.innerText.trim().length);
  return cands[0].innerText;
}
