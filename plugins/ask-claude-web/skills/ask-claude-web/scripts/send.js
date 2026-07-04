async () => {
  const expected = __EXPECTED_ATTACHMENTS__;
  const fieldset = document.querySelector('fieldset');

  // ── Selector resolver: L1 exact label → L2 bilingual regex fallback ──
  // claude.ai aria-label은 언어(EN/KR)와 동적 접미사("<ts>_<파일명> 제거")로 달라진다.
  // 정확 라벨을 먼저 시도하고 없으면 정규식으로 폴백. 행동(전송/삭제)은 오작동이 위험하니 정규식을 좁게 유지.
  const pick = (root, exact, re) => {
    const btns = [...(root || document).querySelectorAll('button[aria-label]')];
    const hit = btns.filter(b => exact.includes(b.getAttribute('aria-label')));
    return hit.length ? hit : btns.filter(b => re.test(b.getAttribute('aria-label') || ''));
  };
  const removeBtns = () => pick(fieldset, ['제거', 'Remove'], /(제거|삭제|remove|delete)\s*$/i);

  // Streaming guard
  const streaming = pick(document, ['응답 중단', 'Stop Response', 'Stop response'], /(중단|중지|stop\s*response)/i)[0]
    || document.querySelector('[data-is-streaming="true"]');
  if (streaming)
    return { sent: false, error: 'STILL_STREAMING', message: 'Previous response is still streaming. Wait for it to finish, then retry.' };

  // File names (diagnostic only). 파일명은 두 곳: 이미지=Remove버튼 aria-label "<ts>_<name> 제거",
  // txt/문서=칩 내부 리프 텍스트 "<ts>_<name>". 양쪽을 수집하고 타임스탬프 접두사 제거 후 중복 제거.
  const getFileNames = () => {
    if (!fieldset) return [];
    const names = [], seen = new Set();
    const add = (raw) => {
      if (!raw) return;
      const n = raw.trim().replace(/^\d+_/, '');
      if (n && /\.[a-z0-9]{1,6}$/i.test(n) && !seen.has(n)) { seen.add(n); names.push(n); }
    };
    for (const b of removeBtns()) add((b.getAttribute('aria-label') || '').replace(/\s*(제거|삭제|remove|delete)$/i, ''));
    for (const e of fieldset.querySelectorAll('*')) if (e.children.length === 0) add(e.textContent);
    return names;
  };

  const beforeFiles = getFileNames();
  const actual = removeBtns().length;

  // Attachment gate: remove stale files from front if excess
  if (actual > expected) {
    const stale = beforeFiles.slice(0, actual - expected);
    const fresh = beforeFiles.slice(actual - expected);
    const excess = actual - expected;
    for (let i = 0; i < excess; i++) { const b = removeBtns()[0]; if (b) b.click(); }
    const ok = await new Promise(resolve => {
      const s = Date.now();
      const poll = setInterval(() => {
        if (removeBtns().length === expected) { clearInterval(poll); resolve(true); }
        else if (Date.now() - s > 2000) { clearInterval(poll); resolve(false); }
      }, 100);
    });
    if (!ok) {
      const remain = getFileNames();
      return {
        sent: false, error: 'CLEANUP_FAILED',
        message: 'Tried to remove ' + excess + ' stale file(s) [' + stale.join(', ') + '] keeping ' + expected + ' fresh [' + fresh.join(', ') + ']. Not completed within 2s. ' + remain.length + ' remain: [' + remain.join(', ') + ']. Retry this script.',
        remaining: remain
      };
    }
  } else if (actual < expected) {
    return {
      sent: false, error: 'MISSING_ATTACHMENTS',
      message: 'Expected ' + expected + ' file(s) but only found ' + actual + ': [' + beforeFiles.join(', ') + ']. ' + (expected - actual) + ' missing. Ctrl+V paste may have failed or input was not focused. Re-run the file paste (Step 1), then retry this script.',
      found: beforeFiles
    };
  }

  // Type + send
  const sentWith = getFileNames();
  const el = document.querySelector('[contenteditable="true"][data-placeholder]')
    || document.querySelector('fieldset [contenteditable="true"]')
    || document.querySelector('[contenteditable="true"]');
  if (!el) return { error: 'INPUT_NOT_FOUND' };
  el.focus();
  el.textContent = '';
  document.execCommand('insertText', false, "__MESSAGE__");
  el.dispatchEvent(new InputEvent('input', { bubbles: true })); // React 입력 등록 보강

  // ProseMirror가 execCommand로 들어간 <div> 줄바꿈을 <p>로 정규화할 때까지 대기.
  // 파일 첨부 시 전송버튼이 이미 활성이라 정규화 전 클릭되어 멀티라인이 누락되는 것을 방지.
  // (실측: 누락=즉시클릭 @ <div>2개 / 정착 후 <div>0개, ~20ms면 충분, 최대 500ms 가드)
  for (let i = 0; i < 25 && el.innerHTML.includes('<div'); i++) {
    await new Promise(r => setTimeout(r, 20));
  }

  // 전송 버튼은 React가 입력을 등록한 뒤에야 렌더/활성화된다(새 탭 첫 메시지에서 고정 300ms 초과 레이스 관측).
  // 고정 대기 대신 조건 폴링(최대 3초).
  let sendBtn = null;
  for (let i = 0; i < 50; i++) {
    sendBtn = pick(document, ['메시지 보내기', 'Send Message'], /(보내기|전송|send\s*message)/i).find(b => !b.disabled);
    if (sendBtn) break;
    await new Promise(r => setTimeout(r, 60));
  }
  if (!sendBtn)
    return {
      sent: false, error: 'SEND_BTN_NOT_FOUND',
      buttons: [...document.querySelectorAll('button[aria-label]')].map(b => b.getAttribute('aria-label')).slice(0, 25)
    };
  sendBtn.click();

  const cleaned = actual > expected;
  return {
    sent: true,
    message: cleaned
      ? 'Removed ' + (actual - expected) + ' stale file(s) from front. Sent with ' + expected + ' file(s): [' + sentWith.join(', ') + '].'
      : expected > 0
        ? 'Sent with ' + expected + ' file(s): [' + sentWith.join(', ') + ']. No cleanup needed.'
        : 'Sent with no file attachments.',
    sentWith
  };
}
