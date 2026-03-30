#!/usr/bin/env node
// ============================================================================
// guard-claude-dir.mjs — .claude/ 디렉토리 보호 훅 (PreToolUse)
// ============================================================================
//
// ■ 왜 이 훅이 존재하는가
//   Claude Code 빌트인이 .claude/ 파일 조작 시 사용자에게 권한 허용을 물어본다.
//   매번 허용 버튼을 누르는 게 귀찮으므로, 이 훅이 빌트인보다 먼저 차단하고
//   node 기반 우회 방법을 AI에게 안내한다. AI가 안내받은 방법으로 알아서 처리하면
//   사용자는 권한 허용을 누를 필요가 없다.
//
// ■ 두 가지 역할
//   역할 1 — 선제 차단 (빌트인 권한 요청 우회):
//     빌트인이 권한 요청할 상황을 먼저 잡아서 차단 + node 우회 방법 안내.
//     대상: Edit/Write, Bash cp/mv FROM, Bash rm, Bash write 패턴 (sed -i 등)
//
//   역할 2 — 보호 (핵심 파일 소실 방지):
//     핵심 파일을 rm/mv FROM으로 없앨 수 있는 상황을 훅에서 차단한다.
//     빌트인이 권한 요청을 띄우든 안 띄우든 관계없이, 훅이 먼저 차단해서
//     사용자가 권한 허용을 눌러야하는 귀찮음을 없앤다.
//     우회 방법을 안내하지 않음 — 파일 소실을 막는 게 목적이니까.
//     대상: mv FROM + 핵심 파일, rm + 핵심 파일
//
// ■ 핵심 파일 보호 (역할 2)
//   대상: CLAUDE.md, settings.json, settings.local.json, .claude.json
//   보호 범위: 파일 자체가 없어지는 것만 차단 (rm 삭제, mv FROM 이동)
//   보호 안 함: 파일 내용 변경/덮어쓰기 (cp TO, Edit, Write 등)
//   이유: 핵심 파일이 존재하지 않으면 Claude Code 동작에 치명적이지만,
//         내용 수정은 정상적인 설정 변경 작업이므로 막지 않음
//
// ■ 메모리 경로 예외 (~/.claude/projects/*/memory/)
//   - Edit/Write: 예외 (auto-memory가 Edit/Write 도구로 직접 씀)
//   - Bash cp/mv/rm/write 패턴: 예외 없음 (빌트인이 권한 요청하므로 선제 차단 필요)
//
// ■ 차단 방식
//   exit 2 + stderr 메시지. permissionDecision이나 continue는 미지원/미작동.
//
// ■ 수정 판단 기준
//   이 훅은 두 가지 경우에만 차단한다:
//   (1) 빌트인이 권한 요청을 띄우는 작업 → 선제 차단 + node 우회 안내 (역할 1)
//   (2) 핵심 파일이 사라지는 작업 (rm, mv FROM) → 차단, 우회 안내 없음 (역할 2)
//   그 외에는 차단하지 않는다. 권한 요청이 안 뜨는 작업을 "안전을 위해" 막지 말 것.
//
// ■ 핵심 파일 수정 시 주의 (역할 2)
//   핵심 파일의 rm/mv FROM은 무조건 차단하며, 우회 안내를 절대 제공하지 않는다.
//   이것은 보호 목적이다 — 파일이 사라지면 Claude Code가 깨진다.
//   rm/mv 이외의 명령(cp FROM, Edit, Write, sed -i 등)은 다른 파일과 동일하게 처리한다.
//   즉 핵심 파일이라도 내용 수정/복사에 대해서는 역할 1(선제 차단 + 우회 안내)이 적용된다.
//   수정 시 이 구분을 깨뜨리지 않도록 주의할 것.
//
// ■ node 우회가 통하는 이유
//   빌트인은 Bash의 cp, mv, rm 등 특정 쉘 명령에 대해 권한 요청을 띄운다.
//   node -e "require('fs').copyFileSync(...)" 같은 명령은 Bash 도구를 사용하지만
//   내부적으로 Node.js API를 호출하는 것이라 빌트인 권한 요청에 걸리지 않는다.
//   PowerShell Copy-Item, cmd /c copy도 동일하게 권한 요청을 우회 가능하지만,
//   이 훅 파일 자체가 node로 실행되므로 node가 있는 환경임이 보장되어 node를 안내한다.
//   (참고: 네이티브 설치 등 Node가 없는 환경에서는 이 훅 자체가 실행되지 않음)
//
// ■ 버전업 시 체크포인트
//   Claude Code 버전업으로 빌트인이 권한 요청을 띄우는 범위가 확장될 수 있다.
//   새로 권한 요청이 뜨는 작업이 발견되면:
//   1. 해당 작업을 훅에서 선제 차단하도록 추가 (역할 1)
//   2. node 기반 우회 방법을 안내 메시지에 포함
//   3. 메모리 예외가 영향받는지 확인 (auto-memory 동작 테스트)
//
// ■ 테스트 방법
//   수정 후 반드시 테스트. .claude/ 안에 테스트 파일을 node writeFileSync로 생성하고:
//   - 차단 대상: cp FROM, mv FROM, rm, sed -i, Edit, Write → 훅 [BLOCKED] 메시지 확인
//   - 통과 대상: cp TO, mv TO, cat, node copyFileSync/unlinkSync → 정상 실행 확인
//   - 메모리: Edit/Write → 통과, Bash cp/mv/rm/sed-i → 차단
//   - 오탐: .claude-box 경로 → 통과, node -e "...;..." → 오분리 없이 통과
//   ⚠️ 핵심 파일 테스트 주의:
//   핵심 파일(settings.json 등)의 rm/mv FROM 테스트는 실제 경로의 실제 파일로만
//   테스트 가능하다 (다른 경로에 같은 이름을 만들어도 protectedPaths 매칭이 안 됨).
//   훅에 버그가 있으면 차단을 못 하고, 빌트인 권한 요청이 뜨는데
//   사용자가 인지 없이 허용하면 핵심 파일이 실제로 삭제/이동되어 Claude Code가 깨진다.
//   → 테스트 전에 사용자에게 위험을 알리고, 권한 요청이 뜨면 반드시 거부(No)해달라고 안내할 것.
//   → 테스트 전 node copyFileSync로 핵심 파일을 백업해두면 안전.
//   테스트 파일 정리: node -e "require('fs').rmSync('경로',{recursive:true,force:true})"
//
// ■ 이력
//   2026-03-22: 초기 버전 — Edit/Write 차단, write 패턴 차단, rm/mv criticalFiles 보호
//   2026-03-26: cp/mv FROM 선제 차단 추가, rm 전체 선제 차단 추가,
//               메모리 예외에서 cp/mv/rm/write 패턴 제외,
//               따옴표 인식 명령 분리기 도입 (node -e "...;..." 오탐 수정),
//               안내 메시지 cp → node copyFileSync로 변경,
//               criticalFiles includes() → containsProtectedPath() 오탐 수정
// ============================================================================

import os from 'node:os';

// --- stdin 읽기 (PreToolUse 훅은 stdin으로 JSON을 받음) ---
const input = await new Promise((resolve) => {
  const chunks = [];
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) { settled = true; process.stdin.destroy(); resolve(Buffer.concat(chunks).toString('utf-8')); }
  }, 3000);
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); } });
  process.stdin.on('error', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(''); } });
});

// --- 경로 정규화 ---
// Windows 경로 변형(C:\, C:/, /c/)을 통일하여 비교 가능하게 만든다.
// 예: "C:\Users\foo\.claude" → "/c/users/foo/.claude"
function normalizePath(p) {
  if (!p) return '';
  let norm = p.replace(/[\\]/g, '/').toLowerCase();
  const driveMatch = norm.match(/^([a-z]):[/]/);
  if (driveMatch) norm = '/' + driveMatch[1] + norm.slice(2);
  return norm.replace(/[/]+$/, '');
}

try {
  const data = JSON.parse(input);
  const tool = data.tool_name || '';
  const toolInput = data.tool_input || {};

  const home = normalizePath(os.homedir());
  const cwd = normalizePath(data.cwd || process.cwd());

  // --- 보호 대상 디렉토리 ---
  const globalClaudeDir = home + '/.claude';       // ~/.claude/ (전역)
  const globalClaudeJson = home + '/.claude.json';  // ~/.claude.json (전역 설정)
  const projectClaudeDir = cwd + '/.claude';        // 프로젝트/.claude/

  // --- 메모리 경로 판별 ---
  // ~/.claude/projects/*/memory/ 하위는 auto-memory가 Edit/Write로 직접 쓰므로
  // Edit/Write에서만 예외 처리한다. Bash에서는 예외 없음.
  const memoryDir = globalClaudeDir + '/projects';

  function isMemoryPath(norm) {
    if (!norm.startsWith(memoryDir + '/')) return false;
    const rest = norm.slice(memoryDir.length + 1);
    return rest.includes('/memory/') || rest.endsWith('/memory');
  }

  // --- Edit/Write용 보호 판별 ---
  // 메모리 경로는 예외 (auto-memory가 Edit/Write 도구를 사용하므로 막으면 메모리 저장 불가)
  function isProtected(filePath) {
    if (!filePath) return false;
    const norm = normalizePath(filePath);
    if (isMemoryPath(norm)) return false;  // 메모리 예외 — Edit/Write 전용
    if (norm === globalClaudeJson) return true;
    if (norm === globalClaudeDir || norm.startsWith(globalClaudeDir + '/')) return true;
    if (norm === projectClaudeDir || norm.startsWith(projectClaudeDir + '/')) return true;
    return false;
  }

  // =========================================================================
  // Edit/Write 차단 (역할 1: 선제 차단)
  // 빌트인이 .claude/ 파일의 Edit/Write에 권한 요청 → 훅이 먼저 차단 + node 우회 안내
  // =========================================================================
  if (tool === 'Edit' || tool === 'Write') {
    const fp = toolInput.file_path || '';
    if (isProtected(fp)) {
      process.stderr.write(
  '[BLOCKED] .claude/ direct edit blocked: ' + fp + '\n' +
  '절차: node copyFileSync로 /tmp/에 복사 → Bash sed -i /tmp/파일명 → node copyFileSync로 원본 위치에 복사\n' +
  '복사: node -e "require(\'fs\').copyFileSync(\'원본\',\'대상\')"'
);
      process.exit(2);
    }
  }

  // =========================================================================
  // Bash 명령 검사
  // =========================================================================
  if (tool === 'Bash') {
    const cmd = toolInput.command || '';
    const cmdLower = cmd.replace(/[\\]/g, '/').toLowerCase();

    // --- 보호 대상 경로 목록 ---
    // normalizePath 형식과 Windows 원본 형식 양쪽을 포함하여
    // 어떤 형식으로 경로가 작성되어도 매칭되게 한다.
    const homeWin = os.homedir().replace(/[\\]/g, '/').toLowerCase();
    const cwdWin = (data.cwd || process.cwd()).replace(/[\\]/g, '/').toLowerCase();

    const protectedPaths = [
      globalClaudeDir,          // /c/users/.../.claude (normalized)
      globalClaudeJson,
      projectClaudeDir,
      homeWin + '/.claude',     // c:/users/.../.claude (Windows 원본)
      homeWin + '/.claude.json',
      cwdWin + '/.claude',
      '~/.claude',              // 틸드 축약
    ];

    // --- 메모리 경로 예외용 (Bash 전용) ---
    const memoryPaths = [
      globalClaudeDir + '/projects',
      homeWin + '/.claude/projects',
      '~/.claude/projects',
    ];

    // --- 핵심 파일 목록 (역할 2: 보호 대상) ---
    // .claude/ 루트에 있는 설정 파일들. 삭제/이동하면 Claude Code 동작에 치명적.
    const criticalFileNames = ['claude.md', 'settings.json', 'settings.local.json'];
    const criticalFiles = [];
    criticalFileNames.forEach(f => {
      criticalFiles.push(globalClaudeDir + '/' + f);
      criticalFiles.push(homeWin + '/.claude/' + f);
      criticalFiles.push(projectClaudeDir + '/' + f);
      criticalFiles.push(cwdWin + '/.claude/' + f);
      criticalFiles.push('~/.claude/' + f);
    });
    criticalFiles.push(globalClaudeJson);
    criticalFiles.push(homeWin + '/.claude.json');
    criticalFiles.push('~/.claude.json');

    // --- 경로 포함 여부 판별 (경계 문자 체크) ---
    // .claude가 .claude-box 같은 경로에 부분 매칭되는 오탐 방지.
    // 보호 경로 뒤에 /, ", ', 공백, 탭, 또는 문자열 끝이 와야만 매칭.
    // criticalFiles 비교에도 동일하게 사용 (settings.json.bak 오탐 방지).
    function containsProtectedPath(str, protectedPath) {
      let idx = 0;
      while ((idx = str.indexOf(protectedPath, idx)) !== -1) {
        const afterIdx = idx + protectedPath.length;
        if (afterIdx >= str.length) return true;
        const afterChar = str[afterIdx];
        if (afterChar === '/' || afterChar === '"' || afterChar === "'" || afterChar === ' ' || afterChar === '\t') return true;
        idx++;
      }
      return false;
    }

    // --- 빠른 탈출: 보호 경로가 명령에 아예 없으면 즉시 통과 ---
    const hasProtectedPath = protectedPaths.some(p => containsProtectedPath(cmdLower, p));
    if (!hasProtectedPath) {
      process.exit(0);
    }

    // --- write 패턴 (sed -i, echo >, cat > 등 파일 직접 수정 명령) ---
    const writePatterns = [/\bsed\b.*-i/i, /\becho\b.*>/, /\bcat\b.*>/, /\bprintf\b.*>/, /\btee\b/, /\btruncate\b/, /\bdd\b.*of=/i];

    // --- 따옴표 인식 명령 분리기 ---
    // &&, ||, ; 로 서브 명령을 분리하되, 따옴표 안의 구분자는 무시한다.
    // 이유: node -e "fs.rmSync('path'); console.log('done')" 같은 명령에서
    // 세미콜론이 쪼개지면 fs.rmSync('.../.claude/...') 조각이 생겨 오탐 발생.
    function splitCommands(c) {
      const subs = [];
      let cur = '';
      let inSingle = false;
      let inDouble = false;
      let esc = false;
      for (let i = 0; i < c.length; i++) {
        const ch = c[i];
        const next = c[i + 1];
        if (esc) { cur += ch; esc = false; continue; }
        if (ch === '\\') { cur += ch; esc = true; continue; }
        if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; continue; }
        if (ch === '"' && !inSingle) { inDouble = !inDouble; cur += ch; continue; }
        if (!inSingle && !inDouble) {
          if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
            subs.push(cur.trim()); cur = ''; i++; continue;
          }
          if (ch === ';') { subs.push(cur.trim()); cur = ''; continue; }
        }
        cur += ch;
      }
      if (cur.trim()) subs.push(cur.trim());
      return subs.filter(s => s.length > 0);
    }
    const subCommands = splitCommands(cmd);

    // --- 서브 명령별 검사 ---
    for (const sub of subCommands) {
      const subLower = sub.replace(/[\\]/g, '/').toLowerCase();

      // 이 서브 명령이 보호 경로를 포함하지 않으면 건너뜀
      const subHasProtected = protectedPaths.some(p => containsProtectedPath(subLower, p));
      if (!subHasProtected) continue;

      // --- 메모리 경로 예외 처리 ---
      // 메모리 경로만 포함된 서브 명령은 기본적으로 통과시키되,
      // cp/mv/rm과 write 패턴은 빌트인이 권한 요청하므로 예외 없이 검사 진행.
      const subHasMemory = memoryPaths.some(mp => {
        const idx = subLower.indexOf(mp);
        if (idx === -1) return false;
        const after = subLower.slice(idx + mp.length);
        return /^[/][^/]+[/]memory([/]|$)/.test(after);
      });
      if (subHasMemory) {
        if (!/\b(cp|mv|rm)\b/.test(subLower) && !writePatterns.some(p => p.test(sub))) {
          // 메모리 경로를 제거한 후에도 보호 경로가 남아있는지 확인
          let subWithoutMemory = subLower;
          memoryPaths.forEach(mp => { subWithoutMemory = subWithoutMemory.split(mp).join(''); });
          if (!protectedPaths.some(p => containsProtectedPath(subWithoutMemory, p))) continue;
        }
      }

      // ---------------------------------------------------------------
      // cp/mv FROM .claude/ 차단 (역할 1: 선제 차단)
      // 소스(마지막 인자 제외)가 .claude/ 경로이면 차단.
      // 목적지가 .claude/인 경우(TO)는 현재 미차단 (빌트인이 권한 요청 안 함).
      // 단, mv FROM + 핵심 파일은 역할 2(보호)로 우회 안내 없이 차단.
      // ---------------------------------------------------------------
      if (/\b(cp|mv)\b/.test(sub)) {
        const cmdMatch = sub.match(/\b(cp|mv)\b(.*)/s);
        if (cmdMatch) {
          const verb = cmdMatch[1].toLowerCase();
          const argsStr = cmdMatch[2].trim();
          // 인자 토큰 분리 (따옴표 안 공백은 하나의 토큰으로 유지)
          const tokens = argsStr.match(/(?:"[^"]*"|'[^']*'|\S)+/g) || [];
          // 플래그 제거 (-r, -rf, --preserve 등)
          const pathTokens = tokens.filter(t => !/^-/.test(t.replace(/^["']/, '')));

          if (pathTokens.length >= 2) {
            // 마지막 토큰 = 목적지, 나머지 = 소스
            const sources = pathTokens.slice(0, -1);
            const sourcesLower = sources.map(s =>
              s.replace(/["']/g, '').replace(/[\\]/g, '/').toLowerCase()
            );

            const sourceHasProtected = sourcesLower.some(src =>
              protectedPaths.some(p => containsProtectedPath(src, p))
            );

            if (sourceHasProtected) {
              // 역할 2: mv FROM + 핵심 파일 → 우회 안내 없이 차단 (원본이 사라지므로 보호)
              if (verb === 'mv' && criticalFiles.some(f => containsProtectedPath(subLower, f))) {
                process.stderr.write(
                  '[BLOCKED] 핵심 설정 파일 mv 차단: ' + sub.trim() + '\n' +
                  '보호 대상: CLAUDE.md, settings.json, settings.local.json, .claude.json'
                );
                process.exit(2);
              }
              // 역할 1: 선제 차단 + node 우회 안내
              const alt = verb === 'cp'
                ? 'node -e "require(\'fs\').copyFileSync(\'원본\',\'대상\')"'
                : 'node -e "require(\'fs\').copyFileSync(\'원본\',\'대상\'); require(\'fs\').unlinkSync(\'원본\')"';
              process.stderr.write(
                `[BLOCKED] .claude/ ${verb} 차단 (빌트인 권한 요청 우회)\n` +
                `대신 사용: ${alt}`
              );
              process.exit(2);
            }
          }
        }
      }

      // ---------------------------------------------------------------
      // write 패턴 차단 (역할 1: 선제 차단)
      // sed -i, echo >, cat >, printf >, tee, truncate, dd of= 등
      // .claude/ 경로가 포함된 서브 명령에 write 패턴이 있으면 차단.
      // ---------------------------------------------------------------
      if (writePatterns.some(p => p.test(sub))) {
        process.stderr.write(
          '[BLOCKED] .claude/ bash write blocked\n' +
          '절차: node copyFileSync로 /tmp/에 복사 → Bash sed -i /tmp/파일명 → node copyFileSync로 원본 위치에 복사\n' +
          '복사: node -e "require(\'fs\').copyFileSync(\'원본\',\'대상\')"\n' +
          '오탐?: .claude/ 읽기와 다른 경로 쓰기가 한 명령에 섞이면 차단됨. 명령을 분리해서 재시도.'
        );
        process.exit(2);
      }

      // ---------------------------------------------------------------
      // rm 차단
      // 핵심 파일: 역할 2 — 삭제 방지 (대안 안내 없음)
      // 비핵심 파일: 역할 1 — 선제 차단 + node unlinkSync 안내
      // ---------------------------------------------------------------
      if (/\brm\b/.test(sub)) {
        // 역할 2: 핵심 파일 삭제 방지
        if (criticalFiles.some(f => containsProtectedPath(subLower, f))) {
          process.stderr.write(
            '[BLOCKED] 핵심 설정 파일 삭제 차단: ' + sub.trim() + '\n' +
            '보호 대상: CLAUDE.md, settings.json, settings.local.json, .claude.json'
          );
          process.exit(2);
        }
        // 역할 1: 선제 차단 + node 우회 안내
        process.stderr.write(
          '[BLOCKED] .claude/ rm 차단 (빌트인 권한 요청 우회)\n' +
          '대신 사용: node -e "require(\'fs\').unlinkSync(\'경로\')"'
        );
        process.exit(2);
      }

    }
  }

  // 어떤 체크에도 걸리지 않으면 통과
  process.exit(0);
} catch {
  // JSON 파싱 실패 등 에러 시 안전하게 통과 (훅 에러로 다른 작업이 막히지 않도록)
  process.exit(0);
}
