# Observatory

Inspired by [Pixel Agents](https://github.com/anthropics/pixel-agents) — this project wouldn't have been possible without it.

~~I coded~~ Claude coded a real-time dashboard that visualizes what your AI coding agents are doing across multiple terminals. Watch Claude Code, Cursor, Copilot CLI, and Gemini CLI sessions side by side — see when they're thinking, reading files, editing code, or waiting for input.

Web-based. No desktop app needed.



https://github.com/user-attachments/assets/218d64fc-eeb7-44dc-8cad-46de2e3b0d6d



## Features

- **Live agent visualization** — pixel-art characters represent each agent session, with real-time state animations (thinking, reading, editing, running, idle)
- **Multi-agent support** — Claude Code, Cursor, Copilot CLI, and Gemini CLI, each color-coded by agent type
- **Built-in terminal** — click the `+` button or any character to open an embedded xterm.js terminal. Spawn Claude Code sessions directly from Observatory
- **File viewer** — Cmd+P command palette with fuzzy search, CodeMirror 6 editor with syntax highlighting, autosave, and preview/pinned tabs
- **Terminal file links** — file paths in terminal output are detected and underlined. Cmd+Click opens them in the file viewer
- **Reconnect on reload** — terminals persist across page refreshes with output replay

> **Note:** Hook integrations exist for Claude Code, Cursor, Copilot CLI, and Gemini CLI, but **only Claude Code has been thoroughly tested**. Other CLIs should work but may have edge cases.

## Prerequisites

- **Node.js 18+** (for the hook script)
- **Bun** (runtime for the server)

## Quick Start

```bash
git clone <repo-url> observatory
cd observatory
bun install
node setup.js    # auto-detects installed CLIs and configures hooks
bun run dev      # starts server at http://localhost:7337
```

Open `http://localhost:7337` in your browser.

> **AI agents:** See [AGENTS.md](AGENTS.md) for machine-readable setup instructions your agent can follow directly.

---

## How It Works

Observatory uses **hooks** — a feature supported by most AI coding CLIs. When your CLI executes a tool (reads a file, runs a command, edits code), the hook fires a lightweight POST request to Observatory's server. The server maps these events to visual states on the dashboard.

```
CLI (Claude/Cursor/Copilot/Gemini)
  |
  |-- hook fires on tool use
  |-- stdin JSON piped to observatory-hook.js
  |
  v
observatory-hook.js (tags source, POSTs to server)
  |
  v
Observatory server (:7337)
  |
  v
Dashboard (WebSocket push to browser)
```

### Supported States

| State | Meaning |
|---|---|
| **thinking** | Agent is planning its next action |
| **reading** | Reading files, searching code |
| **editing** | Writing or modifying files |
| **running** | Executing shell commands |
| **mcp** | Calling MCP tools |
| **input** | Waiting for user response |
| **waiting** | Idle, ready for next prompt |

---

## Setup

### Automatic Setup

```bash
node setup.js
```

This auto-detects which CLIs you have installed (by checking for `~/.claude/`, `~/.cursor/`, `~/.gemini/`) and writes the correct hook configuration for each. Safe to run multiple times — it won't duplicate hooks.

### Manual Setup

If you prefer to configure hooks yourself, or if the auto-setup doesn't cover your needs.

#### Claude Code

Add to `~/.claude/settings.json` (macOS/Linux) or `%USERPROFILE%\.claude\settings.json` (Windows):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/observatory/observatory-hook.js claude"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/observatory/observatory-hook.js claude"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/observatory/observatory-hook.js claude"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/observatory/observatory-hook.js claude"
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/observatory` with the actual path where you cloned the repo.

#### Cursor

Add to `~/.cursor/hooks.json` (macOS/Linux) or `%USERPROFILE%\.cursor\hooks.json` (Windows):

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      { "command": "node /path/to/observatory/observatory-hook.js cursor" }
    ],
    "beforeReadFile": [
      { "command": "node /path/to/observatory/observatory-hook.js cursor" }
    ],
    "afterFileEdit": [
      { "command": "node /path/to/observatory/observatory-hook.js cursor" }
    ],
    "beforeMCPExecution": [
      { "command": "node /path/to/observatory/observatory-hook.js cursor" }
    ],
    "stop": [
      { "command": "node /path/to/observatory/observatory-hook.js cursor" }
    ]
  }
}
```

#### Gemini CLI

Add to `~/.gemini/settings.json` (macOS/Linux) or `%USERPROFILE%\.gemini\settings.json` (Windows):

```json
{
  "hooks": {
    "BeforeTool": [
      { "command": "node /path/to/observatory/observatory-hook.js gemini", "matcher": ".*" }
    ],
    "AfterTool": [
      { "command": "node /path/to/observatory/observatory-hook.js gemini", "matcher": ".*" }
    ],
    "UserPromptSubmit": [
      { "command": "node /path/to/observatory/observatory-hook.js gemini" }
    ],
    "SessionEnd": [
      { "command": "node /path/to/observatory/observatory-hook.js gemini" }
    ]
  }
}
```

#### GitHub Copilot CLI

Copilot uses **project-level hooks only** — there's no global config. Add `.github/hooks/observatory.json` to each project:

```json
{
  "preToolUse": [
    { "bash": "node /path/to/observatory/observatory-hook.js copilot" }
  ],
  "postToolUse": [
    { "bash": "node /path/to/observatory/observatory-hook.js copilot" }
  ],
  "userPromptSubmitted": [
    { "bash": "node /path/to/observatory/observatory-hook.js copilot" }
  ],
  "sessionEnd": [
    { "bash": "node /path/to/observatory/observatory-hook.js copilot" }
  ]
}
```

---

## File Path Instructions

For Observatory's file viewer to work well, your AI agent should output full file paths (not just filenames). Add this instruction to your CLI's rules file:

| CLI | File | Scope |
|---|---|---|
| Claude Code | `CLAUDE.md` or `~/.claude/CLAUDE.md` | project or global |
| Gemini CLI | `GEMINI.md` or `~/.gemini/GEMINI.md` | project or global |
| Copilot CLI | `.github/copilot-instructions.md` | project |
| Cursor | `.cursor/rules/observatory.mdc` | project |

```markdown
When referencing files, always use the full relative path from the project root with a line number: `path/to/file.ts:42`. Never use just the filename.
```

---

## Running

```bash
bun run dev
```

Opens at `http://localhost:7337`. The dashboard auto-connects via WebSocket and shows all active agent sessions in real time.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OBSERVATORY_PORT` | `7337` | Server port (also used by the hook script) |

---

## Architecture

```
observatory/
  observatory-hook.js    # Universal hook script (Claude/Cursor/Copilot/Gemini)
  setup.js               # Cross-platform auto-setup (Node.js)
  server/
    index.ts             # Bun HTTP + WebSocket server
    hooks.ts             # Per-CLI payload normalizers + state mapping
    sessions.ts          # Session lifecycle (create, update, prune)
    terminals.ts         # PTY terminal management
    broadcast.ts         # WebSocket broadcasting to dashboard
    state.ts             # In-memory data stores
    types.ts             # TypeScript types
    static.ts            # Static file serving
  public/
    index.html           # Dashboard UI
    game.js              # Main dashboard logic
    styles.css           # Styles
```

### Hook Endpoints

| Endpoint | CLI |
|---|---|
| `POST /hook/claude` | Claude Code |
| `POST /hook/cursor` | Cursor |
| `POST /hook/copilot` | GitHub Copilot CLI |
| `POST /hook/gemini` | Google Gemini CLI |

---

## Known Limitations

- **Cursor**: No hook fires when the agent asks the user a question (`AskQuestion` tool) — the "input" state won't display. This is a [known Cursor bug](https://forum.cursor.com/t/askquestion-tool-does-not-trigger-cursor-hooks/152230).
- **Gemini CLI**: The `ask_user` hook fires after the user has already answered, not before. [Open issue](https://github.com/google-gemini/gemini-cli/issues/20605).
- **Copilot CLI**: No global hooks — must be configured per-project.
- **Codex CLI**: Not supported yet (all tools report as `Bash`, no granularity).
