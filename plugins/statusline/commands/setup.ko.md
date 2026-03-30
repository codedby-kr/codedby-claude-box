---
description: Set up statusline HUD (copies script + configures settings.json)
allowed-tools: Bash(node:*)
---

statusline HUD를 설정한다:
1. statusline.mjs를 플러그인 캐시 밖의 안정 경로에 복사
2. ~/.claude/settings.json에 등록

## 절차

### 1단계: statusline.mjs를 안정 경로에 복사

플러그인 캐시는 업데이트 시 초기화될 수 있으므로 `~/.claude-box/statusline/statusline.mjs`에 복사한다.

`${CLAUDE_PLUGIN_ROOT}`로 소스 파일을 찾는다 — 이 환경변수는 플러그인 커맨드 실행 시 Claude Code가 설정한다.

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  console.error('ERROR: CLAUDE_PLUGIN_ROOT not set. Run this command via /statusline:setup.');
  process.exit(1);
}

const srcFile = path.join(pluginRoot, 'hud', 'statusline.mjs');
if (!fs.existsSync(srcFile)) {
  console.error('ERROR: statusline.mjs not found at ' + srcFile);
  process.exit(1);
}

const destDir = path.join(os.homedir(), '.claude-box', 'statusline');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, 'statusline.mjs');
fs.copyFileSync(srcFile, dest);
console.log('Copied statusline.mjs to ' + dest);
"
```

### 2단계: settings.json에 등록

**중요: JSON 깨짐 방지를 위해 반드시 원자적 읽기-수정-쓰기를 사용한다.**

statusLine이 이미 설정되어 있으면 사용자에게 경고하고 덮어쓰기 전에 확인을 받는다. 동의 없이 덮어쓰지 않는다.

```bash
node -e "
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

if (settings.statusLine) {
  console.log('WARNING: statusLine is already configured:');
  console.log(JSON.stringify(settings.statusLine, null, 2));
  process.exit(0);
}

const slPath = path.join(os.homedir(), '.claude-box', 'statusline', 'statusline.mjs');
settings.statusLine = {
  type: 'command',
  command: 'node ' + slPath,
  padding: 0
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('statusLine registered in settings.json');
"
```

statusLine이 이미 설정되어 있으면 현재 설정 내용을 보여주고 덮어쓸지 확인한다. 확인하면 위 스크립트에서 `if (settings.statusLine)` 체크를 제거하고 다시 실행한다.

### 3단계: 확인

사용자에게 안내: "설정 완료. Claude Code를 재시작하거나 새 세션을 시작하면 상태 바가 표시됩니다."
