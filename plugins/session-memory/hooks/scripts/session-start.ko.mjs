#!/usr/bin/env node
/**
 * session-start.mjs — SessionStart 훅 (병합)
 *
 * 모든 SessionStart 이벤트(startup, resume, clear, compact)마다 실행.
 * 두 단계를 각각 try-catch로 감싸서 한쪽 실패가 다른 쪽을 막지 않음:
 *
 *   Step 1: 세션 ID를 <session-identity> 태그로 AI 컨텍스트에 주입.
 *           AI가 이 ID로 세션 범위 메모리 파일을 찾는다.
 *           /compact 실행 시 유실될 수 있어 매번 재주입.
 *
 *   Step 2: 이 세션의 저장된 메모리 키워드 목록을 주입.
 *           compact 후 AI가 저장된 메모리의 존재를 모를 수 있으므로
 *           키워드 목록을 재주입하여 어떤 메모리가 있는지 알려줌.
 *
 * 출력: 두 단계의 additionalContext를 합친 단일 JSON.
 * 두 단계 모두 실패하거나 세션 ID 없으면: suppressOutput (토큰 비용 0).
 *
 * 데이터 경로: ~/.claude-box/data/session-memory/{session-id}/
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const MAX_KEYWORDS_DISPLAY = 15;

// ── stdin 읽기 (3초 timeout) ──────────────────────────────────────────────────
const input = await new Promise((resolve) => {
  const chunks = [];
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) { settled = true; process.stdin.destroy(); resolve(Buffer.concat(chunks).toString('utf-8')); }
  }, 3000);
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); }
  });
  process.stdin.on('error', () => {
    if (!settled) { settled = true; clearTimeout(timeout); resolve(''); }
  });
});

// ── suppressOutput 헬퍼 ──────────────────────────────────────────────────────
function suppress() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

try {
  const data = JSON.parse(input);
  const sessionId = data.session_id || data.sessionId || '';

  if (!sessionId) suppress();

  const contextParts = [];

  // ── Step 1: 세션 ID 주입 ────────────────────────────────────────────────
  try {
    contextParts.push(
      `<session-identity>\nCLAUDE_SESSION_ID=${sessionId}\n</session-identity>`
    );
  } catch {
    // 세션 ID 주입 실패 — Step 2로 계속
  }

  // ── Step 2: 저장된 메모리 키워드 목록 ────────────────────────────────────
  try {
    const memoryDir = join(homedir(), '.claude-box', 'data', 'session-memory', sessionId);

    const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
    if (files.length > 0) {
      const keywords = files.map(f => f.replace(/\.md$/, '')).filter(k => k.length > 0);

      if (keywords.length > 0) {
        const display = keywords.length > MAX_KEYWORDS_DISPLAY
          ? [...keywords.slice(0, MAX_KEYWORDS_DISPLAY), `외 ${keywords.length - MAX_KEYWORDS_DISPLAY}개`]
          : keywords;

        contextParts.push(
          `[세션 메모리] 저장된 키워드 (${keywords.length}개): ${display.join(', ')}\n` +
          `/session-memory recall <키워드>로 불러오기. /session-memory:save-memory <키워드>로 저장.`
        );
      }
    }
  } catch {
    // 디렉토리 없음 또는 읽기 에러 — 무시
  }

  // ── 출력 ───────────────────────────────────────────────────────────────
  if (contextParts.length === 0) suppress();

  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: contextParts.join('\n\n')
    }
  }));

} catch {
  suppress();
}
