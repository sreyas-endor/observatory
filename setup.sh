#!/usr/bin/env bash
# Observatory setup script
# Installs hooks for Claude Code and Cursor to report to Observatory

set -euo pipefail

CLAUDE_HOOK_URL="http://localhost:7337/hook/claude"
CURSOR_HOOK_URL="http://localhost:7337/hook/cursor"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
CURSOR_HOOKS="$HOME/.cursor/hooks.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Observatory Setup Script         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Claude Code hooks ──────────────────────────────────────────────────────────

echo -e "${YELLOW}Setting up Claude Code hooks...${NC}"

mkdir -p "$(dirname "$CLAUDE_SETTINGS")"

# Build the hook entry using python3 for safe JSON merging
python3 - "$CLAUDE_SETTINGS" "$CLAUDE_HOOK_URL" <<'PYEOF'
import sys
import json
import os

settings_path = sys.argv[1]
hook_url = sys.argv[2]

# Load existing or start fresh
if os.path.exists(settings_path):
    try:
        with open(settings_path, 'r') as f:
            settings = json.load(f)
    except (json.JSONDecodeError, IOError):
        settings = {}
else:
    settings = {}

if not isinstance(settings, dict):
    settings = {}

if 'hooks' not in settings:
    settings['hooks'] = {}

hooks = settings['hooks']

hook_events = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'UserPromptSubmit',
]

hook_group = {
    "matcher": "",
    "hooks": [{"type": "http", "url": hook_url, "description": "Observatory: report agent state"}]
}

added = []
skipped = []

for event in hook_events:
    if event not in hooks:
        hooks[event] = []

    # Check if our hook URL is already present (in nested hooks array)
    already_present = any(
        isinstance(h, dict) and any(
            isinstance(inner, dict) and hook_url in inner.get('url', '')
            for inner in h.get('hooks', [])
        )
        for h in hooks[event]
    )

    if already_present:
        skipped.append(event)
    else:
        hooks[event].append(hook_group)
        added.append(event)

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

if added:
    print(f"  Added hooks for: {', '.join(added)}")
if skipped:
    print(f"  Already present for: {', '.join(skipped)}")
PYEOF

echo -e "  ${GREEN}✓ Claude Code hooks written to $CLAUDE_SETTINGS${NC}"

# ── Cursor hooks ───────────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}Setting up Cursor hooks...${NC}"

mkdir -p "$(dirname "$CURSOR_HOOKS")"

python3 - "$CURSOR_HOOKS" "$CURSOR_HOOK_URL" <<'PYEOF'
import sys
import json
import os

hooks_path = sys.argv[1]
hook_url = sys.argv[2]

# Load existing or start fresh
if os.path.exists(hooks_path):
    try:
        with open(hooks_path, 'r') as f:
            hooks = json.load(f)
    except (json.JSONDecodeError, IOError):
        hooks = {}
else:
    hooks = {}

if not isinstance(hooks, dict):
    hooks = {}

cursor_events = [
    'preToolUse',
    'postToolUse',
    'beforeReadFile',
    'afterFileEdit',
    'beforeShellExecution',
    'beforeMCPExecution',
    'beforeSubmitPrompt',
    'stop',
]

curl_command = f"curl -s -X POST -H 'Content-Type: application/json' -d @- {hook_url}"

added = []
skipped = []

for event in cursor_events:
    if event not in hooks:
        hooks[event] = []

    # Check if our hook URL is already present
    already_present = any(
        (isinstance(h, dict) and hook_url in h.get('command', ''))
        or (isinstance(h, str) and hook_url in h)
        for h in hooks[event]
    )

    if already_present:
        skipped.append(event)
    else:
        hooks[event].append({
            "command": curl_command,
            "description": "Observatory: report agent state"
        })
        added.append(event)

with open(hooks_path, 'w') as f:
    json.dump(hooks, f, indent=2)
    f.write('\n')

if added:
    print(f"  Added hooks for: {', '.join(added)}")
if skipped:
    print(f"  Already present for: {', '.join(skipped)}")
PYEOF

echo -e "  ${GREEN}✓ Cursor hooks written to $CURSOR_HOOKS${NC}"

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "  Claude Code settings: $CLAUDE_SETTINGS"
echo "  Cursor hooks:         $CURSOR_HOOKS"
echo ""
echo "  Hook endpoints:"
echo "    $CLAUDE_HOOK_URL"
echo "    $CURSOR_HOOK_URL"
echo ""
echo -e "${YELLOW}Run 'bun run dev' in the observatory directory to start${NC}"
echo ""
