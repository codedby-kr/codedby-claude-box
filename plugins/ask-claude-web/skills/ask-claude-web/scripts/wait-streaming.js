async () => {
  return new Promise(resolve => {
    // 스트리밍 판정: stop 버튼(L1 정확 라벨 → L2 양국어 정규식) 또는 data-is-streaming 속성.
    const isStreaming = () => {
      const stop = [...document.querySelectorAll('button[aria-label]')].some(b => {
        const l = b.getAttribute('aria-label') || '';
        return ['응답 중단', 'Stop Response', 'Stop response'].includes(l) || /(중단|중지|stop\s*response)/i.test(l);
      });
      return stop || !!document.querySelector('[data-is-streaming="true"]');
    };
    const check = setInterval(() => {
      if (!isStreaming()) { clearInterval(check); resolve('DONE'); }
    }, 3000);
    setTimeout(() => { clearInterval(check); resolve('TIMEOUT'); }, __TIMEOUT__);
  });
}
