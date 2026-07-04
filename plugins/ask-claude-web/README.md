[한국어](./README.ko.md)

# ask-claude-web

**No copy-paste — claude.ai and Claude Code talk directly.**

**Latest: v1.8.0** · [Changelog](./CHANGELOG.md)

PEV Loop (Plan → Execute → Verify), Multi-Agent Orchestration —
the key patterns in 2026 AI development all point in one direction:
"AI shouldn't work alone — it should collaborate across specialized roles."
This plugin automates that collaboration between claude.ai and Claude Code.

Send questions, wait for responses, and extract answers via chrome-devtools MCP.
No copy-paste, no extra cost, within your existing subscription.

---

## Why This Plugin?

Many developers already work like this:

1. Write code in **Claude Code**
2. When stuck or need a design review, open **claude.ai** in the browser
3. **Copy-paste** the code or context and ask for input
4. **Copy-paste** web Claude's answer back into Claude Code
5. Repeat

The reasons are clear:
- Claude Code is fast at writing code, but **often goes deep in the wrong direction when working alone**
- claude.ai uses the same model but is **tuned differently**, offering a broader perspective beyond just code (richer web search, Deep Research, Artifacts, and other unique capabilities)
- **Separating planning, execution, and verification dramatically improves output quality** — this is a widely shared consensus in the 2026 dev community (PEV Loop, Spec-Driven Development)

The problem is that **copy-pasting is tedious, exhausting, and eats up your time**.

**This plugin automates that copy-paste for you.**

---

## Background

I was doing the same thing.  
Before starting work in Claude Code, or in the middle of a session,  
whenever a design or code needed a longer discussion,  
I'd open claude.ai and copy-paste back and forth endlessly.

I looked around to see how others were handling this —  
most were just copy-pasting manually (hello, RSI),  
and a few were using the Anthropic API.  
But the API approach costs extra on top of your subscription,  
and since it doesn't actually use claude.ai,  
you lose all of claude.ai's unique strengths.

So I asked AI to build it for me. It said nothing like this exists.  
Apparently, since it's not an established pattern, there was no idea to draw from.  
I decided to just build it myself.  
A plugin that uses chrome-devtools MCP to work with the claude.ai web  
interface directly — automating the endless copy-paste.

---

## Features

- **Automated Conversations (Background-capable)**: Copy-paste, tab-switching — all automated. Doesn't take over your browser.
- **No Screenshots**: A single screenshot costs ~3,000 tokens, but this plugin extracts only
  what's needed directly from the DOM — no screenshots at all (~50 tokens, **98% savings**).
- **File Attachment (0 tokens)**: Via OS clipboard, zero context consumption.
- **Full Response Extraction**: Direct DOM extraction, no length limit.

<details>
<summary><strong>vs. Claude Computer Use (March 2026)</strong></summary>

Computer Use is a newly released Anthropic feature where Claude directly controls
the desktop via mouse and keyboard. It's versatile, but for automating conversations
with claude.ai, this plugin is a better fit:

| | This Plugin | Computer Use |
|-|------------|--------------|
| **Speed** | Direct DOM manipulation (no screenshots/visual recognition needed) | 2-5 sec per action (screenshot → recognize → click) |
| **Platform** | Windows, macOS, Linux | macOS only (Research Preview) |
| **Security** | Single browser tab only | Full OS mouse/keyboard control + entire screen exposed |
| **Accuracy** | Deterministic DOM selectors | Visual recognition (varies with theme/zoom/resolution) |
| **Long responses** | Full text extraction in one call | Visible area only → scroll + stitch needed |
| **Waiting** | Async poller, auto-waits in 1 tool call (free to do other work meanwhile) | Continuous screenshots to check completion |
| **User freedom** | Free to use your computer (including other Chrome tabs) | AI occupies mouse/keyboard, user can't work |
| **Scope** | claude.ai tab only | Entire desktop |
| **Status** | Stable (since v1.0.0) | Research Preview ("still early" — Anthropic) |

</details>

<details>
<summary><strong>Use Cases + Why Same Model, Different Results?</strong></summary>

Tell Claude Code "discuss this with claude.ai" and use it for design review,
second opinions, debugging direction, documentation, and more.
claude.ai's Deep Research and richer web search are also available.

**Same model weights, different system prompts and tool configurations:**

| | claude.ai (web) | Claude Code |
|-|----------------|-------------|
| **Perspective** | Code + broader context together | Focused on code execution |
| **Unique tools** | Web search (direct result summaries), Deep Research, Artifacts | File editing, bash, git, MCP |
| **Context lifespan** | Text conversation → persists longer | Consumed fast by files/bash/diffs |
| **Tendency** | Steps back to see the full picture | Jumps straight into implementation |

Leveraging this difference creates a **Plan → Execute → Verify** loop impossible with a single tool.
Runs entirely within your existing claude.ai subscription — **$0 additional cost**.

> **Language note**: Web Claude's second opinion is especially effective with languages
> where Claude Code's quality drops — TypeScript, Rust, PHP, Kotlin/Swift, and others.

> **Related trends**: **PEV Loop** — Web Claude handles Plan/Verify, Claude Code handles Execute.
> **Multi-Agent Orchestration** — Not role-assigned sub-agents,
> but automated collaboration with a separately tuned, fully realized product (claude.ai).
> **Agentic Engineering** — The next stage after vibe coding, as named by Karpathy.

</details>

---

## Installation

### Requirements

- **Claude Code** v1.0.0 or later (with plugin system support)
- **claude.ai account** — Pro or Max subscription recommended

### 1. Chrome Setup

Launch Chrome manually → navigate to `chrome://inspect/#remote-debugging` → check **"Allow remote debugging for this browser instance"**

### 2. Install the Plugin

```bash
/plugin marketplace add codedby-kr/codedby-claude-box
/plugin install ask-claude-web@codedby-claude-box
```

### 3. Install chrome-devtools MCP

```bash
/ask-claude-web:setup
```

This detects your OS and installs the chrome-devtools MCP server automatically.

<details>
<summary>Manual MCP setup (advanced)</summary>

If you prefer to configure chrome-devtools manually:

**macOS / Linux:**
```bash
claude mcp add chrome-devtools -s user -- npx -y chrome-devtools-mcp@latest --autoConnect
```

**Windows:**
```bash
claude mcp add-json chrome-devtools '{"type":"stdio","command":"cmd","args":["/c","npx","-y","chrome-devtools-mcp@latest","--autoConnect"]}' -s user
```

</details>

Verify: `/mcp` → `chrome-devtools · ✔ connected`

### 4. Open claude.ai

Open [claude.ai](https://claude.ai) in Chrome and log in. On first connection, click **"Allow"** on Chrome's permission dialog.

### Updating

```
/ask-claude-web:update
```

This pulls the latest version, clears cache, and updates the plugin automatically.
After it finishes, type `/reload-plugins` or restart Claude Code to apply.

<details>
<summary>Manual update</summary>

```bash
git -C ~/.claude/plugins/marketplaces/codedby-claude-box pull origin main
rm -rf ~/.claude/plugins/cache/codedby-claude-box/ask-claude-web/
claude plugin update ask-claude-web@codedby-claude-box -s user
```

Then type `/reload-plugins` or restart Claude Code.

> PowerShell users: replace `~` with `$HOME` in the commands above.

</details>

---

## Usage

- `"ask claude.ai [your question]"` / `"claude.ai와 의논해"`
- `"let claude.ai handle this"` / `"claude.ai한테 해결해달라고 해"`
- `"claude.ai would know this better"` / `"이건 claude.ai가 더 잘 알 거야"`

File attachment: `"attach main.py and ask claude.ai to review it"`

### Commands

| Command | Description |
|---------|-------------|
| `/ask-claude-web:execute-loop-doc` | Execute a documented work plan item by item. Web Claude acts as manager — gives instructions, reviews results, requests corrections. Supports standalone mode (self-verify only). |
| `/ask-claude-web:execute-loop-msg` | Same loop execution, but builds the work plan from your message instead of a document. |

```
/ask-claude-web:execute-loop-doc "path/to/plan.md" web claude verify
/ask-claude-web:execute-loop-msg refactor auth module, web claude verify
```

<details>
<summary><strong>Platform Support</strong></summary>

| Platform | Chat | File Attachment | Status |
|----------|------|----------------|--------|
| **Windows** | ✅ Full | ✅ Full (PowerShell + clipboard) | **Tested** |
| **macOS** | ✅ Full | ⚠️ Experimental (osascript) | Untested |
| **Linux** | ✅ Full | ⚠️ Experimental (xclip) | Untested |

Chat works on all platforms (browser DOM). File attachment depends on OS clipboard APIs.
Linux: `sudo apt install xclip` required.

</details>

<details>
<summary><strong>Limitations</strong></summary>

- **DOM Dependency**: claude.ai UI updates may break selectors. Selectors resolve **L1 (exact aria-label) → L2 (bilingual regex)** to absorb label/language drift; if that still fails, the skill **halts, reports a diagnosis, and applies a user-confirmed fix** (no blind autonomous edits).
- **Manual Chrome Setup**: Remote debugging must be enabled manually.
- **Session Permission**: Chrome permission dialog appears once per session.
- **Chrome Window Required**: Chrome must be running — headless (GUI-less background) mode is not supported. (Working in other tabs or having the Chrome window behind other windows is fine)
- **claude.ai Message Quota**: Automated conversations count against your subscription limit.

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

| Issue | Solution |
|-------|----------|
| MCP disconnected | Run `/mcp` and reconnect chrome-devtools |
| Input field not found | claude.ai UI updated — skill attempts fallback selectors |
| Response extraction fails | DOM structure changed — check verified selectors table |
| Chrome permission dialog appears | Shows once per session — click "Allow" and it won't appear again until the session ends |
| Connection timeout | Verify `chrome://inspect/#remote-debugging` is enabled |

</details>

<details>
<summary><strong>How It Works</strong></summary>

```
Claude Code ──evaluate_script──▶ Chrome DevTools Protocol ──DOM──▶ claude.ai tab
     ▲                                                                  │
     └──────────────── extracted response text ◀────────────────────────┘
```

1. Executes JavaScript in the claude.ai tab via `chrome-devtools MCP`
2. Finds input field, types question → presses Enter
3. Detects streaming completion (stop button / data-is-streaming attribute)
4. Extracts the assistant's response via DOM traversal

</details>

---


## Disclaimer

This plugin modifies Claude Code's behavior through hooks, skills, and commands. It is provided as-is with no warranty. Use at your own risk. The author is not responsible for any data loss, configuration corruption, or unintended behavior resulting from its use. Always back up important files before installing or updating plugins that interact with system configuration.

## License

MIT — See [LICENSE](../../LICENSE)

> This plugin uses [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp) for browser communication.
