// Observatory — Command Palette (Cmd+P file search)
// VS Code-style fuzzy file finder with scoring

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────
  let fileCache = null;   // { cwd, files: string[] }
  let results = [];       // current filtered results
  let activeIndex = 0;    // keyboard selection index
  let isOpen = false;

  const overlay = document.getElementById('cmd-palette-overlay');
  const input = document.getElementById('cmd-palette-input');
  const resultsList = document.getElementById('cmd-palette-results');
  const searchBtn = document.getElementById('search-btn');

  const MAX_RESULTS = 50;

  // Recent files — stored as full paths by FileViewer, converted to relative for matching
  function getRecentFiles() {
    if (!window.FileViewer || !window.FileViewer.getRecentFiles) return [];
    const recent = window.FileViewer.getRecentFiles();
    const cwd = fileCache ? fileCache.cwd : '';
    if (!cwd) return recent;
    const prefix = cwd + '/';
    return recent.map(f => f.startsWith(prefix) ? f.slice(prefix.length) : f);
  }

  // ── Triggers ────────────────────────────────────────────────────────────

  // Cmd+P / Ctrl+P
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close();
    }
  });

  if (searchBtn) {
    searchBtn.addEventListener('click', () => toggle());
  }

  // Click outside to close
  if (overlay) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
  }

  // ── Open / Close ────────────────────────────────────────────────────────

  function toggle() {
    isOpen ? close() : open();
  }

  function open() {
    if (!overlay || !input) return;
    isOpen = true;
    overlay.classList.add('open');
    input.value = '';
    activeIndex = 0;
    results = [];
    resultsList.innerHTML = '';

    // Fetch file list for active session
    fetchFiles().then(() => {
      renderResults();
    });

    // Focus after animation
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    if (!overlay) return;
    isOpen = false;
    overlay.classList.remove('open');
    input.blur();
  }

  // ── Fetch files ─────────────────────────────────────────────────────────

  function getActiveCwd() {
    // Get cwd from the active terminal session
    // window.allSessions is not exposed, so we use a hook
    if (window._getActiveCwd) return window._getActiveCwd();
    return '';
  }

  async function fetchFiles() {
    const cwd = getActiveCwd();
    if (!cwd) {
      fileCache = null;
      return;
    }

    // Use cache if same cwd
    if (fileCache && fileCache.cwd === cwd) return;

    try {
      const res = await fetch(`/api/files?cwd=${encodeURIComponent(cwd)}`);
      if (!res.ok) { fileCache = null; return; }
      const data = await res.json();
      fileCache = { cwd: data.cwd, files: data.files };
    } catch {
      fileCache = null;
    }
  }

  // ── Input handling ──────────────────────────────────────────────────────

  if (input) {
    input.addEventListener('input', () => {
      activeIndex = 0;
      renderResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, results.length - 1);
        updateActive();
        scrollActiveIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
        scrollActiveIntoView();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectResult(activeIndex);
      }
    });
  }

  // ── Fuzzy matching (VS Code style) ──────────────────────────────────────

  function fuzzyMatch(query, target) {
    // Returns { score, matches: number[] } or null if no match
    // matches = indices in target that matched query chars
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();
    const queryLen = queryLower.length;
    const targetLen = targetLower.length;

    if (queryLen === 0) return { score: 0, matches: [] };
    if (queryLen > targetLen) return null;

    const matches = [];
    let score = 0;
    let qi = 0;
    let lastMatchIdx = -1;
    let consecutiveCount = 0;

    for (let ti = 0; ti < targetLen && qi < queryLen; ti++) {
      if (targetLower[ti] === queryLower[qi]) {
        matches.push(ti);

        // Consecutive bonus
        if (ti === lastMatchIdx + 1) {
          consecutiveCount++;
          score += 5 * consecutiveCount;
        } else {
          consecutiveCount = 0;
        }

        // Word boundary bonus (after /, ., -, _, or start)
        if (ti === 0 || '/.-_'.includes(target[ti - 1])) {
          score += 10;
        }

        // Case match bonus
        if (query[qi] === target[ti]) {
          score += 1;
        }

        lastMatchIdx = ti;
        qi++;
      }
    }

    // All query chars must match
    if (qi < queryLen) return null;

    // Filename match bonus — matches in the filename part score higher
    const lastSlash = target.lastIndexOf('/');
    const filenameStart = lastSlash + 1;
    let filenameMatches = 0;
    for (const idx of matches) {
      if (idx >= filenameStart) filenameMatches++;
    }
    score += filenameMatches * 3;

    // Shorter paths are slightly preferred
    score -= targetLen * 0.1;

    return { score, matches };
  }

  // ── Render ──────────────────────────────────────────────────────────────

  function renderResults() {
    if (!resultsList) return;

    const query = input.value.trim();

    if (!fileCache || !fileCache.files.length) {
      resultsList.innerHTML = '<div id="cmd-palette-empty">No files found. Is a session active?</div>';
      results = [];
      return;
    }

    if (!query) {
      // Recent files first, then alphabetical for the rest
      const recent = getRecentFiles();
      const recentInRepo = recent.filter(f => fileCache.files.includes(f));
      const rest = fileCache.files.filter(f => !recentInRepo.includes(f));
      const ordered = [...recentInRepo, ...rest].slice(0, MAX_RESULTS);
      results = ordered.map(f => ({ file: f, score: 0, matches: [] }));
    } else {
      // Fuzzy filter and sort
      const scored = [];
      for (const file of fileCache.files) {
        const m = fuzzyMatch(query, file);
        if (m) scored.push({ file, score: m.score, matches: m.matches });
      }
      // Mild recency tiebreaker — fuzzy score dominates
      const recent = getRecentFiles();
      const recencyBonus = new Map(recent.map((f, i) => [f, (recent.length - i) * 0.5]));
      for (const s of scored) {
        s.score += recencyBonus.get(s.file) || 0;
      }
      scored.sort((a, b) => b.score - a.score);
      results = scored.slice(0, MAX_RESULTS);
    }

    if (results.length === 0) {
      resultsList.innerHTML = '<div id="cmd-palette-empty">No matching files</div>';
      return;
    }

    resultsList.innerHTML = '';
    results.forEach((r, i) => {
      const el = document.createElement('div');
      el.className = `cmd-result${i === activeIndex ? ' active' : ''}`;
      el.dataset.index = i;

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = fileIconFor(r.file);
      el.appendChild(icon);

      // Split into filename and directory
      const lastSlash = r.file.lastIndexOf('/');
      const fileName = lastSlash >= 0 ? r.file.slice(lastSlash + 1) : r.file;
      const dirPath = lastSlash >= 0 ? r.file.slice(0, lastSlash) : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name';
      nameSpan.innerHTML = highlightMatches(fileName, r.matches, lastSlash + 1);
      el.appendChild(nameSpan);

      if (dirPath) {
        const pathSpan = document.createElement('span');
        pathSpan.className = 'file-path';
        pathSpan.innerHTML = highlightMatches(dirPath, r.matches, 0, lastSlash);
        el.appendChild(pathSpan);
      }

      el.addEventListener('click', () => selectResult(i));
      el.addEventListener('mousemove', () => {
        if (activeIndex !== i) {
          activeIndex = i;
          updateActive();
        }
      });

      resultsList.appendChild(el);
    });
  }

  function highlightMatches(text, matchIndices, globalOffset, endOffset) {
    // matchIndices are positions in the full path
    // globalOffset = where this text starts in the full path
    // endOffset = where this text ends (exclusive), defaults to globalOffset + text.length
    const end = endOffset != null ? endOffset : globalOffset + text.length;
    const localMatches = new Set();
    for (const idx of matchIndices) {
      if (idx >= globalOffset && idx < end) {
        localMatches.add(idx - globalOffset);
      }
    }

    let html = '';
    for (let i = 0; i < text.length; i++) {
      const ch = escapeHtml(text[i]);
      if (localMatches.has(i)) {
        html += `<span class="match-char">${ch}</span>`;
      } else {
        html += ch;
      }
    }
    return html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fileIconFor(path) {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const icons = {
      '.js': 'JS', '.ts': 'TS', '.jsx': 'JX', '.tsx': 'TX',
      '.json': '{}', '.html': '<>', '.css': '#',
      '.py': 'PY', '.rs': 'RS', '.go': 'GO',
      '.md': 'MD', '.sh': '$',
    };
    return icons[ext] || '~';
  }

  function updateActive() {
    const items = resultsList.querySelectorAll('.cmd-result');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });
  }

  function scrollActiveIntoView() {
    const active = resultsList.querySelector('.cmd-result.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // ── Select result ───────────────────────────────────────────────────────

  function selectResult(index) {
    const r = results[index];
    if (!r) return;

    const cwd = fileCache ? fileCache.cwd : '';
    const fullPath = cwd ? cwd + '/' + r.file : r.file;

    close();

    // Open in file viewer as pinned tab
    if (window.FileViewer) {
      window.FileViewer.open(fullPath, { pin: true });
    }
  }

})();
