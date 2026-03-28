// Observatory — File Viewer Module
// CodeMirror 6 based file viewer with tab management, autosave, preview/pin behavior

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';

import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { markdown } from '@codemirror/lang-markdown';

// ── Language detection ────────────────────────────────────────────────────

const LANG_MAP = {
  '.js':   () => javascript(),
  '.mjs':  () => javascript(),
  '.cjs':  () => javascript(),
  '.jsx':  () => javascript({ jsx: true }),
  '.ts':   () => javascript({ typescript: true }),
  '.tsx':  () => javascript({ typescript: true, jsx: true }),
  '.json': () => json(),
  '.html': () => html(),
  '.htm':  () => html(),
  '.css':  () => css(),
  '.py':   () => python(),
  '.rs':   () => rust(),
  '.go':   () => go(),
  '.md':   () => markdown(),
  '.mdx':  () => markdown(),
};

function langForPath(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = filePath.slice(dot).toLowerCase();
  const factory = LANG_MAP[ext];
  return factory ? factory() : null;
}

function basenameOf(filePath) {
  const i = filePath.lastIndexOf('/');
  return i === -1 ? filePath : filePath.slice(i + 1);
}

// ── State ─────────────────────────────────────────────────────────────────

const openFiles = new Map(); // filePath → { view, container, content, dirty, pinned, line }
let previewPath = null;      // the current preview (italic) tab path, or null
let activeFilePath = null;   // currently visible file tab

const AUTOSAVE_DELAY = 1000; // ms
const saveTimers = new Map(); // filePath → timeout id

const MAX_RECENT = 10;
const RECENT_KEY = 'observatory-recent-files';

function getRecentFiles() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
  catch { return []; }
}

function trackRecent(filePath) {
  const recent = getRecentFiles().filter(f => f !== filePath);
  recent.unshift(filePath);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

// ── API (exposed to game.js via window.FileViewer) ────────────────────────

window.FileViewer = {
  open: openFile,
  getRecentFiles,
  isOpen: (path) => openFiles.has(path),
  getActiveFilePath: () => activeFilePath,
  closeFile,
  closeAll,
  updateTabs,  // called by game.js when it rebuilds tabs
  getOpenFiles: () => openFiles,
  hideAll,
  showFile,
};

// ── Open a file ───────────────────────────────────────────────────────────

async function openFile(filePath, { line = null, pin = false } = {}) {
  trackRecent(filePath);

  // If already open, just focus it
  if (openFiles.has(filePath)) {
    const entry = openFiles.get(filePath);
    if (pin) {
      entry.pinned = true;
      // If this was the preview, clear preview slot
      if (previewPath === filePath) previewPath = null;
    }
    showFile(filePath);
    if (line != null) goToLine(filePath, line);
    updateTabs();
    return;
  }

  // If this is a single-click (not pinned) and there's an existing preview, replace it
  if (!pin && previewPath && openFiles.has(previewPath)) {
    closeFile(previewPath, { skipTabUpdate: true });
  }

  // Fetch file content from server
  let content;
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) {
      console.error(`[file-viewer] Failed to open ${filePath}: ${res.status}`);
      return;
    }
    const data = await res.json();
    content = data.content;
    filePath = data.path; // use the resolved absolute path from server
  } catch (e) {
    console.error('[file-viewer] Fetch error:', e);
    return;
  }

  // Create CodeMirror editor
  const container = document.createElement('div');
  container.className = 'file-viewer-wrap';

  const pathBar = document.createElement('div');
  pathBar.className = 'file-viewer-path';
  pathBar.textContent = filePath;
  container.appendChild(pathBar);

  const editorWrap = document.createElement('div');
  editorWrap.className = 'file-viewer-editor';
  container.appendChild(editorWrap);

  const termContainer = document.getElementById('terminal-container');
  termContainer.appendChild(container);

  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    closeBrackets(),
    indentOnInput(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        markDirty(filePath);
        scheduleSave(filePath);
        // Any edit pins the tab (VS Code behavior)
        const entry = openFiles.get(filePath);
        if (entry && !entry.pinned) {
          entry.pinned = true;
          if (previewPath === filePath) previewPath = null;
          updateTabs();
        }
      }
    }),
  ];

  // Add language support
  const lang = langForPath(filePath);
  if (lang) extensions.push(lang);

  const state = EditorState.create({ doc: content, extensions });
  const view = new EditorView({ state, parent: editorWrap });

  const entry = { view, container, content, dirty: false, pinned: pin };
  openFiles.set(filePath, entry);

  if (!pin) {
    previewPath = filePath;
  }

  showFile(filePath);
  if (line != null) goToLine(filePath, line);
  updateTabs();
}

// ── Show / hide files ─────────────────────────────────────────────────────

function showFile(filePath) {
  // Ensure terminal panel is open
  const panel = document.getElementById('terminal-panel');
  if (panel && !panel.classList.contains('open')) {
    if (panel._restoreWidth) panel._restoreWidth();
    panel.classList.add('open');
    const backdrop = document.getElementById('terminal-backdrop');
    if (backdrop) backdrop.classList.add('open');
    if (panel._updateCameraShift) panel._updateCameraShift();
  }

  // Hide all xterm terminals
  if (window._hideActiveTerminal) window._hideActiveTerminal();

  // Hide all file viewers, show the target
  for (const [path, entry] of openFiles) {
    entry.container.classList.toggle('active', path === filePath);
  }

  activeFilePath = filePath;

  // Focus the editor
  const entry = openFiles.get(filePath);
  if (entry) {
    requestAnimationFrame(() => entry.view.focus());
  }
}

function hideAll() {
  for (const [, entry] of openFiles) {
    entry.container.classList.remove('active');
  }
  activeFilePath = null;
}

// ── Go to line ────────────────────────────────────────────────────────────

function goToLine(filePath, lineNum) {
  const entry = openFiles.get(filePath);
  if (!entry) return;
  const { view } = entry;
  const line = view.state.doc.line(Math.min(lineNum, view.state.doc.lines));
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  });
}

// ── Dirty / autosave ──────────────────────────────────────────────────────

function markDirty(filePath) {
  const entry = openFiles.get(filePath);
  if (!entry) return;
  entry.dirty = true;
  updateTabs();
}

function markClean(filePath) {
  const entry = openFiles.get(filePath);
  if (!entry) return;
  entry.dirty = false;
  updateTabs();
}

function scheduleSave(filePath) {
  if (saveTimers.has(filePath)) clearTimeout(saveTimers.get(filePath));
  saveTimers.set(filePath, setTimeout(() => saveFile(filePath), AUTOSAVE_DELAY));
}

async function saveFile(filePath) {
  saveTimers.delete(filePath);
  const entry = openFiles.get(filePath);
  if (!entry || !entry.dirty) return;

  const content = entry.view.state.doc.toString();
  try {
    const res = await fetch('/api/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    if (res.ok) {
      entry.content = content;
      markClean(filePath);
    } else {
      console.error(`[file-viewer] Save failed for ${filePath}: ${res.status}`);
    }
  } catch (e) {
    console.error('[file-viewer] Save error:', e);
  }
}

// ── Close file ────────────────────────────────────────────────────────────

function closeFile(filePath, { skipTabUpdate = false } = {}) {
  const entry = openFiles.get(filePath);
  if (!entry) return;

  // Flush any pending save
  if (saveTimers.has(filePath)) {
    clearTimeout(saveTimers.get(filePath));
    if (entry.dirty) saveFile(filePath); // fire-and-forget
  }

  entry.view.destroy();
  entry.container.remove();
  openFiles.delete(filePath);

  if (previewPath === filePath) previewPath = null;

  if (activeFilePath === filePath) {
    // Switch to another open file or clear
    const remaining = Array.from(openFiles.keys());
    if (remaining.length > 0) {
      showFile(remaining[remaining.length - 1]);
    } else {
      activeFilePath = null;
    }
  }

  if (!skipTabUpdate) updateTabs();
}

function closeAll() {
  for (const path of Array.from(openFiles.keys())) {
    closeFile(path, { skipTabUpdate: true });
  }
  updateTabs();
}

// ── Tab rendering (called by game.js updateTerminalTabs) ──────────────────

function updateTabs() {
  // This is a no-op signal — game.js calls its own updateTerminalTabs
  // which reads from window.FileViewer.getOpenFiles()
  if (window._updateTerminalTabs) window._updateTerminalTabs();
}

// ── Exports for debugging ─────────────────────────────────────────────────
window._fileViewerDebug = { openFiles, saveTimers };
