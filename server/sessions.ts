import type { SessionState, AgentSource } from "./types";
import { sessions, sessionLogs, terminals } from "./state";
import { broadcastSessions } from "./broadcast";

// If a session's state hasn't been updated by a hook in this long, assume the
// agent is idle and fall back to "waiting". This prevents characters from being
// stuck in "input" / "thinking" / etc. when a Stop hook is lost or never fires.
const STATE_STALE_MS = 2 * 60 * 1000; // 2 minutes

export function pruneStale() {
  const now = Date.now();
  const cutoff = now - 15 * 60 * 1000;
  let changed = false;
  for (const [id, session] of sessions) {
    // Don't prune if a terminal is still alive for this session
    if (terminals.has(id)) {
      // But do reset stale active states back to waiting
      if (session.state !== "waiting" && (now - session.stateChangedAt) > STATE_STALE_MS) {
        session.state = "waiting";
        session.stateChangedAt = now;
        changed = true;
      }
      continue;
    }
    if (session.lastSeen < cutoff) {
      sessions.delete(id);
      sessionLogs.delete(id);
      changed = true;
    }
  }
  if (changed) broadcastSessions();
}

export function upsertSession(
  id: string,
  cwd: string,
  state: SessionState,
  source?: AgentSource
) {
  const existing = sessions.get(id);
  const now = Date.now();
  const stateChanged = existing?.state !== state;
  sessions.set(id, {
    id,
    cwd,
    state,
    source: source || existing?.source || "",
    lastSeen: now,
    startedAt: existing?.startedAt ?? now,
    stateChangedAt: stateChanged ? now : (existing?.stateChangedAt ?? now),
  });
  broadcastSessions();
}
