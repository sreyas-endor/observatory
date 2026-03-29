export type SessionState =
  | "idle"
  | "waiting"
  | "reading"
  | "editing"
  | "running"
  | "thinking"
  | "error"
  | "mcp"
  | "input";  // blocked mid-task waiting for user answer (AskUserQuestion)

export type AgentSource = "claude" | "cursor" | "copilot" | "gemini" | "";

export interface Session {
  id: string;
  cwd: string;
  state: SessionState;
  source: AgentSource;
  lastSeen: number;
  startedAt: number;
  stateChangedAt: number;
  terminalId?: string;
}

export interface LogEntry {
  ts: number;
  kind: "prompt" | "thinking" | "read" | "edit" | "bash" | "mcp" | "input" | "done" | "error";
  detail?: string;
}

export interface Terminal {
  id: string;
  cwd: string;
  proc: import("bun").Subprocess;
  subscribers: Set<import("bun").ServerWebSocket<WsData>>;
  outputBuffer: string[];  // ring buffer of recent output chunks for replay
}

export interface WsData {
  kind: "dashboard" | "terminal";
  terminalId?: string;
}
