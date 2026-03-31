#!/usr/bin/env node
/**
 * statusline.mjs - Native Claude Code StatusLine HUD
 *
 * 설정: ~/.claude/settings.json > statusLine.command
 * 역할: Claude Code가 stdin JSON을 보내면, 1줄 ANSI HUD를 stdout으로 출력
 * 의존성: 순수 Node.js (외부 패키지 없음)
 *
 * ─── 출력 형식 ───────────────────────────────────────────────────────
 *   Opus 4.6 | 🔒 relogin | 5h:45%(2h) wk:12%(5d) | ctx:[████████░░] 100k/200k | ~/2/m/f/src | sid:2ea2b | repo:branch | 23m $0.42 | in:45k out:12k | 12:34:56 | cache:67% | task:2/5 | agents:3(sub:2 team:1)
 *   ① model  ② relogin  ③ rateLimits             ④ contextBar                ⑤ cwd       ⑥ sessionId ⑦ gitInfo   ⑧ session  ⑨ tokenUsage    ⑩ lastAct  ⑪ cache  ⑫ taskProgress ⑬ activeAgents
 *
 * ─── 요소 테이블 ─────────────────────────────────────────────────────
 *   함수명             | 데이터 소스                    | 캐시 방식                  | 색상 규칙
 *   ───────────────────┼────────────────────────────────┼────────────────────────────┼──────────────────────────
 *   renderSessionId    | stdin.session_id (앞 5자)      | 없음                       | purple 고정
 *   renderLastActivity | transcript file mtime (마지막 활동 시각) | 없음                | dim 고정
 *   renderModel        | stdin.model.display_name       | 없음                       | cyan 고정
 *   (reloginWarning)   | fetchRateLimits.reloginNeeded  | (fetchRateLimits 캐시 공유) | yellow 고정
 *   formatTimeRemaining| resets_at (ISO 8601)           | 없음 (formatRateLimits 내) | 없음 (부모 색상 계승)
 *   fetchRateLimits    | OAuth API (api.anthropic.com)  | 파일 캐시, 5분 TTL, 선점갱신| green/yellow/red (70/90%)
 *   renderContextBar   | current_usage 토큰 직접 합산   | 없음                       | green/yellow/red (70/85%) + 1M시 total red
 *   formatTokenCount   | (유틸리티)                     | 없음                       | 없음
 *   renderTokenUsage   | stdin.context_window.total_*   | 없음                       | 없음 (plain)
 *   renderCwd          | stdin.cwd (Fish-shell 축약)    | 없음                       | 없음 (plain)
 *   renderGitInfo      | git CLI (branch, remote URL)   | 파일 캐시, 5초 TTL         | 없음 (plain)
 *   renderSession      | stdin.cost (duration, usd)     | 없음                       | 없음 (plain)
 *   renderCache        | stdin.context_window.usage     | 없음                       | green≥50 / yellow≥25 / dim
 *   renderTaskProgress | transcript JSONL 파싱          | 파일 캐시, 파일크기 기반   | green=완료 / yellow=진행중 / dim
 *   renderActiveAgents | transcript Agent tool_use 파싱  | 파일 캐시 (공유)           | cyan 고정
 *
 * ─── OAuth 플로우 (fetchRateLimits) ──────────────────────────────────
 *   .credentials.json 읽기 → expiresAt 만료 확인 → refreshToken으로 갱신 → API GET /api/oauth/usage → credentials write-back
 *
 * ─── 캐시 파일 (os.tmpdir()) ─────────────────────────────────────────
 *   claude-hud-git-cache.json        — Git 저장소:브랜치 (5초 TTL)
 *   claude-hud-usage-cache.json      — Rate limit API 응답 (5분 TTL)
 *   claude-hud-transcript-cache.json — Transcript 파싱 결과 (파일크기 비교)
 *   claude-hud-api-YYYY-MM-DD.log    — API 호출 로그 (일별 로테이션, 하루 지난 파일 자동 삭제)
 *
 * ─── 에러 핸들링 ─────────────────────────────────────────────────────
 *   각 render* 함수는 개별 try-catch로 감싸여 빈 문자열 반환 (한 요소 실패 ≠ 전체 실패)
 *   최외곽 try-catch: 파싱 실패 등 치명적 에러 시 빈 출력으로 HUD 숨김
 *
 * ─── 429 Rate Limit 트러블슈팅 ──────────────────────────────────────
 *   증상: wk:% 값이 멈추고 갱신되지 않음
 *   원인: OAuth 토큰 만료 상태에서 API가 429를 반환할 수 있음
 *   해결: claude.ai 로그아웃 → 재로그인으로 OAuth 토큰 갱신
 *         또는 다른 세션이 API를 과다 호출 중인지 확인 (캐시 파일은 세션 간 공유)
 *
 * ─── 설정 변경 ───────────────────────────────────────────────────────
 *   아래 CONFIG.elements 객체에서 각 요소를 true/false로 토글하여 표시 여부 제어
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';

// ── 설정 ──────────────────────────────────────────────────────────────────────
const CONFIG = {
  elements: {
    sessionId: true,
    lastActivity: false,
    model: true,
    cwd: true,
    gitBranch: true,
    rateLimits: true,
    contextBar: true,
    tokenUsage: true,
    sessionInfo: true,
    cacheEfficiency: false,
    taskProgress: true,
    activeAgents: true,
  },
  contextBarWidth: 10,
  thresholds: { contextWarning: 70, contextCritical: 85 },
  rateLimitCacheTtlMs: 120_000,
  rateLimitBackoffTtlMs: 600_000,
  gitCacheTtlMs: 5_000,
};

const DEFAULT_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const API_TIMEOUT_MS = 3000;

// ── ANSI 색상 ─────────────────────────────────────────────────────────────────
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const purple = (s) => `\x1b[38;2;150;162;252m${s}\x1b[0m`;
const SEP    = dim(' | ');

// ── 유틸리티 ──────────────────────────────────────────────────────────────────
function colorByThreshold(value, low, high, text) {
  if (value >= high) return red(text);
  if (value >= low)  return yellow(text);
  return green(text);
}

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ── API 호출 로그 ────────────────────────────────────────────────────────────
function getApiLogFile() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD (KST)
  return path.join(os.tmpdir(), `claude-hud-api-${today}.log`);
}
let activeTraceId = null;

function generateTraceId() {
  return Math.random().toString(36).slice(2, 8);
}

function appendApiLog(status, result, sessionId, traceId) {
  try {
    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const sid = sessionId ? sessionId.slice(0, 8) : 'unknown';
    const tid = traceId ? ` | tid:${traceId}` : '';
    const line = `${ts} | sid:${sid} | pid:${process.pid}${tid} | HTTP ${status} | ${result}\n`;
    fs.appendFileSync(getApiLogFile(), line);
  } catch { /* ignore */ }
}

function cleanupOldApiLogs() {
  try {
    const tmpDir = os.tmpdir();
    // 2일 전 로그 삭제 (오늘 + 어제는 보존)
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    try { fs.unlinkSync(path.join(tmpDir, `claude-hud-api-${twoDaysAgo}.log`)); } catch { /* ignore */ }
    // 레거시 단일 로그 삭제
    try { fs.unlinkSync(path.join(tmpDir, 'claude-hud-api.log')); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

process.on('SIGTERM', () => {
  const tid = activeTraceId || 'none';
  appendApiLog('-', `SIGTERM(tid:${tid})`, 'system');
  process.exit(0);
});

// ── stdin 읽기 (3초 timeout) ──────────────────────────────────────────────────
function readStdin() {
  return new Promise((resolve) => {
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
}

// ── 세션 ID 앞 5자 ──────────────────────────────────────────────────────────
function renderSessionId(sessionId) {
  if (!CONFIG.elements.sessionId || !sessionId) return '';
  try {
    return purple(`sid:${sessionId.slice(0, 5)}`);
  } catch { return ''; }
}

// ── 마지막 활동 시각 (transcript mtime 기반) ─────────────────────────────────
function renderLastActivity(transcriptPath) {
  if (!CONFIG.elements.lastActivity || !transcriptPath) return '';
  try {
    const t = fs.statSync(transcriptPath).mtime;
    const pad = (n) => String(n).padStart(2, '0');
    return dim(`${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`);
  } catch { return ''; }
}

// ── 모델명 렌더링 ─────────────────────────────────────────────────────────────
function renderModel(model) {
  if (!CONFIG.elements.model) return '';
  try {
    return cyan(model?.display_name || 'Unknown');
  } catch { return ''; }
}

// ── CWD 표시 (Fish-shell 스타일 축약) ────────────────────────────────────────
function renderCwd(cwd) {
  if (!CONFIG.elements.cwd || !cwd) return '';
  try {
    // Windows 경로 정규화: 백슬래시 → 슬래시
    let p = cwd.replace(/\\/g, '/');

    // homedir 치환
    const home = os.homedir().replace(/\\/g, '/');
    const isUnderHome = p.startsWith(home + '/') || p === home;
    if (isUnderHome) {
      p = '~' + p.slice(home.length);
    }

    const segments = p.split('/').filter(Boolean);
    if (segments.length <= 1) return p; // "~" 또는 드라이브 루트

    // Fish-shell 축약: 마지막 세그먼트만 전체, 나머지는 첫 글자
    // Windows 드라이브 문자 (C: 등)는 축약하지 않음
    const abbreviated = segments.map((seg, i) => {
      if (i === segments.length - 1) return seg;
      if (/^[A-Za-z]:$/.test(seg)) return seg;
      return seg[0];
    });

    return abbreviated.join('/');
  } catch { return ''; }
}

// ── Git 저장소명:브랜치 (파일 캐시, 5초 TTL) ────────────────────────────────
function renderGitInfo(cwd) {
  const empty = { display: '', repoName: '' };
  if (!CONFIG.elements.gitBranch) return empty;
  try {
    const cacheFile = path.join(os.tmpdir(), 'claude-hud-git-cache.json');
    const cache = readJsonSafe(cacheFile);

    if (cache && cache.cwd === cwd && (Date.now() - cache.timestamp) < CONFIG.gitCacheTtlMs) {
      return { display: cache.display || '', repoName: cache.repoName || '' };
    }

    const opts = { cwd: cwd || undefined, encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] };
    const branch = execSync('git branch --show-current', opts).trim();

    // remote URL에서 저장소명 추출: "repo.git" 또는 "repo" → "repo"
    let repoName = '';
    try {
      const url = execSync('git remote get-url origin', opts).trim();
      const match = url.match(/\/([^/]+?)(?:\.git)?$/);
      if (match) repoName = match[1];
    } catch { /* no remote */ }

    const display = repoName ? `${repoName}:${branch}` : branch;
    writeJsonAtomic(cacheFile, { timestamp: Date.now(), cwd, display, repoName });
    return { display, repoName };
  } catch { return empty; }
}

// ── HTTPS 요청 유틸리티 ───────────────────────────────────────────────────────
// hard timeout: DNS/TCP/TLS 어느 단계에서 막히든 반드시 resolve
function httpsRequest(options, body) {
  return new Promise((resolve) => {
    const hardTimeout = options.timeout || API_TIMEOUT_MS;
    const hardTimer = setTimeout(() => {
      try { req.destroy(); } catch { /* ignore */ }
      resolve({ status: 0, data: null });
    }, hardTimeout + 1000); // 소켓 timeout + 여유 1초

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(hardTimer);
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          resolve({ status: res.statusCode, data: res.statusCode === 200 ? data : null });
        } catch { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('error', () => { clearTimeout(hardTimer); resolve({ status: 0, data: null }); });
    req.on('timeout', () => { clearTimeout(hardTimer); req.destroy(); resolve({ status: 0, data: null }); });
    if (body) req.write(body);
    req.end();
  });
}

// ── OAuth 토큰 갱신 ──────────────────────────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID,
  }).toString();

  const result = await httpsRequest({
    hostname: 'platform.claude.com',
    path: '/v1/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: API_TIMEOUT_MS,
  }, body);

  if (result?.data?.access_token) {
    return {
      success: true,
      accessToken: result.data.access_token,
      refreshToken: result.data.refresh_token || refreshToken,
      expiresAt: result.data.expires_in
        ? Date.now() + result.data.expires_in * 1000
        : result.data.expires_at,
    };
  }
  return { success: false, status: result?.status || 0 };
}

// ── 레이트 제한 (OAuth API + 5분 캐시) ───────────────────────────────────────
async function fetchRateLimits(sessionId) {
  const R = (text, reloginNeeded = false) => ({ text, reloginNeeded });
  if (!CONFIG.elements.rateLimits) return R('');

  const cacheFile = path.join(os.tmpdir(), 'claude-hud-usage-cache.json');
  const cache = readJsonSafe(cacheFile);

  // refreshFailed 캐시 무효화: credentials가 캐시보다 새로우면 재로그인 감지 → 캐시 무시
  const credsFresherThanCache = cache?.refreshFailed && (() => {
    try {
      const cp = path.join(os.homedir(), '.claude', '.credentials.json');
      return fs.statSync(cp).mtimeMs > cache.timestamp;
    } catch { return false; }
  })();

  // TTL 내 → API 호출 건너뛰기 (429 백오프 시 10분, 정상 시 5분)
  const effectiveTtl = cache?.backoff ? CONFIG.rateLimitBackoffTtlMs : CONFIG.rateLimitCacheTtlMs;
  if (cache?.timestamp && (Date.now() - cache.timestamp) < effectiveTtl && !credsFresherThanCache) {
    appendApiLog('-', cache?.backoff ? 'cache-hit(backoff)' : 'cache-hit', sessionId);
    const hasData = cache.data?.five_hour || cache.data?.seven_day;
    return R(hasData ? formatRateLimits(cache.data, cache.lastSuccess) : '', !!cache?.refreshFailed);
  }

  // TTL 만료된 기존 유효 데이터 (API 실패 시 fallback 용도)
  const validCache = cache?.data?.five_hour || cache?.data?.seven_day ? cache : null;
  const fallbackText = () => validCache?.data ? formatRateLimits(validCache.data, validCache.lastSuccess) : '';

  try {
    // credentials 읽기
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = readJsonSafe(credPath);
    let oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) {
      appendApiLog('-', 'no-token', sessionId);
      return R(fallbackText());
    }

    // 만료 시 갱신
    if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
      if (!oauth.refreshToken) {
        appendApiLog('-', 'no-refresh-token', sessionId);
        return R(fallbackText(), true);
      }
      const refreshed = await refreshAccessToken(oauth.refreshToken);
      if (!refreshed.success) {
        appendApiLog('-', `refresh-failed(${refreshed.status})`, sessionId);
        writeJsonAtomic(cacheFile, {
          timestamp: Date.now(),
          lastSuccess: validCache?.lastSuccess || null,
          data: validCache?.data || null,
          backoff: true,
          refreshFailed: true,
        });
        return R(fallbackText(), true);
      }

      // 갱신된 토큰 write-back
      const { success, ...tokens } = refreshed;
      oauth = { ...oauth, ...tokens };
      creds.claudeAiOauth = oauth;
      writeJsonAtomic(credPath, creds);
    }

    // 오래된 로그 파일 정리 (API 호출 시점 = 5분 간격)
    cleanupOldApiLogs();

    // API 호출 전 캐시 timestamp 선점 → 다른 세션의 중복 호출 방지
    const traceId = generateTraceId();
    activeTraceId = traceId;
    writeJsonAtomic(cacheFile, {
      timestamp: Date.now(),
      lastSuccess: validCache?.lastSuccess || null,
      data: validCache?.data || null,
    });
    appendApiLog('-', 'pre-fetch', sessionId, traceId);

    // API 호출 (hard timeout으로 DNS/TCP hanging 방지)
    const result = await httpsRequest({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT_MS,
    });
    activeTraceId = null;

    // API 결과 로그
    appendApiLog(result.status, result.data ? 'ok' : 'fail', sessionId, traceId);

    if (result.data) {
      const now = Date.now();
      writeJsonAtomic(cacheFile, { timestamp: now, lastSuccess: now, data: result.data });
      return R(formatRateLimits(result.data, now));
    }

    // 429 → 백오프 모드 (10분 TTL)
    if (result.status === 429) {
      appendApiLog('-', 'backoff-enabled(10m)', sessionId, traceId);
      writeJsonAtomic(cacheFile, {
        timestamp: Date.now(),
        lastSuccess: validCache?.lastSuccess || null,
        data: validCache?.data || null,
        backoff: true,
      });
      return R(fallbackText());
    }

    // API 실패 시 캐시는 이미 선점됨 → 추가 갱신 불필요 (lastSuccess만 보존)
  } catch (err) {
    const tid = activeTraceId;
    activeTraceId = null;
    appendApiLog(0, `error:${err?.message || 'unknown'}`, sessionId, tid);
    // 예외 발생 시에도 타임스탬프 갱신 (lastSuccess는 유지)
    writeJsonAtomic(cacheFile, {
      timestamp: Date.now(),
      lastSuccess: validCache?.lastSuccess || null,
      data: validCache?.data || null,
    });
  }

  return R(fallbackText());
}

function formatTimeRemaining(resetsAt) {
  if (!resetsAt) return '';
  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const totalMin = Math.floor(diff / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d${remH}h` : `${days}d`;
}

function formatRateLimits(usage, lastSuccess) {
  // lastSuccess가 12분 이상 지나면 stale 표시 (백오프 10분 + 여유 2분)
  const stale = lastSuccess && (Date.now() - lastSuccess > 12 * 60_000);
  const staleMark = stale ? '~' : '';
  const parts = [];
  if (usage.five_hour?.utilization != null) {
    const v = usage.five_hour.utilization;
    const ttl = formatTimeRemaining(usage.five_hour.resets_at);
    const label = ttl ? `5h:${staleMark}${v}%(${ttl})` : `5h:${staleMark}${v}%`;
    parts.push(colorByThreshold(v, 70, 90, label));
  }
  if (usage.seven_day?.utilization != null) {
    const v = usage.seven_day.utilization;
    const ttl = formatTimeRemaining(usage.seven_day.resets_at);
    const label = ttl ? `wk:${staleMark}${v}%(${ttl})` : `wk:${staleMark}${v}%`;
    parts.push(colorByThreshold(v, 70, 90, label));
  }
  return parts.join(' ');
}

// ── 컨텍스트 사용량 계산 유틸리티 ────────────────────────────────────────────
function calcContextUsage(ctxWindow) {
  const windowSize = ctxWindow?.context_window_size || 200000;
  const usage = ctxWindow?.current_usage;

  if (usage) {
    const usedTokens = (usage.input_tokens || 0)
                     + (usage.cache_creation_input_tokens || 0)
                     + (usage.cache_read_input_tokens || 0);
    return { usedTokens, pct: Math.round(usedTokens * 100 / windowSize), windowSize };
  }
  if (ctxWindow?.used_percentage != null) {
    const pct = Math.round(ctxWindow.used_percentage);
    return { usedTokens: Math.round((pct / 100) * windowSize), pct, windowSize };
  }
  return null;
}

// ── 토큰 수 축약 유틸리티 ────────────────────────────────────────────────────
function formatTokenCount(tokens) {
  if (tokens >= 999_500) {
    const m = tokens / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

// ── 컨텍스트 바 (current_usage 직접 합산 — ssenart 방식) ────────────────────
function renderContextBar(ctxWindow) {
  if (!CONFIG.elements.contextBar) return '';
  try {
    const ctx = calcContextUsage(ctxWindow);
    if (!ctx) return '';
    const { usedTokens, pct, windowSize } = ctx;

    const clampedPct = Math.min(pct, 100);
    const filled = Math.round((clampedPct / 100) * CONFIG.contextBarWidth);
    const empty = CONFIG.contextBarWidth - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);

    const used  = formatTokenCount(usedTokens);
    const total = formatTokenCount(windowSize);
    const warning = pct >= CONFIG.thresholds.contextCritical ? ' COMPACT!' : '';
    const is1M = windowSize >= 1_000_000;
    if (is1M) {
      // 1M: total만 red, warning은 threshold 색상 적용
      const barPart = colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, `ctx:[${bar}] ${used}/`);
      const coloredWarning = warning ? colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, warning) : '';
      return `${barPart}${red(total)}${coloredWarning}`;
    }
    const text = `ctx:[${bar}] ${used}/${total}${warning}`;
    return colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, text);
  } catch { return ''; }
}

// ── 컨텍스트 파일 관리 (훅 브릿지) ──────────────────────────────────────────
function manageContextFiles(ctxWindow, sessionId) {
  if (!sessionId || !ctxWindow) return;
  try {
    const ctx = calcContextUsage(ctxWindow);
    if (!ctx) return;
    const { usedTokens, pct, windowSize } = ctx;

    const sessionDir = path.join(os.homedir(), '.claude-box', 'data', 'session-memory', sessionId);
    const hudFile = path.join(sessionDir, 'ctx-for-hud.json');
    const hookFile = path.join(sessionDir, 'ctx-for-hook.json');
    const logFile = path.join(sessionDir, 'ctx-notify.log');

    const ctxData = { pct, used: usedTokens, total: windowSize, timestamp: Date.now() };

    // 디렉토리 확인
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // hud.json 없음 → 최초 생성 + hook.json 생성
    if (!fs.existsSync(hudFile)) {
      writeJsonAtomic(hudFile, ctxData);
      writeJsonAtomic(hookFile, ctxData);
      appendCtxLog(logFile, sessionId, `init pct:${pct} used:${usedTokens} total:${windowSize}`);
      return;
    }

    // hud.json 있음 → 10% 단위 비교
    const prev = readJsonSafe(hudFile);
    if (!prev) {
      writeJsonAtomic(hudFile, ctxData);
      return;
    }

    // 50% 이상이면 5% 단위, 미만이면 10% 단위
    const step = pct >= 50 || prev.pct >= 50 ? 5 : 10;
    const prevBase = Math.floor(prev.pct / step) * step;
    const currBase = Math.floor(pct / step) * step;

    if (Math.abs(currBase - prevBase) >= step) {
      writeJsonAtomic(hudFile, ctxData);
      writeJsonAtomic(hookFile, ctxData);
      appendCtxLog(logFile, sessionId, `trigger ${prev.pct}%(${prevBase})→${pct}%(${currBase}) used:${usedTokens} total:${windowSize}`);
    }
  } catch { /* silent */ }
}

function appendCtxLog(logFile, sessionId, message) {
  try {
    const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const sid = sessionId ? sessionId.slice(0, 8) : 'unknown';
    fs.appendFileSync(logFile, `${ts} | sid:${sid} | ${message}\n`);
  } catch { /* ignore */ }
}
// ── 컨텍스트 파일 관리 끝 ────────────────────────────────────────────────────

// ── 세션 누적 토큰 사용량 ────────────────────────────────────────────────────
function renderTokenUsage(ctxWindow) {
  if (!CONFIG.elements.tokenUsage || !ctxWindow) return '';
  try {
    const inTok  = ctxWindow.total_input_tokens;
    const outTok = ctxWindow.total_output_tokens;
    if (inTok == null && outTok == null) return '';

    const parts = [];
    if (inTok != null)  parts.push(`in:${formatTokenCount(inTok)}`);
    if (outTok != null) parts.push(`out:${formatTokenCount(outTok)}`);
    return parts.join(' ');
  } catch { return ''; }
}

// ── 세션 정보 (경과 시간 + 비용) ─────────────────────────────────────────────
function renderSession(cost) {
  if (!CONFIG.elements.sessionInfo) return '';
  try {
    const parts = [];

    if (cost?.total_duration_ms != null) {
      const totalMin = Math.floor(cost.total_duration_ms / 60000);
      if (totalMin >= 60) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        parts.push(`${h}h${m > 0 ? m + 'm' : ''}`);
      } else {
        parts.push(`${totalMin}m`);
      }
    }

    if (cost?.total_cost_usd != null) {
      parts.push(`$${cost.total_cost_usd.toFixed(2)}`);
    }

    return parts.join(' ');
  } catch { return ''; }
}

// ── 캐시 효율 ────────────────────────────────────────────────────────────────
function renderCache(currentUsage) {
  if (!CONFIG.elements.cacheEfficiency || !currentUsage) return '';
  try {
    const cacheRead   = currentUsage.cache_read_input_tokens || 0;
    const cacheCreate = currentUsage.cache_creation_input_tokens || 0;
    const input       = currentUsage.input_tokens || 0;
    const total       = input + cacheRead + cacheCreate;

    if (total === 0) return '';

    const pct  = Math.round((cacheRead / total) * 100);
    const text = `cache:${pct}%`;

    if (pct >= 50) return green(text);
    if (pct >= 25) return yellow(text);
    return dim(text);
  } catch { return ''; }
}

// ── Transcript 파싱 (파일 크기 기반 캐시) ─────────────────────────────────────
function parseTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const cacheFile = path.join(os.tmpdir(), 'claude-hud-transcript-cache.json');
    const stat = fs.statSync(transcriptPath);
    const cache = readJsonSafe(cacheFile);

    // 파일 크기 동일 → append-only이므로 변경 없음
    if (cache && cache.path === transcriptPath && cache.size === stat.size) {
      return cache.data;
    }

    const raw = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = raw.trim().split('\n');

    let taskCreateCount = 0;
    const taskStatus = {};     // taskId → latest status
    const taskActiveForm = {}; // taskId → activeForm text
    const agentMap = {};       // tool_use_id → { type, model, isTeam, name, desc, status }

    for (const line of lines) {
      try {
        const j = JSON.parse(line);

        if (j.type === 'assistant' && j.message?.content) {
          for (const block of j.message.content) {
            if (block.type !== 'tool_use') continue;

            // Agent 호출 추적
            if (block.name === 'Agent') {
              agentMap[block.id] = {
                type: block.input?.subagent_type || 'unknown',
                model: block.input?.model || null,
                isTeam: !!block.input?.team_name,
                name: block.input?.name || '',
                desc: block.input?.description || '',
                status: 'running',
              };
            }

            // 팀 삭제 → 해당 팀의 모든 에이전트 completed
            if (block.name === 'TeamDelete') {
              for (const a of Object.values(agentMap)) {
                if (a.isTeam) a.status = 'completed';
              }
            }
            // shutdown_request → 해당 팀메이트 completed (name 필드로 정확 매칭)
            if (block.name === 'SendMessage' && block.input?.type === 'shutdown_request' && block.input?.recipient) {
              const recipient = block.input.recipient;
              for (const a of Object.values(agentMap)) {
                if (a.isTeam && a.name === recipient) a.status = 'completed';
              }
            }

            if (block.name === 'TaskCreate') {
              taskCreateCount++;
              if (block.input?.activeForm) {
                // TaskCreate 시점에서는 아직 ID를 모르므로 순번으로 임시 저장
                taskActiveForm[`_pending_${taskCreateCount}`] = block.input.activeForm;
              }
            }
            if (block.name === 'TaskUpdate' && block.input?.taskId) {
              if (block.input.status) taskStatus[block.input.taskId] = block.input.status;
              if (block.input.activeForm) taskActiveForm[block.input.taskId] = block.input.activeForm;
            }
          }
        }

        // tool_result에서 Agent 완료 감지
        if (j.type === 'user' && Array.isArray(j.message?.content)) {
          for (const block of j.message.content) {
            if (block.type === 'tool_result' && agentMap[block.tool_use_id]) {
              // 백그라운드/팀 에이전트는 즉시 tool_result가 오지만 아직 running
              // - 백그라운드: "Async agent launched..."
              // - 팀 스폰: "Spawned successfully..."
              const text = Array.isArray(block.content)
                ? block.content.map(c => c.text || '').join('')
                : (block.content || '');
              const isStillRunning = text.startsWith('Async agent launched')
                || text.startsWith('Spawned successfully');
              if (!isStillRunning) {
                agentMap[block.tool_use_id].status = 'completed';
              }
            }
          }
        }

        // task-notification으로 백그라운드 에이전트 완료 감지
        // - user 메시지의 문자열 content 또는
        // - queue-operation의 content 필드로 전달됨
        {
          const msg = (j.type === 'user' && typeof j.message?.content === 'string')
            ? j.message.content
            : (j.type === 'queue-operation' && typeof j.content === 'string')
              ? j.content
              : null;
          if (msg && msg.includes('<task-notification>') && msg.includes('<status>completed</status>')) {
            const idMatch = msg.match(/<tool-use-id>([^<]+)<\/tool-use-id>/);
            if (idMatch && agentMap[idMatch[1]]) {
              agentMap[idMatch[1]].status = 'completed';
            }
          }
        }

        if (j.type === 'user' && j.toolUseResult) {
          const r = typeof j.toolUseResult === 'string' ? JSON.parse(j.toolUseResult) : j.toolUseResult;
          if (r.task?.id) {
            // TaskCreate 결과의 id와 순번이 일치 → activeForm 매핑
            for (const k of Object.keys(taskActiveForm)) {
              if (k.startsWith('_pending_')) {
                taskActiveForm[r.task.id] = taskActiveForm[k];
                delete taskActiveForm[k];
                break;
              }
            }
          }
        }
      } catch { /* skip malformed lines */ }
    }

    // 집계
    // totalTasks: TaskCreate 수와 TaskUpdate에서 참조된 고유 taskId 수 중 큰 값 사용
    // (팀 에이전트가 생성한 태스크는 메인 transcript에 TaskCreate 없이 TaskUpdate만 존재)
    const allKnownIds = Object.keys(taskStatus).length;
    const deletedCount = Object.values(taskStatus).filter(s => s === 'deleted').length;
    const completedCount = Object.values(taskStatus).filter(s => s === 'completed').length;
    const totalTasks = Math.max(taskCreateCount, allKnownIds) - deletedCount;

    // in_progress 태스크의 activeForm 찾기
    let working = '';
    for (const [id, status] of Object.entries(taskStatus)) {
      if (status === 'in_progress' && taskActiveForm[id]) {
        working = taskActiveForm[id];
        break;
      }
    }

    // 활성 에이전트 집계
    const activeAgents = Object.values(agentMap).filter(a => a.status === 'running');

    const data = { totalTasks, completedTasks: Math.min(completedCount, totalTasks), working, activeAgents };
    writeJsonAtomic(cacheFile, { path: transcriptPath, size: stat.size, data });
    return data;
  } catch { return null; }
}

function renderTaskProgress(stats) {
  if (!CONFIG.elements.taskProgress || !stats || stats.totalTasks === 0) return '';
  try {
    const count = `task:${stats.completedTasks}/${stats.totalTasks}`;
    const coloredCount = stats.completedTasks === stats.totalTasks ? green(count)
      : stats.completedTasks > 0 ? yellow(count)
      : dim(count);

    if (!stats.working) return coloredCount;

    const label = stats.working.length > 30
      ? stats.working.slice(0, 29) + '\u2026'
      : stats.working;
    return coloredCount + ' ' + dim(`(${label})`);
  } catch { return ''; }
}

// ── 활성 에이전트 표시 ─────────────────────────────────────────────────────────
function renderActiveAgents(agents) {
  if (!CONFIG.elements.activeAgents || !agents || agents.length === 0) return '';
  try {
    // 서브에이전트 / 팀 멤버 분류
    const subs = agents.filter(a => !a.isTeam);
    const team = agents.filter(a => a.isTeam);

    const parts = [];
    if (subs.length > 0) parts.push(`sub:${subs.length}`);
    if (team.length > 0) parts.push(`team:${team.length}`);

    const text = `agents:${agents.length}(${parts.join(' ')})`;
    return cyan(text);
  } catch { return ''; }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
try {
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw);
  const cwd  = data.cwd || process.cwd();

  // 비동기 요소 병렬 실행 (hard timeout으로 최대 4초 내 완료 보장)
  const [rateLimitResult] = await Promise.all([
    fetchRateLimits(data.session_id),
  ]);
  const rateLimits = rateLimitResult.text;
  const reloginWarning = rateLimitResult.reloginNeeded ? yellow('\uD83D\uDD12 relogin') : '';

  // 동기 요소 렌더링
  const model     = renderModel(data.model);
  const cwdResult = renderCwd(cwd);
  const gitResult = renderGitInfo(cwd);  // { display, repoName }
  const ctx       = renderContextBar(data.context_window);
  manageContextFiles(data.context_window, data.session_id);
  const tokens    = renderTokenUsage(data.context_window);
  const session   = renderSession(data.cost);
  const cache     = renderCache(data.context_window?.current_usage);

  // cwd 마지막 디렉토리와 repo명이 같으면 → cwd 생략 (중복 제거)
  const cwdLastDir = cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  const showCwd = cwdResult && (cwdLastDir !== gitResult.repoName);

  // transcript 파싱
  const stats = parseTranscript(data.transcript_path);
  const task   = renderTaskProgress(stats);
  const agents = renderActiveAgents(stats?.activeAgents);

  // 1줄 조합
  const lastActivity = renderLastActivity(data.transcript_path);

  const sessionIdShort = renderSessionId(data.session_id);

  const allParts = [
    model,
    reloginWarning,
    rateLimits, ctx,
    showCwd ? cwdResult : '',
    gitResult.display,
    sessionIdShort,
    session, tokens, lastActivity,
    cache, task, agents,
  ].filter(Boolean);

  if (allParts.length > 0) {
    process.stdout.write(allParts.join(SEP) + '\n');
  }

} catch {
  // 최외곽 에러 → 빈 출력 (HUD 숨김)
}
