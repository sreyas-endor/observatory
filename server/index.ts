import { serve, file, spawn } from "bun";
import { join, extname, basename } from "path";

// ── Types ──────────────────────────────────────────────────────────────────

type SessionState =
  | "idle"
  | "waiting"
  | "reading"
  | "editing"
  | "running"
  | "thinking"
  | "error"
  | "mcp"
  | "input";  // blocked mid-task waiting for user answer (AskUserQuestion)

interface Session {
  id: string;
  type: "claude" | "cursor";
  cwd: string;
  state: SessionState;
  lastSeen: number;
  startedAt: number;
  stateChangedAt: number;
  terminalId?: string;
}

// ── Types (log) ────────────────────────────────────────────────────────────

interface LogEntry {
  ts: number;
  kind: "prompt" | "thinking" | "read" | "edit" | "bash" | "mcp" | "input" | "done" | "error";
  detail?: string;
}

// ── State ──────────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();
const wsClients = new Set<import("bun").ServerWebSocket<unknown>>();
const sessionLogs = new Map<string, LogEntry[]>();
const MAX_LOG_ENTRIES = 300;

// ── Terminal PTY state ────────────────────────────────────────────────────

interface Terminal {
  id: string;
  cwd: string;
  proc: import("bun").Subprocess;
  subscribers: Set<import("bun").ServerWebSocket<unknown>>;
  outputBuffer: string[];  // ring buffer of recent output chunks for replay
}

const terminals = new Map<string, Terminal>();
const claudeToTerminal = new Map<string, string>(); // claude session_id → terminalId
let terminalIdCounter = 0;
const MAX_OUTPUT_BUFFER = 500; // max chunks to keep for replay

const PTY_HELPER = join(import.meta.dir, "pty-helper.js");

function spawnTerminal(cwd?: string): Terminal {
  const id = `term-${++terminalIdCounter}-${Date.now()}`;
  const workDir = cwd || process.env.HOME || "/";

  const proc = spawn(["node", PTY_HELPER, "120", "30", workDir, id], {
    cwd: workDir,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const term: Terminal = { id, cwd: workDir, proc, subscribers: new Set(), outputBuffer: [] };
  terminals.set(id, term);

  // Read newline-delimited JSON from the helper's stdout
  const reader = proc.stdout.getReader();
  let buffer = "";

  (async () => {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          try {
            const msg = JSON.parse(line);
            if (msg.type === "output") {
              // Buffer for replay on reconnect
              term.outputBuffer.push(msg.data);
              if (term.outputBuffer.length > MAX_OUTPUT_BUFFER) {
                term.outputBuffer.splice(0, term.outputBuffer.length - MAX_OUTPUT_BUFFER);
              }
              const payload = JSON.stringify({ type: "terminal_output", terminalId: id, data: msg.data });
              for (const ws of term.subscribers) {
                try { ws.send(payload); } catch { term.subscribers.delete(ws); }
              }
            } else if (msg.type === "exit") {
              const payload = JSON.stringify({ type: "terminal_exit", terminalId: id, exitCode: msg.exitCode });
              for (const ws of term.subscribers) {
                try { ws.send(payload); } catch {}
              }
              terminals.delete(id);
              // Clean up claude→terminal mapping
              for (const [cid, tid] of claudeToTerminal) { if (tid === id) claudeToTerminal.delete(cid); }
              // Remove session so character disappears
              sessions.delete(id);
              sessionLogs.delete(id);
              broadcastSessions();
              console.log(`[terminal] ${id} exited (code=${msg.exitCode})`);
            }
          } catch {}
        }
      }
    } catch {}
  })();

  console.log(`[terminal] spawned ${id} (pid=${proc.pid})`);
  return term;
}

function sendToHelper(term: Terminal, msg: unknown) {
  try {
    term.proc.stdin.write(new TextEncoder().encode(JSON.stringify(msg) + "\n"));
  } catch {}
}

function resizeTerminal(id: string, cols: number, rows: number) {
  const term = terminals.get(id);
  if (term) sendToHelper(term, { type: "resize", cols, rows });
}

function writeTerminal(id: string, data: string) {
  const term = terminals.get(id);
  if (term) sendToHelper(term, { type: "input", data });
}

function killTerminal(id: string) {
  const term = terminals.get(id);
  if (term) {
    sendToHelper(term, { type: "kill" });
    term.proc.kill();
    terminals.delete(id);
    for (const [cid, tid] of claudeToTerminal) { if (tid === id) claudeToTerminal.delete(cid); }
    console.log(`[terminal] killed ${id}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function broadcast(payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

function broadcastSessions() {
  broadcast({ type: "sessions", data: Array.from(sessions.values()) });
}

function appendLog(sessionId: string, entry: LogEntry) {
  let log = sessionLogs.get(sessionId);
  if (!log) { log = []; sessionLogs.set(sessionId, log); }
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
  broadcast({ type: "log_append", sessionId, entry });
}

function pruneStale() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  let pruned = false;
  for (const [id, session] of sessions) {
    // Don't prune if a terminal is still alive for this session
    if (terminals.has(id)) continue;
    if (session.lastSeen < cutoff) {
      sessions.delete(id);
      sessionLogs.delete(id);
      pruned = true;
    }
  }
  if (pruned) broadcastSessions();
}

function upsertSession(
  id: string,
  type: "claude" | "cursor",
  cwd: string,
  state: SessionState
) {
  const existing = sessions.get(id);
  const now = Date.now();
  const stateChanged = existing?.state !== state;
  sessions.set(id, {
    id,
    type,
    cwd,
    state,
    lastSeen: now,
    startedAt: existing?.startedAt ?? now,
    stateChangedAt: stateChanged ? now : (existing?.stateChangedAt ?? now),
  });
  broadcastSessions();
}

// ── Claude hook handler (for Observatory-launched terminals) ───────────────

function handleClaudeHookForTerminal(body: Record<string, unknown>) {
  const hookEvent = (body.hook_event_name ?? body.event ?? "") as string;
  const cwd = (body.cwd ?? body.working_directory ?? "") as string;
  const claudeSessionId = (body.session_id ?? "") as string;
  const observatoryTerminalId = (body.observatory_terminal_id ?? "") as string;
  const toolName = (
    (body.tool_name as string) ??
    ((body.tool_input as Record<string, unknown>)?.tool_name as string) ??
    ""
  ).toLowerCase();

  // Resolve terminal id: use env-injected id, or look up from prior mapping
  let terminalId = observatoryTerminalId || (claudeSessionId ? claudeToTerminal.get(claudeSessionId) : "");
  if (!terminalId || !terminals.has(terminalId)) return; // not from an Observatory terminal

  // Establish claude session → terminal mapping on first hook
  if (claudeSessionId && !claudeToTerminal.has(claudeSessionId)) {
    claudeToTerminal.set(claudeSessionId, terminalId);
    console.log(`[hook] linked claude session ${claudeSessionId} → terminal ${terminalId}`);
  }

  // Create Observatory session on first hook (character appears when Claude starts)
  let session = sessions.get(terminalId);
  if (!session) {
    upsertSession(terminalId, "claude", cwd, "thinking");
    session = sessions.get(terminalId)!;
    session.terminalId = terminalId;
  }

  let state: SessionState = session.state;

  if (hookEvent === "UserPromptSubmit") {
    state = "thinking";
  } else if (hookEvent === "PreToolUse") {
    if (/^askuserquestion$/i.test(toolName)) {
      state = "input";
    } else if (/^(read|grep|glob)/i.test(toolName)) {
      state = "reading";
    } else if (/^(edit|write|multiedit)/i.test(toolName)) {
      state = "editing";
    } else if (/^bash/i.test(toolName)) {
      state = "running";
    } else if (/mcp/i.test(toolName)) {
      state = "mcp";
    } else {
      state = "thinking";
    }
  } else if (hookEvent === "PostToolUse") {
    state = "thinking";
  } else if (hookEvent === "Stop") {
    state = "waiting";
  }

  upsertSession(terminalId, "claude", cwd, state);
  const s = sessions.get(terminalId);
  if (s) s.terminalId = terminalId;

  // ── Append log entry ───────────────────────────────────────────────────
  const toolInput = body.tool_input as Record<string, unknown> | undefined;
  if (hookEvent === "UserPromptSubmit") {
    appendLog(terminalId, { ts: Date.now(), kind: "prompt" });
  } else if (hookEvent === "PreToolUse") {
    if (/^askuserquestion$/i.test(toolName)) {
      const q = toolInput?.question as string | undefined;
      appendLog(terminalId, { ts: Date.now(), kind: "input", detail: q ? q.slice(0, 80) : undefined });
    } else if (/^(read|grep|glob)/i.test(toolName)) {
      const p = (toolInput?.file_path ?? toolInput?.path ?? toolInput?.pattern) as string | undefined;
      appendLog(terminalId, { ts: Date.now(), kind: "read", detail: p ? basename(p) : toolName });
    } else if (/^(edit|write|multiedit)/i.test(toolName)) {
      const p = toolInput?.file_path as string | undefined;
      appendLog(terminalId, { ts: Date.now(), kind: "edit", detail: p ? basename(p) : toolName });
    } else if (/^bash/i.test(toolName)) {
      const cmd = toolInput?.command as string | undefined;
      appendLog(terminalId, { ts: Date.now(), kind: "bash", detail: cmd ? cmd.slice(0, 60) : undefined });
    } else if (/mcp/i.test(toolName)) {
      appendLog(terminalId, { ts: Date.now(), kind: "mcp", detail: toolName });
    } else {
      appendLog(terminalId, { ts: Date.now(), kind: "thinking" });
    }
  } else if (hookEvent === "PostToolUse") {
    // No log for PostToolUse — it's a transition state
  }
}

// ── Static file serving ────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const PUBLIC_DIR = join(import.meta.dir, "..", "public");

async function serveStatic(pathname: string): Promise<Response> {
  // Default to index.html
  const clean = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(PUBLIC_DIR, clean);

  try {
    const f = file(filePath);
    const exists = await f.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }
    const ext = extname(filePath);
    const contentType = MIME[ext] ?? "application/octet-stream";
    return new Response(f, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

// ── Read request body as JSON ──────────────────────────────────────────────

async function readJSON(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = serve({
  port: 7337,

  fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // WebSocket upgrade — main dashboard
    if (pathname === "/ws") {
      const upgraded = server.upgrade(req, { data: { kind: "dashboard" } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // WebSocket upgrade — terminal I/O
    if (pathname === "/ws/terminal") {
      const terminalId = url.searchParams.get("id");
      if (!terminalId || !terminals.has(terminalId)) {
        return new Response("Unknown terminal", { status: 404 });
      }
      const upgraded = server.upgrade(req, { data: { kind: "terminal", terminalId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Spawn a new terminal — returns { terminalId, sessionId }
    if (req.method === "POST" && pathname === "/api/terminal/spawn") {
      return readJSON(req).then((body) => {
        const cwd = (body.cwd as string) || undefined;
        const term = spawnTerminal(cwd);
        // Don't create a session yet — character appears when Claude CLI hooks fire.
        // Just return the terminal id so the client can open the tab.
        return new Response(JSON.stringify({ terminalId: term.id }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    // Register an external terminal (e.g. Tauri Rust PTY) so hooks can track it
    if (req.method === "POST" && pathname === "/api/terminal/register") {
      return readJSON(req).then((body) => {
        const id = body.terminalId as string;
        const cwd = (body.cwd as string) || process.env.HOME || "/";
        if (id && !terminals.has(id)) {
          terminals.set(id, {
            id,
            cwd,
            proc: null as any, // no subprocess — managed externally
            subscribers: new Set(),
            outputBuffer: [],
          });
          console.log(`[terminal] registered external terminal ${id}`);
        }
        return new Response(JSON.stringify({ terminalId: id }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    // Kill a terminal
    if (req.method === "POST" && pathname === "/api/terminal/kill") {
      return readJSON(req).then((body) => {
        const id = body.terminalId as string;
        if (id) {
          killTerminal(id);
          // Remove the session so the character disappears
          sessions.delete(id);
          sessionLogs.delete(id);
          broadcastSessions();
        }
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    // Hook endpoints — process hooks but only update existing terminal sessions
    if (req.method === "POST" && pathname === "/hook/claude") {
      return readJSON(req).then((body) => {
        handleClaudeHookForTerminal(body);
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    // Static files
    return serveStatic(pathname);
  },

  websocket: {
    open(ws) {
      const meta = ws.data as { kind: string; terminalId?: string };

      if (meta.kind === "terminal") {
        // Subscribe to terminal output
        const term = terminals.get(meta.terminalId!);
        if (term) {
          term.subscribers.add(ws);
          // Replay buffered output so reconnecting clients see the current screen
          if (term.outputBuffer.length > 0) {
            const replay = term.outputBuffer.join("");
            ws.send(JSON.stringify({ type: "terminal_output", terminalId: term.id, data: replay }));
          }
          // Send a ready signal
          ws.send(JSON.stringify({ type: "terminal_ready", terminalId: term.id }));
        } else {
          ws.close(1008, "Terminal not found");
        }
        return;
      }

      // Dashboard client
      wsClients.add(ws);
      ws.send(JSON.stringify({ type: "sessions", data: Array.from(sessions.values()) }));
      const logs: Record<string, LogEntry[]> = {};
      for (const [id, entries] of sessionLogs) logs[id] = entries;
      ws.send(JSON.stringify({ type: "logs", data: logs }));
    },
    close(ws) {
      const meta = ws.data as { kind: string; terminalId?: string };

      if (meta.kind === "terminal") {
        const term = terminals.get(meta.terminalId!);
        if (term) term.subscribers.delete(ws);
        return;
      }

      wsClients.delete(ws);
    },
    message(ws, msg) {
      const meta = ws.data as { kind: string; terminalId?: string };

      if (meta.kind === "terminal") {
        // Terminal input — forward to PTY
        try {
          const data = JSON.parse(msg.toString()) as Record<string, unknown>;
          if (data.type === "terminal_input" && typeof data.data === "string") {
            writeTerminal(meta.terminalId!, data.data);
          } else if (data.type === "terminal_resize") {
            resizeTerminal(meta.terminalId!, data.cols as number, data.rows as number);
          }
        } catch { /* ignore */ }
        return;
      }

      // Dashboard messages (reserved for future use)
      try {
        JSON.parse(msg.toString());
      } catch { /* ignore malformed messages */ }
    },
  },
});

// Prune stale sessions every 30 seconds, also re-broadcast for keepalive
setInterval(() => {
  pruneStale();
  broadcastSessions();
}, 30_000);

console.log("Observatory running at http://localhost:7337");
console.log(`WebSocket endpoint: ws://localhost:7337/ws`);
console.log(`Hook endpoints:`);
console.log(`  POST http://localhost:7337/hook/claude`);
