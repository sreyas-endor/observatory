// Observatory — Terminal File Link Provider
// Detects file paths in xterm.js output and makes them clickable
// Opens files in the Observatory file viewer on click

(function () {
  'use strict';

  // Common source file extensions we want to detect
  const FILE_EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
    '.json', '.html', '.htm', '.css', '.scss', '.less',
    '.py', '.rs', '.go', '.rb', '.java', '.kt', '.swift',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.md', '.mdx', '.txt', '.yaml', '.yml', '.toml',
    '.sh', '.bash', '.zsh', '.fish',
    '.sql', '.graphql', '.gql',
    '.xml', '.svg', '.env', '.gitignore',
    '.lock', '.cfg', '.ini', '.conf',
  ]);

  // Match file paths like:
  //   src/foo/bar.ts
  //   src/foo/bar.ts:42
  //   /absolute/path/file.js:10
  //   ./relative/path.py
  // But avoid matching URLs, shell prompts, or random words
  const FILE_PATH_RE = /(?:\.\/|\.\.\/|\/)?(?:[\w@.-]+\/)*[\w@.-]+\.\w+(?::(\d+))?/g;

  function hasFileExtension(path) {
    // Strip :line suffix
    const clean = path.replace(/:\d+$/, '');
    const dot = clean.lastIndexOf('.');
    if (dot === -1) return false;
    return FILE_EXTENSIONS.has(clean.slice(dot).toLowerCase());
  }

  function extractPathAndLine(match) {
    const colonIdx = match.lastIndexOf(':');
    if (colonIdx > 0) {
      const afterColon = match.slice(colonIdx + 1);
      if (/^\d+$/.test(afterColon)) {
        return { path: match.slice(0, colonIdx), line: parseInt(afterColon, 10) };
      }
    }
    return { path: match, line: null };
  }

  // ── xterm.js Link Provider ──────────────────────────────────────────────

  // Register the link handler on an xterm instance
  // getCwd: () => string — returns the session's working directory
  function registerFileLinks(xterm, getCwd) {
    // Use xterm's registerLinkProvider for custom link detection
    xterm.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = getLineText(xterm, bufferLineNumber);
        if (!line) { callback(undefined); return; }

        const links = [];
        let match;
        FILE_PATH_RE.lastIndex = 0;

        while ((match = FILE_PATH_RE.exec(line)) !== null) {
          const fullMatch = match[0];
          if (!hasFileExtension(fullMatch)) continue;

          // Skip URLs
          const before = line.slice(Math.max(0, match.index - 8), match.index);
          if (/https?:\/\/$/.test(before) || /:\/\/$/.test(before)) continue;

          const startCol = match.index;
          const endCol = match.index + fullMatch.length;

          links.push({
            range: {
              start: { x: startCol + 1, y: bufferLineNumber },
              end: { x: endCol + 1, y: bufferLineNumber },
            },
            text: fullMatch,
            activate(_event, text) {
              openFileFromLink(text, getCwd);
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      }
    });

    // Fallback: Ctrl+Click / Cmd+Click on terminal text
    // This handles the case where mouse reporting is active (e.g. Claude Code)
    // and xterm's link provider can't intercept regular clicks.
    // Defer attachment until xterm.element exists (after xterm.open()).
    function attachClickHandler() {
      const el = xterm.element;
      if (!el) {
        // Not attached yet — retry after a short delay
        setTimeout(attachClickHandler, 500);
        return;
      }
      el.addEventListener('click', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;

        // Get the text under/near the click from the terminal buffer
        // Walk up to find which row was clicked
        const rowsEl = el.querySelector('.xterm-rows');
        if (!rowsEl) return;
        const rows = rowsEl.children;
        const clickY = e.clientY;
        let clickedRow = null;
        for (let i = 0; i < rows.length; i++) {
          const rect = rows[i].getBoundingClientRect();
          if (clickY >= rect.top && clickY <= rect.bottom) {
            clickedRow = rows[i];
            break;
          }
        }
        if (!clickedRow) return;
        const lineText = clickedRow.textContent || '';

        // Find file paths in this line
        FILE_PATH_RE.lastIndex = 0;
        let bestMatch = null;
        let bestDist = Infinity;
        let m;
        // Find the match closest to the click X position
        const clickX = e.clientX;
        const rowRect = clickedRow.getBoundingClientRect();
        const charWidth = rowRect.width / (lineText.length || 1);
        const clickCol = Math.round((clickX - rowRect.left) / charWidth);

        while ((m = FILE_PATH_RE.exec(lineText)) !== null) {
          if (!hasFileExtension(m[0])) continue;
          // Check if click is within or near this match
          const matchStart = m.index;
          const matchEnd = m.index + m[0].length;
          if (clickCol >= matchStart && clickCol <= matchEnd) {
            bestMatch = m[0];
            break;
          }
          const dist = Math.min(Math.abs(clickCol - matchStart), Math.abs(clickCol - matchEnd));
          if (dist < bestDist && dist < 3) {
            bestDist = dist;
            bestMatch = m[0];
          }
        }

        if (bestMatch) {
          e.preventDefault();
          e.stopPropagation();
          openFileFromLink(bestMatch, getCwd);
        }
      }, true);
    }
    attachClickHandler();
  }

  function openFileFromLink(text, getCwd) {
    const { path, line } = extractPathAndLine(text);
    const cwd = getCwd() || '';

    // Resolve relative path
    let fullPath = path;
    if (!path.startsWith('/')) {
      fullPath = cwd ? cwd + '/' + path : path;
    }

    console.log('[file-link] Opening:', fullPath, 'line:', line, 'cwd:', cwd);

    if (window.FileViewer) {
      window.FileViewer.open(fullPath, { line, pin: false });
    } else {
      console.warn('[file-link] FileViewer not loaded');
    }
  }

  function getLineText(xterm, lineNumber) {
    const buffer = xterm.buffer.active;
    if (lineNumber < 1 || lineNumber > buffer.length) return '';
    const line = buffer.getLine(lineNumber - 1);
    return line ? line.translateToString(true) : '';
  }

  // ── Expose globally ─────────────────────────────────────────────────────
  window.FileLinkProvider = { register: registerFileLinks };

})();
