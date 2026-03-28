import type { Session, LogEntry, Terminal, WsData } from "./types";

export const sessions = new Map<string, Session>();
export const wsClients = new Set<import("bun").ServerWebSocket<WsData>>();
export const sessionLogs = new Map<string, LogEntry[]>();
export const MAX_LOG_ENTRIES = 300;

export const terminals = new Map<string, Terminal>();
export const cliSessionToTerminal = new Map<string, string>(); // cli session_id → terminalId
export let terminalIdCounter = 0;
export function nextTerminalId() { return ++terminalIdCounter; }
export const MAX_OUTPUT_BUFFER = 500; // max chunks to keep for replay
