#!/usr/bin/env node
/**
 * statusline.mjs - Native Claude Code StatusLine HUD
 *
 * Setup: ~/.claude/settings.json > statusLine.command
 * Role: Claude Code sends stdin JSON, this outputs a 1-line ANSI HUD to stdout
 * Dependencies: Pure Node.js (no external packages)
 *
 * ─── Output Format ────────────────────────────────────────────────────
 *   Opus 4.6 | 🔒 relogin | 5h:45%(2h) wk:12%(5d) | ctx:[████████░░] 100k/200k | ~/2/m/f/src | sid:2ea2b | repo:branch | 23m $0.42 | in:45k out:12k | 12:34:56 | cache:67% | task:2/5 | agents:3(sub:2 team:1)
 *   ① model  ② relogin  ③ rateLimits             ④ contextBar                ⑤ cwd       ⑥ sessionId ⑦ gitInfo   ⑧ session  ⑨ tokenUsage    ⑩ lastAct  ⑪ cache  ⑫ taskProgress ⑬ activeAgents
 *
 * ─── Element Table ──────────────────────────────────────────────────
 *   Function           | Data Source                    | Cache Strategy             | Color Rule
 *   ───────────────────┼────────────────────────────────┼────────────────────────────┼──────────────────────────
 *   renderSessionId    | stdin.session_id (first 5)     | none                       | purple fixed
 *   renderLastActivity | transcript file mtime          | none                       | dim fixed
 *   renderModel        | stdin.model.display_name       | none                       | cyan fixed
 *   (reloginWarning)   | fetchRateLimits.reloginNeeded  | (shared w/ fetchRateLimits)| yellow fixed
 *   formatTimeRemaining| resets_at (ISO 8601)           | none (inside formatRL)     | none (inherits parent)
 *   fetchRateLimits    | OAuth API (api.anthropic.com)  | file cache, 5min TTL, preemptive | green/yellow/red (70/90%)
 *   renderContextBar   | current_usage token sum        | none                       | green/yellow/red (70/85%) + 1M total red
 *   formatTokenCount   | (utility)                      | none                       | none
 *   renderTokenUsage   | stdin.context_window.total_*   | none                       | none (plain)
 *   renderCwd          | stdin.cwd (Fish-shell abbrev)  | none                       | none (plain)
 *   renderGitInfo      | git CLI (branch, remote URL)   | file cache, 5s TTL         | none (plain)
 *   renderSession      | stdin.cost (duration, usd)     | none                       | none (plain)
 *   renderCache        | stdin.context_window.usage     | none                       | green≥50 / yellow≥25 / dim
 *   renderTaskProgress | transcript JSONL parsing       | file cache, filesize-based | green=done / yellow=active / dim
 *   renderActiveAgents | transcript Agent tool_use      | file cache (shared)        | cyan fixed
 *
 * ─── OAuth Flow (fetchRateLimits) ───────────────────────────────────
 *   Read .credentials.json → check expiresAt → refresh if expired → GET /api/oauth/usage → write-back credentials
 *
 * ─── Cache Files (os.tmpdir()) ──────────────────────────────────────
 *   claude-hud-git-cache.json        — Git repo:branch (5s TTL)
 *   claude-hud-usage-cache.json      — Rate limit API response (5min TTL)
 *   claude-hud-transcript-cache.json — Transcript parse result (filesize-based)
 *   claude-hud-api-YYYY-MM-DD.log    — API call log (daily rotation, auto-deletes logs older than 1 day)
 *
 * ─── Error Handling ─────────────────────────────────────────────────
 *   Each render* function is wrapped in its own try-catch, returning '' on failure (one element fails ≠ all fail)
 *   Outer try-catch: on fatal errors (parse failure etc.), outputs nothing to hide the HUD
 *
 * ─── 429 Rate Limit Troubleshooting ────────────────────────────────
 *   Symptom: wk:% value freezes and stops updating
 *   Cause: API may return 429 when OAuth token is expired
 *   Fix: Log out of claude.ai → re-login to refresh OAuth token
 *        Or check if another session is over-calling the API (cache file is shared across sessions)
 *
 * ─── Configuration ──────────────────────────────────────────────────
 *   Toggle each element on/off via CONFIG.elements object below
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  elements: {
    sessionId: true,
    lastActivity: true,
    model: true,
    cwd: true,
    gitBranch: true,
    rateLimits: true,
    contextBar: true,
    tokenUsage: true,
    sessionInfo: true,
    cacheEfficiency: true,
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

// ── ANSI Colors ─────────────────────────────────────────────────────────────
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const purple = (s) => `\x1b[38;2;150;162;252m${s}\x1b[0m`;
const SEP    = dim(' | ');

// ── Utilities ──────────────────────────────────────────────────────────────────
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

// ── API Call Logging ────────────────────────────────────────────────────────────
function getApiLogFile() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (local date via ISO)
  return path.join(os.tmpdir(), `claude-hud-api-${today}.log`);
}
let activeTraceId = null;

function generateTraceId() {
  return Math.random().toString(36).slice(2, 8);
}

function appendApiLog(status, result, sessionId, traceId) {
  try {
    const ts = new Date().toISOString();
    const sid = sessionId ? sessionId.slice(0, 8) : 'unknown';
    const tid = traceId ? ` | tid:${traceId}` : '';
    const line = `${ts} | sid:${sid} | pid:${process.pid}${tid} | HTTP ${status} | ${result}\n`;
    fs.appendFileSync(getApiLogFile(), line);
  } catch { /* ignore */ }
}

function cleanupOldApiLogs() {
  try {
    const tmpDir = os.tmpdir();
    // Delete logs from 2 days ago (keep today + yesterday)
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    try { fs.unlinkSync(path.join(tmpDir, `claude-hud-api-${twoDaysAgo}.log`)); } catch { /* ignore */ }
    // Delete legacy single log file
    try { fs.unlinkSync(path.join(tmpDir, 'claude-hud-api.log')); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

process.on('SIGTERM', () => {
  const tid = activeTraceId || 'none';
  appendApiLog('-', `SIGTERM(tid:${tid})`, 'system');
  process.exit(0);
});

// ── Read stdin (3s timeout) ──────────────────────────────────────────────────
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

// ── Session ID (first 5 chars) ──────────────────────────────────────────────────────────
function renderSessionId(sessionId) {
  if (!CONFIG.elements.sessionId || !sessionId) return '';
  try {
    return purple(`sid:${sessionId.slice(0, 5)}`);
  } catch { return ''; }
}

// ── Last activity time (transcript mtime) ─────────────────────────────────
function renderLastActivity(transcriptPath) {
  if (!CONFIG.elements.lastActivity || !transcriptPath) return '';
  try {
    const t = fs.statSync(transcriptPath).mtime;
    const pad = (n) => String(n).padStart(2, '0');
    return dim(`${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`);
  } catch { return ''; }
}

// ── Model name rendering ─────────────────────────────────────────────────────────────
function renderModel(model) {
  if (!CONFIG.elements.model) return '';
  try {
    return cyan(model?.display_name || 'Unknown');
  } catch { return ''; }
}

// ── CWD display (Fish-shell style abbreviation) ────────────────────────────────────────
function renderCwd(cwd) {
  if (!CONFIG.elements.cwd || !cwd) return '';
  try {
    // Normalize Windows paths: backslash → forward slash
    let p = cwd.replace(/\\/g, '/');

    // Replace homedir with ~
    const home = os.homedir().replace(/\\/g, '/');
    const isUnderHome = p.startsWith(home + '/') || p === home;
    if (isUnderHome) {
      p = '~' + p.slice(home.length);
    }

    const segments = p.split('/').filter(Boolean);
    if (segments.length <= 1) return p; // "~" or drive root

    // Fish-shell abbreviation: last segment in full, others first char only
    // Keep Windows drive letters (C: etc) unabbreviated
    const abbreviated = segments.map((seg, i) => {
      if (i === segments.length - 1) return seg;
      if (/^[A-Za-z]:$/.test(seg)) return seg;
      return seg[0];
    });

    return abbreviated.join('/');
  } catch { return ''; }
}

// ── Git repo:branch (file cache, 5s TTL) ────────────────────────────────
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

    // Extract repo name from remote URL: "repo.git" or "repo" → "repo"
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

// ── HTTPS request utility ───────────────────────────────────────────────────────
// Hard timeout: resolve no matter which stage (DNS/TCP/TLS) hangs
function httpsRequest(options, body) {
  return new Promise((resolve) => {
    const hardTimeout = options.timeout || API_TIMEOUT_MS;
    const hardTimer = setTimeout(() => {
      try { req.destroy(); } catch { /* ignore */ }
      resolve({ status: 0, data: null });
    }, hardTimeout + 1000); // Socket timeout + 1s margin

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

// ── OAuth token refresh ──────────────────────────────────────────────────────────
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

// ── Rate limits (OAuth API + 5min cache) ───────────────────────────────────────
async function fetchRateLimits(sessionId) {
  const R = (text, reloginNeeded = false) => ({ text, reloginNeeded });
  if (!CONFIG.elements.rateLimits) return R('');

  const cacheFile = path.join(os.tmpdir(), 'claude-hud-usage-cache.json');
  const cache = readJsonSafe(cacheFile);

  // Invalidate refreshFailed cache: if credentials are newer than cache, user re-logged in → skip cache
  const credsFresherThanCache = cache?.refreshFailed && (() => {
    try {
      const cp = path.join(os.homedir(), '.claude', '.credentials.json');
      return fs.statSync(cp).mtimeMs > cache.timestamp;
    } catch { return false; }
  })();

  // Within TTL → skip API call (10min on 429 backoff, 5min normal)
  const effectiveTtl = cache?.backoff ? CONFIG.rateLimitBackoffTtlMs : CONFIG.rateLimitCacheTtlMs;
  if (cache?.timestamp && (Date.now() - cache.timestamp) < effectiveTtl && !credsFresherThanCache) {
    appendApiLog('-', cache?.backoff ? 'cache-hit(backoff)' : 'cache-hit', sessionId);
    const hasData = cache.data?.five_hour || cache.data?.seven_day;
    return R(hasData ? formatRateLimits(cache.data, cache.lastSuccess) : '', !!cache?.refreshFailed);
  }

  // Stale but valid data from previous TTL (fallback on API failure)
  const validCache = cache?.data?.five_hour || cache?.data?.seven_day ? cache : null;
  const fallbackText = () => validCache?.data ? formatRateLimits(validCache.data, validCache.lastSuccess) : '';

  try {
    // Read credentials
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = readJsonSafe(credPath);
    let oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) {
      appendApiLog('-', 'no-token', sessionId);
      return R(fallbackText());
    }

    // Refresh if expired
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

      // Write back refreshed tokens
      const { success, ...tokens } = refreshed;
      oauth = { ...oauth, ...tokens };
      creds.claudeAiOauth = oauth;
      writeJsonAtomic(credPath, creds);
    }

    // Clean up old log files (runs at API call intervals ~5min)
    cleanupOldApiLogs();

    // Preempt cache timestamp before API call → prevent duplicate calls from other sessions
    const traceId = generateTraceId();
    activeTraceId = traceId;
    writeJsonAtomic(cacheFile, {
      timestamp: Date.now(),
      lastSuccess: validCache?.lastSuccess || null,
      data: validCache?.data || null,
    });
    appendApiLog('-', 'pre-fetch', sessionId, traceId);

    // API call (hard timeout prevents DNS/TCP hanging)
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

    // Log API result
    appendApiLog(result.status, result.data ? 'ok' : 'fail', sessionId, traceId);

    if (result.data) {
      const now = Date.now();
      writeJsonAtomic(cacheFile, { timestamp: now, lastSuccess: now, data: result.data });
      return R(formatRateLimits(result.data, now));
    }

    // 429 → backoff mode (10min TTL)
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

    // On API failure, cache was already preempted → no extra update needed (preserve lastSuccess)
  } catch (err) {
    const tid = activeTraceId;
    activeTraceId = null;
    appendApiLog(0, `error:${err?.message || 'unknown'}`, sessionId, tid);
    // Update timestamp even on exception (preserve lastSuccess)
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
  // Mark stale if lastSuccess is >12min old (10min backoff + 2min margin)
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

// ── Context usage calculation utility ────────────────────────────────────────────
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

// ── Token count formatting utility ────────────────────────────────────────────────────
function formatTokenCount(tokens) {
  if (tokens >= 999_500) {
    const m = tokens / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

// ── Context bar (direct current_usage token sum) ────────────────────
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
      // 1M: only total in red, warning uses threshold color
      const barPart = colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, `ctx:[${bar}] ${used}/`);
      const coloredWarning = warning ? colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, warning) : '';
      return `${barPart}${red(total)}${coloredWarning}`;
    }
    const text = `ctx:[${bar}] ${used}/${total}${warning}`;
    return colorByThreshold(pct, CONFIG.thresholds.contextWarning, CONFIG.thresholds.contextCritical, text);
  } catch { return ''; }
}

// ── Context file management (hook bridge) ──────────────────────────────────────────
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

    // Ensure directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // No hud.json → first-time creation + hook.json creation
    if (!fs.existsSync(hudFile)) {
      writeJsonAtomic(hudFile, ctxData);
      writeJsonAtomic(hookFile, ctxData);
      appendCtxLog(logFile, sessionId, `init pct:${pct} used:${usedTokens} total:${windowSize}`);
      return;
    }

    // hud.json exists → compare at 10% step intervals
    const prev = readJsonSafe(hudFile);
    if (!prev) {
      writeJsonAtomic(hudFile, ctxData);
      return;
    }

    // 5% step if >=50%, 10% step if <50%
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
    const ts = new Date().toISOString();
    const sid = sessionId ? sessionId.slice(0, 8) : 'unknown';
    fs.appendFileSync(logFile, `${ts} | sid:${sid} | ${message}\n`);
  } catch { /* ignore */ }
}
// ── Context file management end ────────────────────────────────────────────

// ── Session cumulative token usage ────────────────────────────────────────────────────
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

// ── Session info (elapsed time + cost) ─────────────────────────────────────────────
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

// ── Cache efficiency ────────────────────────────────────────────────────────────────
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

// ── Transcript parsing (filesize-based cache) ─────────────────────────────────────
function parseTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const cacheFile = path.join(os.tmpdir(), 'claude-hud-transcript-cache.json');
    const stat = fs.statSync(transcriptPath);
    const cache = readJsonSafe(cacheFile);

    // Same file size → no change (append-only log)
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

            // Track Agent invocations
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

            // Team deleted → mark all agents in that team as completed
            if (block.name === 'TeamDelete') {
              for (const a of Object.values(agentMap)) {
                if (a.isTeam) a.status = 'completed';
              }
            }
            // shutdown_request → mark the matching teammate as completed (exact name match)
            if (block.name === 'SendMessage' && block.input?.type === 'shutdown_request' && block.input?.recipient) {
              const recipient = block.input.recipient;
              for (const a of Object.values(agentMap)) {
                if (a.isTeam && a.name === recipient) a.status = 'completed';
              }
            }

            if (block.name === 'TaskCreate') {
              taskCreateCount++;
              if (block.input?.activeForm) {
                // At TaskCreate time, ID is unknown — store by sequence number temporarily
                taskActiveForm[`_pending_${taskCreateCount}`] = block.input.activeForm;
              }
            }
            if (block.name === 'TaskUpdate' && block.input?.taskId) {
              if (block.input.status) taskStatus[block.input.taskId] = block.input.status;
              if (block.input.activeForm) taskActiveForm[block.input.taskId] = block.input.activeForm;
            }
          }
        }

        // Detect Agent completion from tool_result
        if (j.type === 'user' && Array.isArray(j.message?.content)) {
          for (const block of j.message.content) {
            if (block.type === 'tool_result' && agentMap[block.tool_use_id]) {
              // Background/team agents get immediate tool_result but are still running
              // - Background: "Async agent launched..."
              // - Team spawn: "Spawned successfully..."
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

        // Detect background agent completion via task-notification
        // - string content in user messages, or
        // - content field in queue-operation messages
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
            // Map TaskCreate result ID to sequence number → activeForm mapping
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

    // Aggregation
    // totalTasks: max of TaskCreate count and unique taskIds from TaskUpdate
    // (Tasks created by team agents only appear as TaskUpdate in main transcript, no TaskCreate)
    const allKnownIds = Object.keys(taskStatus).length;
    const deletedCount = Object.values(taskStatus).filter(s => s === 'deleted').length;
    const completedCount = Object.values(taskStatus).filter(s => s === 'completed').length;
    const totalTasks = Math.max(taskCreateCount, allKnownIds) - deletedCount;

    // Find activeForm of in_progress tasks
    let working = '';
    for (const [id, status] of Object.entries(taskStatus)) {
      if (status === 'in_progress' && taskActiveForm[id]) {
        working = taskActiveForm[id];
        break;
      }
    }

    // Aggregate active agents
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

// ── Active agents display ─────────────────────────────────────────────────────────
function renderActiveAgents(agents) {
  if (!CONFIG.elements.activeAgents || !agents || agents.length === 0) return '';
  try {
    // Classify into subagents / team members
    const subs = agents.filter(a => !a.isTeam);
    const team = agents.filter(a => a.isTeam);

    const parts = [];
    if (subs.length > 0) parts.push(`sub:${subs.length}`);
    if (team.length > 0) parts.push(`team:${team.length}`);

    const text = `agents:${agents.length}(${parts.join(' ')})`;
    return cyan(text);
  } catch { return ''; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw);
  const cwd  = data.cwd || process.cwd();

  // Run async elements in parallel (hard timeout guarantees completion within 4s)
  const [rateLimitResult] = await Promise.all([
    fetchRateLimits(data.session_id),
  ]);
  const rateLimits = rateLimitResult.text;
  const reloginWarning = rateLimitResult.reloginNeeded ? yellow('\uD83D\uDD12 relogin') : '';

  // Render sync elements
  const model     = renderModel(data.model);
  const cwdResult = renderCwd(cwd);
  const gitResult = renderGitInfo(cwd);  // { display, repoName }
  const ctx       = renderContextBar(data.context_window);
  manageContextFiles(data.context_window, data.session_id);
  const tokens    = renderTokenUsage(data.context_window);
  const session   = renderSession(data.cost);
  const cache     = renderCache(data.context_window?.current_usage);

  // If cwd last dir matches repo name → hide cwd (deduplicate)
  const cwdLastDir = cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  const showCwd = cwdResult && (cwdLastDir !== gitResult.repoName);

  // Parse transcript
  const stats = parseTranscript(data.transcript_path);
  const task   = renderTaskProgress(stats);
  const agents = renderActiveAgents(stats?.activeAgents);

  // Assemble single line
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
  // Outer error → empty output (hide HUD)
}
