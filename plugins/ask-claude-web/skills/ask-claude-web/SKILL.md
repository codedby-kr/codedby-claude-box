---
name: ask-claude-web
argument-hint: "discuss with claude.ai [topic or context]"
description: "Load this skill whenever 'web Claude', 'claude.ai', 'Claude chatbot', '웹 클로드', '웹클로드' is mentioned as a communication target. Automated communication skill that sends messages to a claude.ai web tab and receives responses. Covers all interactions with claude.ai: discuss, verify, review, ask, relay, share, consult. Based on chrome-devtools MCP. Dedicated to real-time conversation with a claude.ai tab. Trigger on: 'discuss with claude.ai', 'verify with claude.ai', 'ask claude.ai', 'discuss with web claude', 'get claude.ai's review', 'let web claude handle this', 'claude.ai would know this better', 'get claude.ai's opinion'. NEVER use take_snapshot (wastes 130K+ tokens)."
---

# ask-claude-web Skill

## Overview

Automates collaboration between Claude Code and claude.ai via chrome-devtools MCP. Supports discussions, reviews, verification, questions, and multi-turn conversations.

## Rules

- NEVER put file contents into evaluate_script (template literals, args, DataTransfer, Read tool). Attach files via clipboard Ctrl+V only.
- Do NOT use methods that consume massive tokens. (e.g. take_snapshot wastes 130K+ tokens per call)

## Prerequisites

- **Chrome** must be running — if Chrome is not open, ask the user to launch Chrome manually. Do NOT launch Chrome via system command — the MCP server cannot connect to a Chrome instance started after MCP initialization.
- `chrome://inspect/#remote-debugging` toggle must be ON
- **chrome-devtools MCP server** must be connected to Claude Code (check `/mcp` → `chrome-devtools · ✔ connected`)
- A **claude.ai tab** must be open and logged in
- **First connection per session**: Chrome will show a permission dialog ("Allow remote debugging?") — the user must click **Allow**. This happens once per Claude Code session.
- **If connection fails**: Ask the user to reconnect via `/mcp` (select chrome-devtools → reconnect) while Chrome is running.

## claude.ai Tab Selection

Check if the user specified a tab/URL/new chat. If specified, use that — regardless of list_pages results.
If not specified: use the currently open claude.ai chat. If tab number is unknown, `list_pages` → `select_page`. If tab doesn't exist, open with `new_page`.
If no claude.ai tab exists, navigate to the remembered URL or `https://claude.ai/`.

## Message Sending

> `{baseDir}` = this skill's directory (where this SKILL.md is located). DOM scripts: `{baseDir}/scripts/`. OS scripts: `${CLAUDE_PLUGIN_ROOT}/scripts/`.

### Text only

Run send.js with `__EXPECTED_ATTACHMENTS__` = 0. See "Run send.js" below.

### With file attachments

1. Copy files to clipboard:

| OS | Command |
|----|---------|
| **Windows** | `powershell -File "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files.ps1" "file1.md" "file2.md"` |
| **macOS** | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files-mac.sh" "file1.md" "file2.md"` |
| **Linux** | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/clip-files-linux.sh" "file1.md" "file2.md"` |

Multiple file paths → single Ctrl+V attaches all.

2. Focus input field (evaluate_script):
   - Selectors: `[contenteditable="true"][data-placeholder]` → fallback `[contenteditable="true"]`
   - Return: 'FOCUSED' or 'NOT_FOUND'

3. Paste:
   `press_key` — `Control+v` (Windows/Linux) or `Meta+v` (macOS)

4. (Optional) Verify file attachment (evaluate_script, ~100 tokens):
   - Count remove buttons in `fieldset` via the File-remove regex; filenames come from the remove-button aria-label (`"<ts>_<file> 제거"`) or chip leaf text (`"<ts>_<file>"`) — strip the `^\d+_` timestamp prefix
   - Return: { count, names: [filename] }

5. Run send.js with `__EXPECTED_ATTACHMENTS__` = file count. See "Run send.js" below.

### Run send.js

Execute: Read `{baseDir}/scripts/send.js`, replace placeholders, pass to evaluate_script **verbatim — do not rewrite**.
- `__MESSAGE__` → message text (escape `"` as `\"`)
- `__EXPECTED_ATTACHMENTS__` → expected count (text only: 0, with files: file count)

Handle results:
- { sent: true } → proceed to health check
- { sent: false, error: 'STILL_STREAMING' } → wait for response, then retry
- { sent: false, error: 'CLEANUP_FAILED' } → retry send.js
- { sent: false, error: 'MISSING_ATTACHMENTS' } → re-paste files, then retry
- { sent: false, error: 'SEND_BTN_NOT_FOUND' } → L2 regex fallback also failed; see "Self-heal on Unrecoverable Break" (the returned `buttons` list is the diagnostic)
- { error: 'INPUT_NOT_FOUND' } → L2 fallback also failed; see "Self-heal on Unrecoverable Break"

### Send confirmation — health check (single async evaluate_script)

- Wait 2s internally, then check 3 indicators in one call:
  1. Input field empty? (textContent.length < 5)
  2. Streaming started? (stop button: aria-label "Stop Response", "응답 중단", "Stop response")
  3. Response appearing? (get response length using extract-response.js traversal pattern)
- Return: { inputEmpty, inputTextLen, isStreaming, responseLen }
- Verdict:
  - inputEmpty + isStreaming → sent OK, proceed to streaming wait
  - text remains + not streaming → send failed, rerun send.js (max 2 retries)
  - inputEmpty + not streaming → ambiguous, check responseLen

## Wait for Response

Execute: Read `{baseDir}/scripts/wait-streaming.js`, replace `__TIMEOUT__` (300000 default, 600000 for web search/deep research), pass to evaluate_script **verbatim — do not rewrite**.
Returns: 'DONE' or 'TIMEOUT'

Handle results:
DONE → proceed to stability check.

TIMEOUT → **always run stability check first**, then decide:
- stable + len > 0 → response complete, proceed to extraction
- len 0 → claude.ai error, resend the message
- !stable + len > 0 → confirmed still generating (may be compacting — normal, extend wait). Retry wait-streaming.js once (+5min):
  → DONE → proceed to stability check
  → TIMEOUT → **always run stability check again**:
    - stable + len > 0 → response complete, proceed to extraction
    - Otherwise → diagnostic mode:
      1. Extract partial response — meaningful content?
      2. Check if last sent message exists on the page (delivery failure?)
      3. Meaningful content → use partial, warn "response may be incomplete"
         Request missing → resend. Request exists, no meaningful response → resend

If wait-streaming.js returns an error — manual polling (evaluate_script):
- Check stop button (aria-label: "응답 중단", "Stop Response", "Stop response") or `[data-is-streaming="true"]`
- Return: { isStreaming, hasStopButton, hasStreamingAttr }
- Poll every 3-5s until isStreaming is false

### Response complete — stability check (single async evaluate_script)

- Measure response text length twice (3s apart) using extract-response.js traversal pattern
- Equal lengths and > 0 → complete
- Return: { len1, len2, stable: len1 === len2 && len1 > 0 }
- stable: false → repeat (max 3), then attempt extraction anyway

## Read Response

Scroll conversation container to bottom before extraction (evaluate_script, recommended):
- From last `[data-testid="user-message"]`, walk up parents to find scrollable element (scrollHeight > clientHeight + 100), set scrollTop = scrollHeight
- Return: 'SCROLLED' or 'NO_SCROLLABLE_FOUND'
- Constraint: must be a separate evaluate_script call from extraction (browser needs render time)

### Extract last response

Execute: Read `{baseDir}/scripts/extract-response.js` and pass to evaluate_script **verbatim — do not rewrite**.
NEVER read via screenshot — long responses won't fit on screen.

Handle results:
Full response text → use as-is.
'ASSISTANT_RESPONSE_NOT_FOUND' → DOM structure may have changed, explore via evaluate_script.

After extraction, verify the response matches the sent question's context and is not a stale previous response.

⚠️ **Server Instability**
claude.ai may show toast errors during outages. Symptoms: empty response, or stale previous response extracted.
If suspected, wait before retrying rather than looping immediately.
Spinner cannot be used to judge response status — it is always present on the page even after response completes. Use stop button (aria-label: "응답 중단", "Stop Response", "Stop response") or `[data-is-streaming="true"]` only.

### Error Response Principle

**If the extracted response looks wrong (too short, unexpected content), do not judge based on assumptions alone — take a screenshot or re-read the DOM to confirm the actual state before acting.**

## Artifact Reception

When web Claude generates artifacts (code files etc.), save them locally with **zero context consumption**.

### Chrome Download Path Detection

Determine Chrome's download directory before receiving artifacts:
```
Bash - node -e "const p=require('path'),os=require('os'); const prefs=JSON.parse(require('fs').readFileSync(p.join(os.homedir(),'AppData/Local/Google/Chrome/User Data/Default/Preferences'),'utf8')); console.log(prefs.download?.default_directory || p.join(os.homedir(),'Downloads'))"
```
> macOS: `~/Library/Application Support/Google/Chrome/Default/Preferences`
> Linux: `~/.config/google-chrome/Default/Preferences`

### Check if response contains artifacts (evaluate_script)

- Selectors: `[data-testid*="artifact"]`, `[role="button"]` within the last response
- Extract names from text containing "Download"/"다운로드" (exclude "all"/"모두")
- Return: { count, artifacts: [name strings] }

### Artifact download click (evaluate_script)

- Find card containing artifactName within the last response
- Selectors: `[data-testid*="artifact"]`, `[role="button"]`
- Search for download button INSIDE that card (aria-label or text matching /download|다운로드/i)
- Constraint: search buttons within card only. NEVER use `document.querySelectorAll('button')`
- Validation: if generated code uses `document.querySelectorAll('button')`, it is wrong
- Return: 'downloading <name>' or 'CARD_NOT_FOUND' / 'DL_BTN_NOT_FOUND'

### Download procedure (after clicking download)

1. Wait for download to complete (1-2 seconds):
```
Bash - sleep 2
```

2. Find the latest file in the download folder (Chrome appends `(N)` for duplicates):
```
Bash - ls -t "<download-path>/filename"* | head -1
```

3. Move to the desired location:
```
Bash - mv "<downloaded-file-path>" "<final-destination>"
```

4. Repeat for additional artifacts.

> Notes:
> - Chrome names duplicate downloads as `filename (N).ext`. `ls -t glob | head -1` gets the latest.
> - Responses without artifacts return a card count of 0.
> - "Download" button text varies by UI language (`Download` / `다운로드`).

---

## English Conversation Mode — Token Saving

Conversations with claude.ai: user watching → user's language, automated → append "Answer in English only."
Text shown to the user (CLI output, reports) is always in the user's language.

## Multi-turn Conversations

For discussions/reviews/verification, follow up until a conclusion is reached. If you disagree or have counterarguments, push back with your own opinion. Simple questions need only one round.
Include current situation + what input you need (review/verification/opinion) + your own analysis with specific questions. Do NOT just dump materials and ask "what do you think?"

## Preserving Conclusions

After conversing with claude.ai, record any decisions/discoveries not already in files. Extract conclusions only — do not copy entire conversations.

## Verification Protocol Tag (VERIFICATION_TAG)

When sending a verification request to web Claude, append this tag to the end of the message.

**Tag (paste verbatim at the end of verification request messages):**
```
---
[VERIFICATION PROTOCOL]
After your review, end your response with exactly one of:
⚠️ CORRECTIONS: [N] — fix these and send back for re-verification.
✅ CONFIRMED — no issues found.
---
```

**Usage rules:**
- Append only to verification (VERIFY) messages
- Do NOT append to instruction request (INSTRUCT) messages
- Append independently from `"Answer in English only."` (the English directive goes on all messages separately)

---

## Robustness & Selector Resolution

Scripts resolve UI elements **L1 (exact aria-label) → L2 (bilingual regex)**, never a single hardcoded string. This tolerates label drift, dynamic suffixes (e.g. `"<ts>_<file>.png 제거"`), and EN/KR language with no code change. Preference order: stable anchors (`data-testid`, ARIA role/heading, live-region status) > regex on aria-label/text > structural position. Build-generated CSS classes are never the sole hook (`.font-claude-response` is a *preferred* path with fallback).

Regex the scripts use (one pattern covers both languages):
- Stop button: `/(중단|중지|stop\s*response)/i`
- Send button: `/(보내기|전송|send\s*message)/i`
- File remove: `/(제거|삭제|remove|delete)\s*$/i` — suffix match, handles both `"제거"` and `"<ts>_<file> 제거"`

**Read vs action asymmetry**: extraction (read-only) may fall back to structural scoring (L3) because a wrong pick is caught by post-extraction context verification; sending/removing (actions) stop at L2 and **halt rather than guess**, since a wrong action is hard to undo.

## Verified Selectors

| Component | Resolution | Verified | Notes |
|-----------|-----------|----------|-------|
| Stop button | regex above; L1 exact `"응답 중단"` / `"Stop response"` | 2026-06-25 | also `[data-is-streaming="true"]` |
| File remove | regex above (suffix) | 2026-06-25 | handles `"<ts>_<file> 제거"` dynamic label |
| Send button | regex above; L1 exact `"메시지 보내기"` / `"Send Message"` | 2026-06-25 | poll until present **and** enabled (React render race) |
| Response body | `.font-claude-response` (preferred) → content-bearing sibling of last user-message → structural (L3) | 2026-06-25 | clean text, no sr-only "Claude 응답:" heading |
| User anchor | `[data-testid="user-message"]` | 2026-06-25 | extraction anchor — most critical dependency |

## Self-heal on Unrecoverable Break (L2 fallback also failed)

claude.ai's DOM structure does not change mid-session (the SPA bundle is fixed at page load); a real structural break surfaces at session start / page (re)load — usually while the user is present. So autonomous repair is unnecessary; a confirmed, human-reviewed fix is safer.

1. **Stop using the skill immediately** — do not keep retrying web Claude with a broken selector (avoids cascading errors and token waste).
2. **Report what broke**: the failed action/selector + the actual aria-labels/structure observed in the DOM (scripts return a compact `buttons` list on `SEND_BTN_NOT_FOUND`; gather equivalents for other failures — **never take_snapshot**).
3. **Offer repair paths, let the user choose** (judge the default by task weight):
   - (a) fix now in this session
   - (b) fix via an isolated subagent (only a summary returns → minimal main-context pollution)
   - (c) drop the diagnosis to an `.md` in a temp dir and fix in a fresh session
   - Default: skill still needed → (b)/(a); main task heavy and skill no longer needed → (c)
4. Apply any fix **only after user confirmation**, and **re-verify proposed selectors against the live DOM** — do not blindly trust a prior diagnosis (the DOM may have changed again).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| chrome-devtools MCP disconnected | Reconnect in `/mcp` |
| Input field not found | claude.ai UI updated — search `[contenteditable="true"]` via evaluate_script |
| Cannot read response | `[data-testid="user-message"]` selector changed — re-explore DOM |
| "Server running at: starting…" | MCP client (Claude Code) must invoke a tool for the server to start |
