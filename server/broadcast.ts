import type { LogEntry, WsData } from "./types";
import { sessions, wsClients, sessionLogs, MAX_LOG_ENTRIES } from "./state";

export function broadcast(payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

export function broadcastSessions() {
  broadcast({ type: "sessions", data: Array.from(sessions.values()) });
}

export function appendLog(sessionId: string, entry: LogEntry) {
  let log = sessionLogs.get(sessionId);
  if (!log) { log = []; sessionLogs.set(sessionId, log); }
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES);
  broadcast({ type: "log_append", sessionId, entry });
}
