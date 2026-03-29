import { basename } from "path";
import type { SessionState } from "./types";
import { sessions, terminals, cliSessionToTerminal } from "./state";
import { upsertSession } from "./sessions";
import { appendLog } from "./broadcast";

// ── Normalized hook shape ───────────────────────────────────────────────────
// Every CLI normalizer produces this common format.

interface NormalizedHook {
  hookEvent: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop";
  sessionId: string;
  cwd: string;
  toolName: string;       // lowercase: "read", "edit", "bash", "mcp", "askuserquestion", etc.
  toolInput: Record<string, unknown>;
  observatoryTerminalId: string;
}

// ── Claude Code normalizer ──────────────────────────────────────────────────

function normalizeClaude(body: Record<string, unknown>): NormalizedHook {
  const toolName = (
    (body.tool_name as string) ??
    ((body.tool_input as Record<string, unknown>)?.tool_name as string) ??
    ""
  ).toLowerCase();

  return {
    hookEvent: (body.hook_event_name ?? body.event ?? "") as NormalizedHook["hookEvent"],
    sessionId: (body.session_id ?? "") as string,
    cwd: (body.cwd ?? body.working_directory ?? "") as string,
    toolName,
    toolInput: (body.tool_input as Record<string, unknown>) ?? {},
    observatoryTerminalId: (body.observatory_terminal_id ?? "") as string,
  };
}

// ── Cursor normalizer ───────────────────────────────────────────────────────
// Cursor uses per-event hooks instead of a generic PreToolUse:
//   beforeShellExecution → bash
//   beforeReadFile       → read
//   afterFileEdit        → edit
//   beforeMCPExecution   → mcp
//   stop                 → Stop

function normalizeCursor(body: Record<string, unknown>): NormalizedHook {
  const event = (body.hook_event_name ?? "") as string;
  let hookEvent: NormalizedHook["hookEvent"] = "PreToolUse";
  let toolName = "";
  let toolInput: Record<string, unknown> = {};

  switch (event) {
    case "beforeShellExecution":
      toolName = "bash";
      toolInput = { command: body.command, cwd: body.cwd };
      break;
    case "beforeReadFile":
      toolName = "read";
      toolInput = { file_path: body.file_path };
      break;
    case "afterFileEdit":
      toolName = "edit";
      toolInput = { file_path: body.file_path };
      break;
    case "beforeMCPExecution":
      toolName = "mcp";
      toolInput = { tool_name: body.tool_name, tool_input: body.tool_input };
      break;
    case "preToolUse": {
      // Cursor also has generic preToolUse with tool_name for some tools
      const tn = ((body.tool_name as string) ?? "").toLowerCase();
      if (/^(shell|bash)$/i.test(tn)) toolName = "bash";
      else if (/^(read|grep|glob)/i.test(tn)) toolName = "read";
      else if (/^(write|edit|delete)/i.test(tn)) toolName = "edit";
      else if (/^mcp/i.test(tn)) toolName = "mcp";
      else toolName = tn;
      toolInput = (body.tool_input as Record<string, unknown>) ?? {};
      break;
    }
    case "postToolUse":
      hookEvent = "PostToolUse";
      break;
    case "stop":
      hookEvent = "Stop";
      break;
    default:
      hookEvent = "PreToolUse";
      toolName = "";
      break;
  }

  // Cursor uses workspace_roots array for cwd
  const workspaceRoots = body.workspace_roots as string[] | undefined;
  const cwd = (body.cwd as string) ?? workspaceRoots?.[0] ?? "";

  return {
    hookEvent,
    sessionId: (body.conversation_id ?? body.generation_id ?? "") as string,
    cwd,
    toolName,
    toolInput,
    observatoryTerminalId: (body.observatory_terminal_id ?? "") as string,
  };
}

// ── GitHub Copilot CLI normalizer ───────────────────────────────────────────
// Copilot uses: preToolUse, postToolUse, userPromptSubmitted, sessionStart, sessionEnd
// Tool names: bash, edit, view, create, glob, grep
// toolArgs is a JSON string that needs parsing.

function normalizeCopilot(body: Record<string, unknown>): NormalizedHook {
  const event = (body.hookEventName ?? body.hook_event_name ?? "") as string;

  let hookEvent: NormalizedHook["hookEvent"];
  switch (event) {
    case "userPromptSubmitted":
      hookEvent = "UserPromptSubmit";
      break;
    case "preToolUse":
      hookEvent = "PreToolUse";
      break;
    case "postToolUse":
      hookEvent = "PostToolUse";
      break;
    case "sessionEnd":
      hookEvent = "Stop";
      break;
    default:
      hookEvent = "PreToolUse";
      break;
  }

  // Map Copilot tool names to Observatory categories
  const rawTool = ((body.toolName ?? body.tool_name ?? "") as string).toLowerCase();
  let toolName = rawTool;
  if (rawTool === "view") toolName = "read";
  else if (rawTool === "create") toolName = "edit";
  else if (rawTool === "glob" || rawTool === "grep") toolName = "read";

  // toolArgs is a JSON string in Copilot
  let toolInput: Record<string, unknown> = {};
  const rawArgs = body.toolArgs as string | undefined;
  if (rawArgs) {
    try { toolInput = JSON.parse(rawArgs); } catch { toolInput = { raw: rawArgs }; }
  }

  return {
    hookEvent,
    sessionId: (body.session_id ?? "") as string,
    cwd: (body.cwd ?? "") as string,
    toolName,
    toolInput,
    observatoryTerminalId: (body.observatory_terminal_id ?? "") as string,
  };
}

// ── Gemini CLI normalizer ───────────────────────────────────────────────────
// Gemini uses: BeforeTool, AfterTool, UserPromptSubmit, SessionStart, SessionEnd
// Tool names: read_file, read_many_files, write_file, replace, glob, grep_search,
//   run_shell_command, ask_user, mcp_<server>_<tool>, google_web_search, web_fetch, etc.

function normalizeGemini(body: Record<string, unknown>): NormalizedHook {
  const event = (body.hook_event_name ?? "") as string;

  let hookEvent: NormalizedHook["hookEvent"];
  switch (event) {
    case "UserPromptSubmit":
      hookEvent = "UserPromptSubmit";
      break;
    case "BeforeTool":
      hookEvent = "PreToolUse";
      break;
    case "AfterTool":
      hookEvent = "PostToolUse";
      break;
    case "SessionEnd":
      hookEvent = "Stop";
      break;
    default:
      hookEvent = "PreToolUse";
      break;
  }

  // Map Gemini tool names to Observatory categories
  const rawTool = ((body.tool_name ?? "") as string).toLowerCase();
  let toolName = rawTool;
  if (/^(read_file|read_many_files|list_directory)$/.test(rawTool)) toolName = "read";
  else if (/^(glob|grep_search|search_file_content)$/.test(rawTool)) toolName = "grep";
  else if (/^(write_file|replace)$/.test(rawTool)) toolName = "edit";
  else if (rawTool === "run_shell_command") toolName = "bash";
  else if (rawTool === "ask_user") toolName = "askuserquestion";
  else if (/^mcp_/.test(rawTool)) toolName = "mcp";
  else if (/^(google_web_search|web_fetch)$/.test(rawTool)) toolName = "mcp";

  const toolInput = (body.tool_input as Record<string, unknown>) ?? {};

  return {
    hookEvent,
    sessionId: (body.session_id ?? "") as string,
    cwd: (body.cwd ?? "") as string,
    toolName,
    toolInput,
    observatoryTerminalId: (body.observatory_terminal_id ?? "") as string,
  };
}

// ── Normalizer registry ─────────────────────────────────────────────────────

const normalizers: Record<string, (body: Record<string, unknown>) => NormalizedHook> = {
  claude: normalizeClaude,
  cursor: normalizeCursor,
  copilot: normalizeCopilot,
  gemini: normalizeGemini,
};

// ── Shared hook handler ─────────────────────────────────────────────────────

export function handleHook(source: string, body: Record<string, unknown>) {
  const normalize = normalizers[source];
  if (!normalize) {
    console.warn(`[hook] unknown source: ${source}`);
    return;
  }

  const hook = normalize(body);
  processNormalizedHook(hook, source);
}

// Backward compat — still works if called directly
export function handleClaudeHookForTerminal(body: Record<string, unknown>) {
  handleHook("claude", body);
}

function processNormalizedHook(hook: NormalizedHook, source: string) {
  const { hookEvent, sessionId, cwd, toolName, toolInput, observatoryTerminalId } = hook;

  // Resolve terminal id: use env-injected id, or look up from prior mapping
  let terminalId = observatoryTerminalId || (sessionId ? cliSessionToTerminal.get(sessionId) : "");
  if (!terminalId || !terminals.has(terminalId)) return;

  // Establish cli session → terminal mapping on first hook
  if (sessionId && !cliSessionToTerminal.has(sessionId)) {
    cliSessionToTerminal.set(sessionId, terminalId);
    console.log(`[hook] linked ${source} session ${sessionId} → terminal ${terminalId}`);
  }

  // Create Observatory session on first hook
  const agentSource = source as import("./types").AgentSource;
  let session = sessions.get(terminalId);
  if (!session) {
    upsertSession(terminalId, cwd, "thinking", agentSource);
    session = sessions.get(terminalId)!;
    session.terminalId = terminalId;
  }

  // ── Map hook → session state ────────────────────────────────────────────
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

  upsertSession(terminalId, cwd, state, agentSource);
  const s = sessions.get(terminalId);
  if (s) s.terminalId = terminalId;

  // ── Append log entry ──────────────────────────────────────────────────────
  if (hookEvent === "UserPromptSubmit") {
    appendLog(terminalId, { ts: Date.now(), kind: "prompt" });
  } else if (hookEvent === "PreToolUse") {
    if (/^askuserquestion$/i.test(toolName)) {
      const q = (toolInput?.question as string) ?? (toolInput?.text as string);
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
  }
}
