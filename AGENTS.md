# Observatory — Agent Setup Instructions

These instructions are designed for AI coding agents to follow directly. If you are an AI agent and a user asks you to "set up Observatory", follow the steps below for the CLI you are running in.

## Prerequisites

- Node.js 18+ must be installed
- Bun must be installed (`curl -fsSL https://bun.sh/install | bash`)
- The Observatory repo must be cloned locally

## Step 1: Install Dependencies

```bash
cd /path/to/observatory
bun install
```

## Step 2: Run Auto-Setup

```bash
node /path/to/observatory/setup.js
```

This detects installed CLIs and configures hooks automatically. If you prefer manual setup, continue to Step 2b.

## Step 2b: Manual Hook Configuration

Pick the section for your CLI. Replace `/path/to/observatory` with the actual absolute path to the observatory directory.

### Claude Code

Read `~/.claude/settings.json`. Add these entries under `hooks` (merge with existing hooks, don't overwrite):

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /path/to/observatory/observatory-hook.js claude" }] }],
    "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /path/to/observatory/observatory-hook.js claude" }] }],
    "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /path/to/observatory/observatory-hook.js claude" }] }],
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node /path/to/observatory/observatory-hook.js claude" }] }]
  }
}
```

Config path: `~/.claude/settings.json` (all platforms, `%USERPROFILE%\.claude\settings.json` on Windows).

### Cursor

Read `~/.cursor/hooks.json`. Create it if it doesn't exist. The file uses a `{ version: 1, hooks: { ... } }` wrapper:

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [{ "command": "node /path/to/observatory/observatory-hook.js cursor" }],
    "beforeReadFile": [{ "command": "node /path/to/observatory/observatory-hook.js cursor" }],
    "afterFileEdit": [{ "command": "node /path/to/observatory/observatory-hook.js cursor" }],
    "beforeMCPExecution": [{ "command": "node /path/to/observatory/observatory-hook.js cursor" }],
    "stop": [{ "command": "node /path/to/observatory/observatory-hook.js cursor" }]
  }
}
```

Config path: `~/.cursor/hooks.json` (all platforms, `%USERPROFILE%\.cursor\hooks.json` on Windows).

### Gemini CLI

Read `~/.gemini/settings.json`. Add under `hooks`:

```json
{
  "hooks": {
    "BeforeTool": [{ "command": "node /path/to/observatory/observatory-hook.js gemini", "matcher": ".*" }],
    "AfterTool": [{ "command": "node /path/to/observatory/observatory-hook.js gemini", "matcher": ".*" }],
    "UserPromptSubmit": [{ "command": "node /path/to/observatory/observatory-hook.js gemini" }],
    "SessionEnd": [{ "command": "node /path/to/observatory/observatory-hook.js gemini" }]
  }
}
```

Config path: `~/.gemini/settings.json` (all platforms, `%USERPROFILE%\.gemini\settings.json` on Windows).

### GitHub Copilot CLI

Copilot uses project-level hooks only. Create `.github/hooks/observatory.json` in the project root:

```json
{
  "preToolUse": [{ "bash": "node /path/to/observatory/observatory-hook.js copilot" }],
  "postToolUse": [{ "bash": "node /path/to/observatory/observatory-hook.js copilot" }],
  "userPromptSubmitted": [{ "bash": "node /path/to/observatory/observatory-hook.js copilot" }],
  "sessionEnd": [{ "bash": "node /path/to/observatory/observatory-hook.js copilot" }]
}
```

## Step 3: Add File Path Rules

Add this instruction to your CLI's rules file so file references include full paths:

> When referencing files, always use the full relative path from the project root with a line number: `path/to/file.ts:42`. Never use just the filename.

| CLI | Rules file |
|---|---|
| Claude Code | `CLAUDE.md` (project root) or `~/.claude/CLAUDE.md` (global) |
| Cursor | `.cursor/rules/observatory.mdc` (project-level only) |
| Copilot CLI | `.github/copilot-instructions.md` |
| Gemini CLI | `GEMINI.md` (project root) or `~/.gemini/GEMINI.md` (global) |

## Step 4: Start the Server

```bash
cd /path/to/observatory
bun run dev
```

The dashboard is at `http://localhost:7337`.

## Step 5: Verify

Send a test hook to confirm the server is receiving events:

```bash
curl -s -X POST http://localhost:7337/hook/claude \
  -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"PreToolUse","tool_name":"Read","session_id":"test"}'
```

A 200 response with `{}` means it's working.

## Troubleshooting

- **Hook not firing**: Check that the path to `observatory-hook.js` in your config is an absolute path and the file exists.
- **Server not running**: The hook script silently ignores connection failures (2-second timeout). Start the server with `bun run dev`.
- **Duplicate hooks**: Run `node setup.js` again — it's idempotent and won't duplicate entries.
- **Wrong path on Windows**: Use forward slashes in JSON configs (`C:/Users/name/observatory/observatory-hook.js`) or escaped backslashes (`C:\\Users\\name\\...`).
