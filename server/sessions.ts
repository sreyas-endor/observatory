import type { SessionState } from "./types";
import { sessions, sessionLogs, terminals } from "./state";
import { broadcastSessions } from "./broadcast";

export function pruneStale() {
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

export function upsertSession(
  id: string,
  cwd: string,
  state: SessionState
) {
  const existing = sessions.get(id);
  const now = Date.now();
  const stateChanged = existing?.state !== state;
  sessions.set(id, {
    id,
    cwd,
    state,
    lastSeen: now,
    startedAt: existing?.startedAt ?? now,
    stateChangedAt: stateChanged ? now : (existing?.stateChangedAt ?? now),
  });
  broadcastSessions();
}
