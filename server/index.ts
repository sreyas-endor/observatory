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

// Track pending permission timers: sessionId → timer handle
// When PreToolUse fires for a blocking tool, we start a timer. If PostToolUse
// arrives before it fires we cancel it. If not, the tool is waiting on a
// permission dialog → flip to "input" so the character walks to the lounge.
const permissionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PERMISSION_TIMEOUT_MS = 2500;

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

// ── Claude hook handler ────────────────────────────────────────────────────

function handleClaudeHook(body: Record<string, unknown>) {
  const hookEvent = (body.hook_event_name ?? body.event ?? "") as string;
  const sessionId = (body.session_id ?? body.id ?? "") as string;
  if (!sessionId) return;

  const cwd = (body.cwd ?? body.working_directory ?? "") as string;
  const toolName = (
    (body.tool_name as string) ??
    ((body.tool_input as Record<string, unknown>)?.tool_name as string) ??
    ""
  ).toLowerCase();

  let state: SessionState = "idle";

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
    // Cancel any pending permission timer — tool completed without blocking
    const t = permissionTimers.get(sessionId);
    if (t !== undefined) {
      clearTimeout(t);
      permissionTimers.delete(sessionId);
    }
    state = "idle";
  } else if (hookEvent === "Stop") {
    const t = permissionTimers.get(sessionId);
    if (t !== undefined) {
      clearTimeout(t);
      permissionTimers.delete(sessionId);
    }
    state = "waiting";
  }

  upsertSession(sessionId, "claude", cwd, state);

  // ── Append log entry ───────────────────────────────────────────────────
  const toolInput = body.tool_input as Record<string, unknown> | undefined;
  if (hookEvent === "UserPromptSubmit") {
    appendLog(sessionId, { ts: Date.now(), kind: "prompt" });
  } else if (hookEvent === "PreToolUse") {
    if (/^askuserquestion$/i.test(toolName)) {
      const q = toolInput?.question as string | undefined;
      appendLog(sessionId, { ts: Date.now(), kind: "input", detail: q ? q.slice(0, 80) : undefined });
    } else if (/^(read|grep|glob)/i.test(toolName)) {
      const p = (toolInput?.file_path ?? toolInput?.path ?? toolInput?.pattern) as string | undefined;
      appendLog(sessionId, { ts: Date.now(), kind: "read", detail: p ? basename(p) : toolName });
    } else if (/^(edit|write|multiedit)/i.test(toolName)) {
      const p = toolInput?.file_path as string | undefined;
      appendLog(sessionId, { ts: Date.now(), kind: "edit", detail: p ? basename(p) : toolName });
    } else if (/^bash/i.test(toolName)) {
      const cmd = toolInput?.command as string | undefined;
      appendLog(sessionId, { ts: Date.now(), kind: "bash", detail: cmd ? cmd.slice(0, 60) : undefined });
    } else if (/mcp/i.test(toolName)) {
      appendLog(sessionId, { ts: Date.now(), kind: "mcp", detail: toolName });
    } else {
      appendLog(sessionId, { ts: Date.now(), kind: "thinking" });
    }
  } else if (hookEvent === "Stop") {
    appendLog(sessionId, { ts: Date.now(), kind: "done" });
  }

  // After upserting, if this was a PreToolUse for a blocking tool (not AskUserQuestion
  // which is already "input", and not read-type tools which take long and don't need approval),
  // start a permission-wait timer.
  if (hookEvent === "PreToolUse" && state !== "input" && state !== "reading") {
    // Cancel any previous timer for this session
    const existing = permissionTimers.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);

    const timer = setTimeout(() => {
      permissionTimers.delete(sessionId);
      const session = sessions.get(sessionId);
      // Only flip to input if still in a tool-use state (not already done/idle)
      if (session && session.state !== "idle" && session.state !== "waiting" && session.state !== "input") {
        upsertSession(sessionId, session.type, session.cwd, "input");
      }
    }, PERMISSION_TIMEOUT_MS);
    permissionTimers.set(sessionId, timer);
  }
}

// ── Cursor hook handler ────────────────────────────────────────────────────

function handleCursorHook(body: Record<string, unknown>) {
  const event = (body.hook_event_name ?? body.event ?? body.type ?? body.hook ?? "") as string;
  const sessionId = (body.conversation_id ?? body.session_id ?? body.id ?? "") as string;
  if (!sessionId) return;

  const workspaceRoots = body.workspace_roots as string[] | undefined;
  const cwd = (workspaceRoots?.[0] ?? body.cwd ?? body.workspaceRoot ?? body.workspace ?? "") as string;
  const status = (body.status ?? "") as string;

  let state: SessionState = "idle";

  switch (event) {
    case "beforeReadFile":
      state = "reading";
      break;
    case "afterFileEdit":
      state = "editing";
      break;
    case "beforeShellExecution":
      state = "running";
      break;
    case "beforeMCPExecution":
      state = "mcp";
      break;
    case "beforeSubmitPrompt":
      state = "thinking";
      break;
    case "stop":
      state = status === "error" ? "error" : "waiting";
      break;
    default:
      state = "idle";
  }

  upsertSession(sessionId, "cursor", cwd, state);
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

    // WebSocket upgrade
    if (pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Hook endpoints
    if (req.method === "POST" && pathname === "/hook/claude") {
      return readJSON(req).then((body) => {
        handleClaudeHook(body);
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    if (req.method === "POST" && pathname === "/hook/cursor") {
      return readJSON(req).then((body) => {
        handleCursorHook(body);
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    // Static files
    return serveStatic(pathname);
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      ws.send(JSON.stringify({ type: "sessions", data: Array.from(sessions.values()) }));
      // Send full log history for all sessions
      const logs: Record<string, LogEntry[]> = {};
      for (const [id, entries] of sessionLogs) logs[id] = entries;
      ws.send(JSON.stringify({ type: "logs", data: logs }));
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message(_ws, msg) {
      try {
        const data = JSON.parse(msg.toString()) as Record<string, unknown>;
        if (data.type === "focus") {
          const sessionId = data.sessionId as string;
          const session = sessions.get(sessionId);
          console.log(`[focus] sessionId=${sessionId} session=${JSON.stringify(session)}`);
          if (session?.type === "claude") {
            focusGhostty();
          }
        }
      } catch { /* ignore malformed messages */ }
    },
  },
});

// ── Ghostty focus via AppleScript ──────────────────────────────────────────

function focusGhostty() {
  spawn(["osascript", "-e", 'tell application "Ghostty" to activate']);
}

// Prune stale sessions every 30 seconds, also re-broadcast for keepalive
setInterval(() => {
  pruneStale();
  broadcastSessions();
}, 30_000);

console.log("Observatory running at http://localhost:7337");
console.log(`WebSocket endpoint: ws://localhost:7337/ws`);
console.log(`Hook endpoints:`);
console.log(`  POST http://localhost:7337/hook/claude`);
console.log(`  POST http://localhost:7337/hook/cursor`);
