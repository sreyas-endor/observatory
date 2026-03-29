// Observatory — Canvas 2D game engine
// Pixel-art office room with animated Metro City characters
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const TILE_SIZE   = 16;
  const CHAR_W      = 16;
  const CHAR_H      = 32;
  const WALK_SPEED  = 48;        // px/sec
  const WALK_FRAME_DUR  = 0.15;  // sec per walk frame
  const TYPE_FRAME_DUR  = 0.30;  // sec per type/read frame
  const WANDER_PAUSE_MIN = 1.5;
  const WANDER_PAUSE_MAX = 4.0;
  const CHAR_SITTING_OFFSET    = 6;   // px shift down when seated
  const BUBBLE_VERTICAL_OFFSET = 24;  // px above character y
  const MAX_DELTA              = 0.1; // cap delta time
  const CHARACTER_Z_SORT_OFFSET = 0.5;

  const STATE = { TYPE: 'type', IDLE: 'idle', WALK: 'walk', READ: 'read' };
  const DIR   = { DOWN: 'down', UP: 'up', RIGHT: 'right', LEFT: 'left' };

  // Famous dev names matched to sprite gender (char_1 and char_3 are female)
  const MAX_AGENTS = 4;
  const CHAR_SLOTS  = [0, 3, 4, 5];  // sprite indices: char_0, char_3, char_4, char_5
  const CHAR_NAMES  = ['Linus', 'Knuth', 'Carmack', 'Karpathy'];

  // Activity pill colours
  const ACTIVITY_COLORS = {
    prompt:   '#6c71c4',
    thinking: '#93a1a1',
    read:     '#268bd2',
    edit:     '#cb4b16',
    bash:     '#2aa198',
    input:    '#b58900',
    mcp:      '#d33682',
    error:    '#dc322f',
  };

  const LOG_ICONS = {
    prompt:   '>',  thinking: '...', read: 'r',
    edit:     'e',  bash:     '$',   mcp:  'm',
    input:    '?',  done:     'ok',  error:'!',
  };

  // ── Floor / wall colours ──────────────────────────────────────────────────
  const TILE_COLORS = { 0: '#3e4760', 5: '#c4a882', 7: '#c4a882', 1: '#8098b8', 9: '#687a9a' };

  // ── Furniture catalog ─────────────────────────────────────────────────────
  const FC = {
    'TABLE_FRONT':            { file: 'assets/furniture/TABLE_FRONT/TABLE_FRONT.png',                 fw:3, fh:4, pw:48, ph:64 },
    'COFFEE_TABLE':           { file: 'assets/furniture/COFFEE_TABLE/COFFEE_TABLE.png',               fw:2, fh:2, pw:32, ph:32 },
    'SOFA_SIDE':              { file: 'assets/furniture/SOFA/SOFA_SIDE.png',                          fw:1, fh:2, pw:16, ph:32 },
    'SOFA_BACK':              { file: 'assets/furniture/SOFA/SOFA_BACK.png',                          fw:2, fh:1, pw:32, ph:16 },
    'SOFA_FRONT':             { file: 'assets/furniture/SOFA/SOFA_FRONT.png',                         fw:2, fh:1, pw:32, ph:16 },
    'SOFA_SIDE:left':         { file: 'assets/furniture/SOFA/SOFA_SIDE.png',                          fw:1, fh:2, pw:16, ph:32, mirrored:true },
    'HANGING_PLANT':          { file: 'assets/furniture/HANGING_PLANT/HANGING_PLANT.png',             fw:1, fh:2, pw:16, ph:32 },
    'DOUBLE_BOOKSHELF':       { file: 'assets/furniture/DOUBLE_BOOKSHELF/DOUBLE_BOOKSHELF.png',       fw:2, fh:2, pw:32, ph:32 },
    'SMALL_PAINTING':         { file: 'assets/furniture/SMALL_PAINTING/SMALL_PAINTING.png',           fw:1, fh:2, pw:16, ph:32 },
    'SMALL_PAINTING_2':       { file: 'assets/furniture/SMALL_PAINTING_2/SMALL_PAINTING_2.png',       fw:1, fh:2, pw:16, ph:32 },
    'LARGE_PAINTING':         { file: 'assets/furniture/LARGE_PAINTING/LARGE_PAINTING.png',           fw:2, fh:2, pw:32, ph:32 },
    'CLOCK':                  { file: 'assets/furniture/CLOCK/CLOCK.png',                             fw:1, fh:2, pw:16, ph:32 },
    'PLANT':                  { file: 'assets/furniture/PLANT/PLANT.png',                             fw:1, fh:2, pw:16, ph:32 },
    'PLANT_2':                { file: 'assets/furniture/PLANT_2/PLANT_2.png',                         fw:1, fh:2, pw:16, ph:32 },
    'COFFEE':                 { file: 'assets/furniture/COFFEE/COFFEE.png',                           fw:1, fh:1, pw:16, ph:16 },
    'WOODEN_CHAIR_SIDE':      { file: 'assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png',          fw:1, fh:2, pw:16, ph:32 },
    'WOODEN_CHAIR_SIDE:left': { file: 'assets/furniture/WOODEN_CHAIR/WOODEN_CHAIR_SIDE.png',          fw:1, fh:2, pw:16, ph:32, mirrored:true },
    'DESK_FRONT':             { file: 'assets/furniture/DESK/DESK_FRONT.png',                         fw:3, fh:2, pw:48, ph:32, bgTiles:1 },
    'CUSHIONED_BENCH':        { file: 'assets/furniture/CUSHIONED_BENCH/CUSHIONED_BENCH.png',         fw:1, fh:1, pw:16, ph:16 },
    'PC_FRONT_OFF':           { file: 'assets/furniture/PC/PC_FRONT_OFF.png',                         fw:1, fh:2, pw:16, ph:32, bgTiles:1 },
    'PC_SIDE':                { file: 'assets/furniture/PC/PC_SIDE.png',                              fw:1, fh:2, pw:16, ph:32, bgTiles:1 },
    'PC_SIDE:left':           { file: 'assets/furniture/PC/PC_SIDE.png',                              fw:1, fh:2, pw:16, ph:32, mirrored:true, bgTiles:1 },
    'BIN':                    { file: 'assets/furniture/BIN/BIN.png',                                 fw:1, fh:1, pw:16, ph:16 },
    'SMALL_TABLE_FRONT':      { file: 'assets/furniture/SMALL_TABLE/SMALL_TABLE_FRONT.png',           fw:2, fh:2, pw:32, ph:32, bgTiles:1 },
    'SMALL_TABLE_SIDE':       { file: 'assets/furniture/SMALL_TABLE/SMALL_TABLE_SIDE.png',            fw:1, fh:3, pw:16, ph:48, bgTiles:1 },
  };

  // ── Seat definitions — one per corner room ────────────────────────────────
  const SEAT_DEFS = [
    { seatId: 'seat-0', col: 3, row: 14, dir: DIR.UP },
    { seatId: 'seat-1', col: 7, row: 14, dir: DIR.UP },
    { seatId: 'seat-2', col: 3, row: 16, dir: DIR.RIGHT, seatOffX: 0, seatOffY: -4 },
    { seatId: 'seat-3', col: 7, row: 16, dir: DIR.LEFT,  seatOffX: 0, seatOffY: -4 },
  ];


  // ── Sofa lounge spots — one per character slot, spread around the sofa U ──
  const LOUNGE_TABLE_SPOTS = [
    { col: 14, row: 12, dir: DIR.DOWN  },
    { col: 15, row: 12, dir: DIR.DOWN  },
    { col: 12, row: 15, dir: DIR.RIGHT },
    { col: 12, row: 16, dir: DIR.RIGHT },
    { col: 17, row: 15, dir: DIR.LEFT  },
    { col: 17, row: 16, dir: DIR.LEFT  },
  ];

  // ── Bubble pixel data ─────────────────────────────────────────────────────
  const BUBBLE_PERMISSION_DATA = {
    palette: { '_': null, 'B': '#555566', 'F': '#EEEEFF', 'A': '#CCA700' },
    pixels: [
      ['B','B','B','B','B','B','B','B','B','B','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','A','F','A','F','A','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','B','B','B','B','B','B','B','B','B','B'],
      ['_','_','_','_','B','B','B','_','_','_','_'],
      ['_','_','_','_','_','B','_','_','_','_','_'],
      ['_','_','_','_','_','_','_','_','_','_','_'],
    ]
  };

  const BUBBLE_SLEEPING_DATA = {
    palette: { '_': null, 'B': '#555566', 'F': '#EEEEFF', 'Z': '#7799DD' },
    pixels: [
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','Z','Z','Z','F','F','F','F','F','B'],
      ['B','F','F','Z','F','F','F','F','F','F','B'],
      ['B','F','Z','Z','Z','F','F','F','F','F','B'],
      ['B','F','F','F','F','Z','Z','Z','Z','F','B'],
      ['B','F','F','F','F','F','F','Z','F','F','B'],
      ['B','F','F','F','F','F','Z','F','F','F','B'],
      ['B','F','F','F','F','Z','Z','Z','Z','F','B'],
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['_','_','_','_','B','B','B','_','_','_','_'],
      ['_','_','_','_','_','B','_','_','_','_','_'],
      ['_','_','_','_','_','_','_','_','_','_','_'],
    ]
  };

  // ── Terminal theme (Ghostty default palette) ─────────────────────────────
  const TERMINAL_THEME = {
    background: '#282c34',
    foreground: '#ffffff',
    cursor: '#ffffff',
    cursorAccent: '#282c34',
    selectionBackground: 'rgba(255, 255, 255, 0.20)',
    selectionForeground: '#ffffff',
    black:   '#1d2021',
    red:     '#cc241d',
    green:   '#98971a',
    yellow:  '#d79921',
    blue:    '#458588',
    magenta: '#b16286',
    cyan:    '#689d6a',
    white:   '#a89984',
    brightBlack:   '#928374',
    brightRed:     '#fb4934',
    brightGreen:   '#b8bb26',
    brightYellow:  '#fabd2f',
    brightBlue:    '#83a598',
    brightMagenta: '#d3869b',
    brightCyan:    '#8ec07c',
    brightWhite:   '#ebdbb2',
  };

  // ── Module state ──────────────────────────────────────────────────────────
  let canvas, ctx;
  let zoom = 3;
  let layout = null;
  let tileMap = [];
  let blockedTiles = new Set();
  let walkableTiles = [];
  let furnitureInstances = [];
  let characters = new Map();    // sessionId → character obj
  let charSprites = [];          // per-palette → { down, up, right, left }
  let charFaceCanvases = [];     // per-palette → 16×14 head crop canvas
  let furnitureImages = {};      // file → HTMLImageElement
  let floorImages = {};          // tile index → HTMLImageElement
  let bubblePermissionCanvas = null;
  let bubbleSleepingCanvas   = null;
  let seatAssignments = new Map(); // seatId → sessionId
  let ws = null;
  let assetsLoaded = false;
  let lastTimestamp = null;
  let charSlotCounter = 0;
  let allSessions = [];          // latest session list from server

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const sessionLogs = new Map(); // sessionId → LogEntry[]
  let activePanelId = null;

  // ── Terminal state ──────────────────────────────────────────────────────
  const openTerminals = new Map(); // terminalId → { xterm, ws, fitAddon, name, sessionId }
  const sessionTerminals = new Map(); // sessionId → terminalId
  let activeTerminalId = null;

  function nextAvailableName() {
    const usedNames = new Set();
    for (const [, t] of openTerminals) usedNames.add(t.name);
    for (const name of CHAR_NAMES) {
      if (!usedNames.has(name)) return name;
    }
    // All names taken — append a number
    return CHAR_NAMES[0] + ' ' + (openTerminals.size + 1);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function randRange(min, max) { return min + Math.random() * (max - min); }

  function tileCenter(col, row) {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  function loungeSpot(ch) {
    return LOUNGE_TABLE_SPOTS[ch.palette % LOUNGE_TABLE_SPOTS.length];
  }

  function dirBetween(fc, fr, tc, tr) {
    const dc = tc - fc, dr = tr - fr;
    if (dc > 0) return DIR.RIGHT;
    if (dc < 0) return DIR.LEFT;
    if (dr > 0) return DIR.DOWN;
    return DIR.UP;
  }

  // ── BFS pathfinding ───────────────────────────────────────────────────────
  function isWalkable(col, row) {
    if (row < 0 || row >= tileMap.length) return false;
    if (col < 0 || col >= tileMap[0].length) return false;
    const t = tileMap[row][col];
    if (t === 255 || t === 0) return false;
    return !blockedTiles.has(`${col},${row}`);
  }

  function findPath(sc, sr, ec, er) {
    if (sc === ec && sr === er) return [];
    if (!isWalkable(ec, er)) return [];
    const key = (c, r) => `${c},${r}`;
    const visited = new Set([key(sc, sr)]);
    const parent  = new Map();
    const queue   = [{ col: sc, row: sr }];
    const dirs4   = [{dc:0,dr:-1},{dc:0,dr:1},{dc:-1,dr:0},{dc:1,dr:0}];
    while (queue.length) {
      const curr = queue.shift();
      if (curr.col === ec && curr.row === er) {
        const path = [];
        let k = key(ec, er);
        const sk = key(sc, sr);
        while (k !== sk) {
          const [c, r] = k.split(',').map(Number);
          path.unshift({ col: c, row: r });
          k = parent.get(k);
        }
        return path;
      }
      const ck = key(curr.col, curr.row);
      for (const d of dirs4) {
        const nc = curr.col + d.dc, nr = curr.row + d.dr;
        const nk = key(nc, nr);
        if (visited.has(nk) || !isWalkable(nc, nr)) continue;
        visited.add(nk);
        parent.set(nk, ck);
        queue.push({ col: nc, row: nr });
      }
    }
    return [];
  }

  // ── Sprite frame extraction ───────────────────────────────────────────────
  // char_N.png: 112×96, 7 cols × 3 rows, each frame 16×32
  // Row 0=DOWN, Row 1=UP, Row 2=RIGHT
  // Cols: 0–2=walk, 3–4=type, 5–6=read
  function extractFrame(img, dirRow, col) {
    const oc = document.createElement('canvas');
    oc.width = CHAR_W; oc.height = CHAR_H;
    const c = oc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, col * CHAR_W, dirRow * CHAR_H, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
    return oc;
  }

  function flipCanvas(src) {
    const oc = document.createElement('canvas');
    oc.width = src.width; oc.height = src.height;
    const c = oc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.translate(src.width, 0);
    c.scale(-1, 1);
    c.drawImage(src, 0, 0);
    return oc;
  }

  function buildFaceCanvas(img) {
    const FACE_H = 22; // full head + face (hair, eyes, mouth)
    const oc = document.createElement('canvas');
    oc.width = CHAR_W; oc.height = FACE_H;
    const c = oc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, CHAR_W, FACE_H, 0, 0, CHAR_W, FACE_H);
    return oc;
  }

  function buildCharSprites(img) {
    const build = (dirRow) => {
      const f = (col) => extractFrame(img, dirRow, col);
      return { walk: [f(0), f(1), f(2), f(1)], typing: [f(3), f(4)], reading: [f(5), f(6)] };
    };
    const flip = (s) => ({
      walk: s.walk.map(flipCanvas), typing: s.typing.map(flipCanvas), reading: s.reading.map(flipCanvas),
    });
    const right = build(2);
    return { [DIR.DOWN]: build(0), [DIR.UP]: build(1), [DIR.RIGHT]: right, [DIR.LEFT]: flip(right) };
  }

  // ── Bubble canvas builder ─────────────────────────────────────────────────
  function buildBubbleCanvas(data) {
    const rows = data.pixels;
    const h = rows.length, w = rows[0].length;
    const bc = document.createElement('canvas');
    bc.width = w; bc.height = h;
    const c = bc.getContext('2d');
    for (let r = 0; r < h; r++) {
      for (let col = 0; col < w; col++) {
        const color = data.palette[rows[r][col]];
        if (color) { c.fillStyle = color; c.fillRect(col, r, 1, 1); }
      }
    }
    return bc;
  }

  // ── Asset loading ─────────────────────────────────────────────────────────
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Tint a grayscale image by multiplying each pixel's brightness against a warm color.
  // r/g/b are 0–255 target hue; the gray value scales the brightness.
  function tintImage(img, r, g, b) {
    const oc = document.createElement('canvas');
    oc.width = img.width; oc.height = img.height;
    const c = oc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, oc.width, oc.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const gray = d.data[i] / 255;
      d.data[i]   = Math.round(r * gray);
      d.data[i+1] = Math.round(g * gray);
      d.data[i+2] = Math.round(b * gray);
    }
    c.putImageData(d, 0, 0);
    return oc;
  }

  async function loadAssets() {
    const charImgs = await Promise.all(
      Array.from({ length: 6 }, (_, i) => loadImage(`assets/characters/char_${i}.png`))
    );
    charSprites      = charImgs.map(img => img ? buildCharSprites(img) : null);
    charFaceCanvases = charImgs.map(img => img ? buildFaceCanvas(img) : null);

    await Promise.all(
      [0, 1, 5].map(i =>
        loadImage(`assets/floors/floor_${i}.png`).then(img => { floorImages[i] = img; })
      )
    );
    // Warm wood tint on planks
    if (floorImages[5]) floorImages[5] = tintImage(floorImages[5], 210, 175, 130);

    const filesToLoad = new Set();
    for (const f of (layout?.furniture || [])) {
      const cat = FC[f.type];
      if (cat) filesToLoad.add(cat.file);
    }
    await Promise.all([...filesToLoad].map(file =>
      loadImage(file).then(img => { furnitureImages[file] = img; })
    ));

    bubblePermissionCanvas = buildBubbleCanvas(BUBBLE_PERMISSION_DATA);
    bubbleSleepingCanvas   = buildBubbleCanvas(BUBBLE_SLEEPING_DATA);
    assetsLoaded = true;
  }

  // ── Layout parsing ────────────────────────────────────────────────────────
  function buildTileMap(layoutData) {
    const { cols, rows, tiles } = layoutData;
    tileMap = [];
    for (let r = 0; r < rows; r++) {
      tileMap.push(Array.from(tiles.slice(r * cols, r * cols + cols)));
    }
  }

  function buildBlockedTiles(layoutData) {
    blockedTiles = new Set();
    const seatKeys = new Set(SEAT_DEFS.map(s => `${s.col},${s.row}`));
    for (const f of layoutData.furniture) {
      const cat = FC[f.type];
      if (!cat) continue;
      const bgTiles = cat.bgTiles || 0;
      for (let dr = bgTiles; dr < cat.fh; dr++) {
        for (let dc = 0; dc < cat.fw; dc++) {
          const key = `${f.col + dc},${f.row + dr}`;
          if (!seatKeys.has(key)) blockedTiles.add(key);
        }
      }
    }
  }

  function buildWalkableTiles() {
    walkableTiles = [];
    for (let r = 0; r < tileMap.length; r++) {
      for (let c = 0; c < tileMap[r].length; c++) {
        if (isWalkable(c, r)) walkableTiles.push({ col: c, row: r });
      }
    }
  }

  function buildLoungeTiles() {
    return walkableTiles.filter(t => t.col >= 11 && t.col <= 18 && t.row >= 11 && t.row <= 20);
  }

  function buildLeftRoomTiles() {
    return walkableTiles.filter(t => t.col >= 1 && t.col <= 9 && t.row >= 11 && t.row <= 20);
  }

  function buildFurnitureInstances(layoutData) {
    furnitureInstances = [];
    for (const f of layoutData.furniture) {
      const cat = FC[f.type];
      if (!cat) continue;
      const img = furnitureImages[cat.file];
      const x   = f.col * TILE_SIZE;
      const y   = (f.row + cat.fh) * TILE_SIZE - cat.ph;
      const zY  = (f.row + cat.fh) * TILE_SIZE;
      furnitureInstances.push({ x, y, img, mirrored: !!cat.mirrored, pw: cat.pw, ph: cat.ph, zY });
    }
  }

  function getSeatOffset(ch) {
    if (ch.state !== STATE.TYPE) return { x: 0, y: 0 };
    const seat = ch.seatId ? SEAT_DEFS.find(s => s.seatId === ch.seatId) : null;
    if (seat && (seat.seatOffX || seat.seatOffY)) {
      return { x: seat.seatOffX || 0, y: seat.seatOffY || 0 };
    }
    return { x: 0, y: CHAR_SITTING_OFFSET };
  }

  // ── Character management ──────────────────────────────────────────────────
  function createCharacter(sessionId, type, seatId, isActive) {
    const seat = SEAT_DEFS.find(s => s.seatId === seatId) || null;
    let col, row;
    if (seat) {
      col = seat.col; row = seat.row;
    } else if (walkableTiles.length) {
      const t = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
      col = t.col; row = t.row;
    } else {
      col = 1; row = 11;
    }
    const center  = tileCenter(col, row);
    const slot = charSlotCounter % MAX_AGENTS;
    const palette = CHAR_SLOTS[slot];
    charSlotCounter++;
    return {
      sessionId, type, seatId,
      name:     CHAR_NAMES[slot],
      palette,
      state:    STATE.TYPE,
      dir:      seat ? seat.dir : DIR.DOWN,
      x: center.x, y: center.y,
      tileCol: col, tileRow: row,
      path: [], moveProgress: 0,
      isActive,
      isReading:  false,
      needsInput: false,
      bubbleType: null,
      frame: 0, frameTimer: 0,
      wanderTimer: 0,
      seatTimer: 0,
      stateChangedAt: Date.now(),
      startedAt: Date.now(),
    };
  }

  function assignSeat() {
    for (const seat of SEAT_DEFS) {
      if (!seatAssignments.has(seat.seatId)) return seat.seatId;
    }
    return null;
  }

  function walkTo(ch, col, row, dir) {
    const path = findPath(ch.tileCol, ch.tileRow, col, row);
    if (path.length > 0) {
      ch.path = path; ch.moveProgress = 0;
      ch.state = STATE.WALK; ch.frame = 0; ch.frameTimer = 0;
    } else if (ch.tileCol === col && ch.tileRow === row) {
      ch.dir = dir; ch.state = STATE.IDLE; ch.frame = 0;
    }
  }

  function applySessionState(ch, state) {
    const wasActive     = ch.isActive;
    const wasNeedsInput = ch.needsInput;

    switch (state) {
      case 'thinking':
      case 'editing':
      case 'running':
      case 'mcp':
        ch.isActive   = true;
        ch.isReading  = false;
        ch.needsInput = false;
        ch.bubbleType = null;
        break;
      case 'reading':
        ch.isActive   = true;
        ch.isReading  = true;
        ch.needsInput = false;
        ch.bubbleType = null;
        break;
      case 'input':
        ch.isActive   = true;
        ch.isReading  = false;
        ch.needsInput = true;
        ch.bubbleType = 'permission';
        break;
      case 'waiting':
        ch.isActive   = false;
        ch.isReading  = false;
        ch.needsInput = false;
        ch.bubbleType = null;
        break;
      case 'error':
        ch.isActive   = false;
        ch.isReading  = false;
        ch.needsInput = false;
        ch.bubbleType = 'permission';
        break;
      default: // idle — PostToolUse, still mid-session
        ch.isActive   = true;
        ch.isReading  = false;
        ch.needsInput = false;
        ch.bubbleType = null;
        break;
    }

    // Just started needing input → get up and wander
    if (!wasNeedsInput && ch.needsInput && ch.seatId) {
      ch.wanderTimer = 0;
      ch.state = STATE.IDLE;
      ch.frame = 0; ch.frameTimer = 0;
    }

    // Input answered → walk back to desk
    if (wasNeedsInput && !ch.needsInput && ch.isActive && ch.seatId) {
      const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
      if (seat) walkTo(ch, seat.col, seat.row, seat.dir);
    }

    // Became inactive → start wander phase (left room if terminal open, lounge otherwise)
    if (wasActive && !ch.isActive) {
      ch.stateChangedAt = Date.now();
      ch.wanderTimer = 0;
      const termOpen = document.getElementById('terminal-panel').classList.contains('open');
      const restTiles = termOpen ? buildLeftRoomTiles() : buildLoungeTiles();
      if (restTiles.length > 0) {
        const t = restTiles[Math.floor(Math.random() * restTiles.length)];
        walkTo(ch, t.col, t.row, ch.dir);
      }
    }

    // Became active again → reset coding timer
    if (!wasActive && ch.isActive) {
      ch.stateChangedAt = Date.now();
      ch.bubbleType = null;
    }

    // Back at desk but not seated → repath
    if (!wasActive && ch.isActive && !ch.needsInput && ch.state !== STATE.TYPE && ch.seatId) {
      const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
      if (seat) walkTo(ch, seat.col, seat.row, seat.dir);
    }

    // Was typing and became inactive → skip seat timer
    if (wasActive && !ch.isActive && ch.state === STATE.TYPE) {
      ch.seatTimer = -1;
    }
  }

  function syncSessions(newSessions) {
    const newIds = new Set(newSessions.map(s => s.id));

    // Remove stale characters
    for (const id of [...characters.keys()]) {
      if (!newIds.has(id)) {
        const ch = characters.get(id);
        if (ch?.seatId) seatAssignments.delete(ch.seatId);
        characters.delete(id);
        if (id === activePanelId) closePanel();
      }
    }

    // Add / update
    for (const session of newSessions) {
      let ch = characters.get(session.id);
      if (!ch) {
        if (characters.size >= MAX_AGENTS) continue; // cap at 4 agents
        const seatId = assignSeat();
        // Initialize isActive correctly so applySessionState sees no fake transition
        const active = !['waiting', 'error'].includes(session.state);
        ch = createCharacter(session.id, session.type, seatId, active);
        characters.set(session.id, ch);
        if (seatId) seatAssignments.set(seatId, session.id);
      }
      ch.startedAt = session.startedAt || ch.startedAt || Date.now();
      applySessionState(ch, session.state);
      // Always use server's stateChangedAt — it's authoritative for timer display
      if (session.stateChangedAt) ch.stateChangedAt = session.stateChangedAt;
      // Auto-link session to its terminal (session id = terminal id)
      if (session.terminalId && openTerminals.has(session.terminalId)) {
        const term = openTerminals.get(session.terminalId);
        if (!term.sessionId) {
          term.sessionId = session.id;
          sessionTerminals.set(session.id, session.terminalId);
        }
      }
    }
  }

  // ── Character update (state machine) ─────────────────────────────────────
  function updateCharacter(ch, dt) {
    ch.frameTimer += dt;

    switch (ch.state) {
      case STATE.TYPE: {
        if (ch.frameTimer >= TYPE_FRAME_DUR) {
          ch.frameTimer -= TYPE_FRAME_DUR;
          ch.frame = (ch.frame + 1) % 2;
        }
        if (!ch.isActive) {
          if (ch.seatTimer > 0) { ch.seatTimer -= dt; break; }
          ch.state = STATE.IDLE;
          ch.frame = 0; ch.frameTimer = 0;
          ch.wanderTimer = randRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
        }
        break;
      }

      case STATE.READ: {
        if (ch.frameTimer >= TYPE_FRAME_DUR) {
          ch.frameTimer -= TYPE_FRAME_DUR;
          ch.frame = (ch.frame + 1) % 2;
        }
        ch.dir = loungeSpot(ch).dir;
        if (!ch.needsInput) {
          ch.state = STATE.IDLE; ch.frame = 0; ch.frameTimer = 0;
        }
        break;
      }

      case STATE.IDLE: {
        ch.frame = 0;
        if (ch.isActive) {
          if (!ch.seatId) {
            ch.state = STATE.TYPE; ch.frame = 0; ch.frameTimer = 0;
            break;
          }
          const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
          if (seat) {
            const path = findPath(ch.tileCol, ch.tileRow, seat.col, seat.row);
            if (path.length > 0) {
              ch.path = path; ch.moveProgress = 0;
              ch.state = STATE.WALK; ch.frame = 0; ch.frameTimer = 0;
            } else {
              ch.state = STATE.TYPE; ch.dir = seat.dir; ch.frame = 0; ch.frameTimer = 0;
            }
          }
          break;
        }
        // Inactive — phase 1: wander (0–5 min), phase 2: sleep (5–15 min)
        // When terminal overlay is open, confine to corner zone
        const inactiveSecs = ch.stateChangedAt ? (Date.now() - ch.stateChangedAt) / 1000 : 0;
        if (inactiveSecs < 5 * 60) {
          ch.bubbleType = null;
          ch.wanderTimer -= dt;
          if (ch.wanderTimer <= 0) {
            const termOpen = document.getElementById('terminal-panel').classList.contains('open');
            const restTiles = termOpen ? buildLeftRoomTiles() : buildLoungeTiles();
            if (restTiles.length > 0) {
              const t = restTiles[Math.floor(Math.random() * restTiles.length)];
              walkTo(ch, t.col, t.row, ch.dir);
            }
            ch.wanderTimer = randRange(3, 7);
          }
        } else {
          const termOpen = document.getElementById('terminal-panel').classList.contains('open');
          if (termOpen) {
            // Sleep in the left room when terminal is open
            const leftTiles = buildLeftRoomTiles();
            if (leftTiles.length > 0) {
              const inLeft = ch.tileCol >= 1 && ch.tileCol <= 9;
              if (!inLeft) {
                const t = leftTiles[Math.floor(Math.random() * leftTiles.length)];
                walkTo(ch, t.col, t.row, ch.dir);
              } else {
                if (ch.bubbleType !== 'sleeping') ch.bubbleType = 'sleeping';
              }
            }
          } else {
            const spot = loungeSpot(ch);
            if (ch.tileCol !== spot.col || ch.tileRow !== spot.row) {
              walkTo(ch, spot.col, spot.row, spot.dir);
            } else {
              ch.dir = spot.dir;
              if (ch.bubbleType !== 'sleeping') ch.bubbleType = 'sleeping';
            }
          }
        }
        break;
      }

      case STATE.WALK: {
        if (ch.frameTimer >= WALK_FRAME_DUR) {
          ch.frameTimer -= WALK_FRAME_DUR;
          ch.frame = (ch.frame + 1) % 4;
        }
        if (ch.path.length === 0) {
          const center = tileCenter(ch.tileCol, ch.tileRow);
          ch.x = center.x; ch.y = center.y;
          if (ch.isActive) {
            if (ch.needsInput) {
              ch.state = STATE.READ;
            } else if (!ch.seatId) {
              ch.state = STATE.TYPE;
            } else {
              const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
              ch.state = (seat && ch.tileCol === seat.col && ch.tileRow === seat.row)
                ? STATE.TYPE : STATE.IDLE;
              if (seat && ch.state === STATE.TYPE) ch.dir = seat.dir;
            }
          } else {
            ch.state = STATE.IDLE;
          }
          ch.frame = 0; ch.frameTimer = 0;
          break;
        }
        const next = ch.path[0];
        ch.dir = dirBetween(ch.tileCol, ch.tileRow, next.col, next.row);
        ch.moveProgress += (WALK_SPEED / TILE_SIZE) * dt;
        const from = tileCenter(ch.tileCol, ch.tileRow);
        const to   = tileCenter(next.col, next.row);
        const t = Math.min(ch.moveProgress, 1);
        ch.x = from.x + (to.x - from.x) * t;
        ch.y = from.y + (to.y - from.y) * t;
        if (ch.moveProgress >= 1) {
          ch.tileCol = next.col; ch.tileRow = next.row;
          ch.x = to.x; ch.y = to.y;
          ch.path.shift(); ch.moveProgress = 0;
        }
        // Repath to seat if became active mid-wander
        if (ch.isActive && !ch.needsInput && ch.seatId) {
          const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
          if (seat) {
            const last = ch.path[ch.path.length - 1];
            if (!last || last.col !== seat.col || last.row !== seat.row) {
              const newPath = findPath(ch.tileCol, ch.tileRow, seat.col, seat.row);
              if (newPath.length > 0) { ch.path = newPath; ch.moveProgress = 0; }
            }
          }
        }
        break;
      }
    }
  }

  // ── Sprite selection ──────────────────────────────────────────────────────
  function getCharSprite(ch) {
    const sprites = charSprites[ch.palette];
    if (!sprites) return null;
    const dirSprites = sprites[ch.dir] || sprites[DIR.DOWN];
    switch (ch.state) {
      case STATE.TYPE:
        return ch.isReading
          ? dirSprites.reading[ch.frame % 2]
          : dirSprites.typing[ch.frame % 2];
      case STATE.READ:  return dirSprites.reading[ch.frame % 2];
      case STATE.WALK:  return dirSprites.walk[ch.frame % 4];
      default:          return dirSprites.walk[1];
    }
  }

  // ── Visible bounds ────────────────────────────────────────────────────────
  let visMinCol = 0, visMinRow = 0, visMaxCol = 0, visMaxRow = 0;

  function computeVisBounds() {
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (let r = 0; r < tileMap.length; r++) {
      for (let c = 0; c < tileMap[r].length; c++) {
        if (tileMap[r][c] !== 255) {
          if (r < minR) minR = r; if (r > maxR) maxR = r;
          if (c < minC) minC = c; if (c > maxC) maxC = c;
        }
      }
    }
    visMinRow = minR === Infinity  ? 0 : minR;
    visMaxRow = maxR === -Infinity ? (tileMap.length - 1) : maxR;
    visMinCol = minC === Infinity  ? 0 : minC;
    visMaxCol = maxC === -Infinity ? (tileMap[0].length - 1) : maxC;
  }

  // ── Zoom / offset ─────────────────────────────────────────────────────────
  function computeZoom() {
    if (!layout) return;
    const visCols = visMaxCol - visMinCol + 1;
    const visRows = visMaxRow - visMinRow + 1;
    zoom = Math.min(canvas.width / (visCols * TILE_SIZE), canvas.height / (visRows * TILE_SIZE));
  }

  function computeOffset() {
    if (!layout) return { offsetX: 0, offsetY: 0 };
    const visCols = visMaxCol - visMinCol + 1;
    const visRows = visMaxRow - visMinRow + 1;
    return {
      offsetX: Math.floor((canvas.width  - visCols * TILE_SIZE * zoom) / 2) - visMinCol * TILE_SIZE * zoom,
      offsetY: Math.floor((canvas.height - visRows * TILE_SIZE * zoom) / 2) - visMinRow * TILE_SIZE * zoom,
    };
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────
  function pill(cx, y, label, bgColor, textColor, fs, px, py) {
    const pillH = fs + py * 2;
    const tw    = ctx.measureText(label).width;
    const pillW = tw + px * 2;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(cx - pillW / 2, y, pillW, pillH, 4);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(label, cx, y + py);
    return pillH;
  }

  function drawCharHUD(ch, cx, drawY) {
    const fs  = Math.max(11, Math.round(11 * zoom / 3));
    const px  = Math.max(5,  Math.round(5  * zoom / 3));
    const py  = Math.max(3,  Math.round(3  * zoom / 3));
    const gap = Math.max(3,  Math.round(3  * zoom / 3));
    ctx.font = `bold ${fs}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    const bubbleTop = ch.bubbleType
      ? drawY - Math.round((BUBBLE_VERTICAL_OFFSET - CHAR_H + 14) * zoom)
      : drawY;
    let curY = bubbleTop - gap;

    // Activity pill — when actively coding or awaiting input
    if (ch.needsInput) {
      curY -= (fs + py * 2);
      ctx.globalAlpha = 0.9;
      pill(cx, curY, '...', ACTIVITY_COLORS.input, '#ffffff', fs, px, py);
      ctx.globalAlpha = 1;
      curY -= gap;
    } else {
      const entries = sessionLogs.get(ch.sessionId) || [];
      const latest  = (ch.isActive && ch.state === STATE.TYPE && entries.length)
                      ? entries[entries.length - 1] : null;
      if (latest && latest.kind !== 'done') {
        const icon   = LOG_ICONS[latest.kind] ?? '.';
        const detail = latest.detail ? latest.detail.slice(0, 20) : latest.kind;
        const label  = latest.kind === 'thinking' ? '...' : icon + ': ' + detail;
        curY -= (fs + py * 2);
        ctx.globalAlpha = 0.9;
        pill(cx, curY, label, ACTIVITY_COLORS[latest.kind] ?? '#6c71c4', '#ffffff', fs, px, py);
        ctx.globalAlpha = 1;
        curY -= gap;
      }
    }

    // Timer pill
    const elapsed = ch.stateChangedAt ? (Date.now() - ch.stateChangedAt) / 1000 : 0;
    let timerLabel, timerColor;
    if (ch.isActive) {
      timerLabel = 'coding '  + fmtDuration(elapsed);        timerColor = '#2aa198';
    } else if (elapsed < 5 * 60) {
      timerLabel = 'idle '    + fmtDuration(elapsed);        timerColor = '#93a1a1';
    } else {
      timerLabel = 'asleep '  + fmtDuration(elapsed - 5*60); timerColor = '#6c71c4';
    }
    curY -= (fs + py * 2);
    pill(cx, curY, timerLabel, 'rgba(0,0,0,0.85)', timerColor, fs, px, py);
  }

  function drawNameTag(ch, cx, footY) {
    const fs  = Math.max(9, Math.round(9 * zoom / 3));
    const px  = Math.max(4, Math.round(4 * zoom / 3));
    const py  = Math.max(2, Math.round(2 * zoom / 3));
    const gap = Math.max(2, Math.round(2 * zoom / 3));
    ctx.font = `bold ${fs}px "Courier New", monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const bg = ch.type === 'claude' ? 'rgba(210,90,40,0.88)' : 'rgba(0,0,0,0.82)';
    pill(cx, footY + gap, ch.name, bg, '#ffffff', fs, px, py);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderTiles(offsetX, offsetY) {
    const s = TILE_SIZE * zoom;
    for (let r = 0; r < tileMap.length; r++) {
      for (let c = 0; c < tileMap[r].length; c++) {
        const tile = tileMap[r][c];
        if (tile === 255) continue;
        const x = offsetX + c * s;
        const y = offsetY + r * s;
        const floorImg = tile !== 0 ? floorImages[tile] : null;
        if (floorImg) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(floorImg, x, y, s, s);
        } else {
          ctx.fillStyle = TILE_COLORS[tile] || '#333';
          ctx.fillRect(x, y, s, s);
        }
      }
    }
  }

  function renderScene(offsetX, offsetY) {
    const drawables = [];

    for (const f of furnitureInstances) {
      if (!f.img) continue;
      const fx = offsetX + f.x * zoom;
      const fy = offsetY + f.y * zoom;
      const fw = f.pw * zoom;
      const fh = f.ph * zoom;
      if (f.mirrored) {
        drawables.push({ zY: f.zY, draw: () => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(fx + fw, fy);
          ctx.scale(-1, 1);
          ctx.drawImage(f.img, 0, 0, fw, fh);
          ctx.restore();
        }});
      } else {
        drawables.push({ zY: f.zY, draw: () => {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(f.img, fx, fy, fw, fh);
        }});
      }
    }

    for (const ch of characters.values()) {
      const sprite = getCharSprite(ch);
      if (!sprite) continue;
      const seatOff = getSeatOffset(ch);
      const sw    = CHAR_W * zoom;
      const sh    = CHAR_H * zoom;
      const drawX = Math.round(offsetX + (ch.x + seatOff.x) * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + seatOff.y) * zoom - sh);
      const footY = Math.round(offsetY + (ch.y + seatOff.y) * zoom);
      const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;
      const cx    = Math.round(offsetX + (ch.x + seatOff.x) * zoom);

      drawables.push({ zY: charZY, draw: () => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, drawX, drawY, sw, sh);
      }});

      drawables.push({ zY: charZY + 0.005, draw: () => drawCharHUD(ch, cx, drawY) });
      drawables.push({ zY: charZY + 0.01,  draw: () => drawNameTag(ch, cx, footY) });
    }

    drawables.sort((a, b) => a.zY - b.zY);
    for (const d of drawables) d.draw();
  }

  function renderBubbles(offsetX, offsetY) {
    for (const ch of characters.values()) {
      if (!ch.bubbleType) continue;
      const bubbleSrc = ch.bubbleType === 'sleeping' ? bubbleSleepingCanvas : bubblePermissionCanvas;
      if (!bubbleSrc) continue;

      const seatOff = getSeatOffset(ch);
      const bw = bubbleSrc.width  * zoom;
      const bh = bubbleSrc.height * zoom;
      const bx = Math.round(offsetX + (ch.x + seatOff.x) * zoom - bw / 2);
      const by = Math.round(offsetY + (ch.y + seatOff.y - BUBBLE_VERTICAL_OFFSET) * zoom - bh - zoom);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bubbleSrc, bx, by, bw, bh);
    }
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  function renderFrame(ts) {
    requestAnimationFrame(renderFrame);
    if (!assetsLoaded || !layout) return;

    const dt = lastTimestamp === null ? 0 : Math.min((ts - lastTimestamp) / 1000, MAX_DELTA);
    lastTimestamp = ts;

    for (const ch of characters.values()) updateCharacter(ch, dt);

    ctx.fillStyle = '#3e4760';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const { offsetX, offsetY } = computeOffset();
    renderTiles(offsetX, offsetY);
    renderScene(offsetX, offsetY);
    renderBubbles(offsetX, offsetY);
  }

  // ── Hit testing ───────────────────────────────────────────────────────────
  function getCharacterAt(px, py) {
    const { offsetX, offsetY } = computeOffset();
    for (const [id, ch] of characters.entries()) {
      const seatOff = getSeatOffset(ch);
      const sw    = CHAR_W * zoom;
      const sh    = CHAR_H * zoom;
      const drawX = Math.round(offsetX + (ch.x + seatOff.x) * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + seatOff.y) * zoom - sh);
      if (px >= drawX && px <= drawX + sw && py >= drawY && py <= drawY + sh) {
        return { id, ch };
      }
    }
    return null;
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────
  function fmtDuration(secs) {
    secs = Math.floor(secs);
    if (secs < 60) return secs + 's';
    const h  = Math.floor(secs / 3600);
    const m  = Math.floor((secs % 3600) / 60);
    const s  = secs % 60;
    const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function buildLogRow(entry) {
    const row = document.createElement('div');
    row.className = `log-row lk-${entry.kind}`;
    row.innerHTML =
      `<span class="log-ts">${fmtTime(entry.ts)}</span>` +
      `<span class="log-icon">${LOG_ICONS[entry.kind] ?? '·'}</span>` +
      `<span class="log-text">${entry.detail ? escHtml(entry.detail) : entry.kind}</span>`;
    return row;
  }

  function openPanel(sessionId) {
    activePanelId = sessionId;
  }

  function closePanel() {
    activePanelId = null;
  }

  function appendToPanel(sessionId, entry) {
    const entries = sessionLogs.get(sessionId) || [];
    entries.push(entry);
    sessionLogs.set(sessionId, entries);

    if (sessionId !== activePanelId) return;
    const logEl  = document.getElementById('panel-log');
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;

    if (entry.kind === 'prompt' && logEl.children.length > 0) {
      const sep = document.createElement('hr');
      sep.className = 'log-sep';
      logEl.appendChild(sep);
    }
    logEl.appendChild(buildLogRow(entry));
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }

  // ── FAB menu ──────────────────────────────────────────────────────────────
  const FAB_SLOTS = 4; // max agents shown in FAB

  function updateFabMenu() {
    const menu = document.getElementById('fab-menu');
    if (!menu) return;
    menu.innerHTML = '';

    for (let i = 0; i < FAB_SLOTS; i++) {
      const name = CHAR_NAMES[i] || `Agent ${i + 1}`;

      // Find if this agent slot has a running terminal (client-side)
      let termEntry = null;
      let sessionEntry = null;
      for (const [tid, t] of openTerminals) {
        if (t.name === name) { termEntry = { terminalId: tid, ...t }; break; }
      }
      if (termEntry && termEntry.sessionId) {
        sessionEntry = allSessions.find(s => s.id === termEntry.sessionId);
      }

      // Fallback: check if a character with this name exists with a server-side terminal (e.g. after reload)
      let serverSession = null;
      if (!termEntry) {
        for (const [, ch] of characters) {
          if (ch.name === name) {
            const session = allSessions.find(s => s.id === ch.sessionId && s.terminalId);
            if (session) { serverSession = session; break; }
          }
        }
      }

      const isActive = !!(sessionEntry || serverSession);
      const hasTerminal = !!(termEntry || serverSession);

      const card = document.createElement('div');
      card.className = `fab-agent${isActive ? ' active' : ''}${!hasTerminal ? ' inactive' : ''}`;

      // Face sprite
      const faceWrap = document.createElement('div');
      faceWrap.className = 'fab-agent-face';
      const faceCanvas = charFaceCanvases[CHAR_SLOTS[i]];
      if (faceCanvas) {
        const dc = document.createElement('canvas');
        dc.width = 36; dc.height = 36;
        const dctx = dc.getContext('2d');
        dctx.imageSmoothingEnabled = false;
        // Draw full face sprite centered, preserving aspect ratio
        const srcW = faceCanvas.width, srcH = faceCanvas.height;
        const scale = Math.min(36 / srcW, 36 / srcH);
        const dstW = Math.round(srcW * scale);
        const dstH = Math.round(srcH * scale);
        dctx.drawImage(faceCanvas, 0, 0, srcW, srcH,
          Math.round((36 - dstW) / 2), Math.round((36 - dstH) / 2), dstW, dstH);
        faceWrap.appendChild(dc);
      }
      card.appendChild(faceWrap);

      // Name + status
      const info = document.createElement('div');
      info.className = 'fab-agent-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'fab-agent-name';
      nameEl.textContent = name;
      info.appendChild(nameEl);
      const statusEl = document.createElement('div');
      const isRunning = isActive || hasTerminal;
      statusEl.className = 'fab-agent-status ' + (isRunning ? 'running' : 'inactive');
      statusEl.textContent = isRunning ? 'running' : 'inactive';
      info.appendChild(statusEl);
      card.appendChild(info);

      // Click handler
      card.addEventListener('click', () => {
        closeFabMenu();
        if (termEntry) {
          showTerminalPanel(termEntry.terminalId);
        } else if (serverSession) {
          reconnectTerminal(serverSession.terminalId, serverSession.id);
        } else {
          launchTerminal(undefined, undefined, name);
        }
      });

      menu.appendChild(card);
    }
  }

  function toggleFabMenu() {
    const btn = document.getElementById('fab-btn');
    const menu = document.getElementById('fab-menu');
    const isOpen = menu.classList.contains('open');
    if (isOpen) {
      closeFabMenu();
    } else {
      updateFabMenu();
      menu.classList.add('open');
      btn.classList.add('open');
    }
  }

  function closeFabMenu() {
    document.getElementById('fab-menu').classList.remove('open');
    document.getElementById('fab-btn').classList.remove('open');
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connectWS() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => setStatus(true);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'sessions') {
          allSessions = msg.data || [];
          syncSessions(allSessions);
        } else if (msg.type === 'logs') {
          for (const [id, entries] of Object.entries(msg.data || {})) {
            sessionLogs.set(id, entries);
          }
          if (activePanelId) openPanel(activePanelId);
        } else if (msg.type === 'log_append') {
          appendToPanel(msg.sessionId, msg.entry);
        }
      } catch {}
    };
    ws.onclose = () => { setStatus(false); setTimeout(connectWS, 3000); };
    ws.onerror = () => ws.close();
  }

  function setStatus(connected) {
    // no-op: status bar removed
  }

  // ── Canvas / resize ───────────────────────────────────────────────────────
  function setupCanvas() {
    canvas = document.createElement('canvas');
    canvas.style.imageRendering = 'pixelated';
    canvas.style.cursor = 'default';
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    document.getElementById('game-container').appendChild(canvas);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
      const hit = getCharacterAt(px, py);
      if (hit) {
        openOrSwitchTerminal(hit.id);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
      canvas.style.cursor = getCharacterAt(px, py) ? 'pointer' : 'default';
    });

    // FAB controls
    document.getElementById('fab-btn').addEventListener('click', toggleFabMenu);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#fab')) closeFabMenu();
    });

    // Terminal controls
    document.getElementById('terminal-close').addEventListener('click', closeTerminalPanel);
    // Backdrop is non-interactive — terminal closes only via close button
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const W   = window.innerWidth - 44;
    const H   = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.imageSmoothingEnabled = false;
    computeZoom();
    if (assetsLoaded && layout) buildFurnitureInstances(layout);
    // Also refit active terminal
    handleTerminalResize();
  }

  // ── Terminal management ──────────────────────────────────────────────────

  function openOrSwitchTerminal(sessionId) {
    // If this session already has a local terminal, toggle panel visibility
    const existingTermId = sessionTerminals.get(sessionId);
    if (existingTermId && openTerminals.has(existingTermId)) {
      const panel = document.getElementById('terminal-panel');
      if (panel.classList.contains('open') && activeTerminalId === existingTermId) {
        minimizeTerminalPanel();
      } else {
        showTerminalPanel(existingTermId);
      }
      return;
    }
    // Check if the server has a terminal for this session (e.g. after page reload)
    const session = allSessions.find(s => s.id === sessionId);
    if (session && session.terminalId) {
      reconnectTerminal(session.terminalId, sessionId);
      return;
    }
    // No terminal — no-op
  }

  // Detect if running inside Tauri
  const isTauri = !!(window.__TAURI__);

  // Connect terminal via Tauri IPC (Rust PTY)
  function connectTerminalTauri(terminalId) {
    const entry = openTerminals.get(terminalId);
    if (!entry) return;
    const { xterm } = entry;

    // Load WebGL addon
    try {
      if (!entry._webglLoaded) {
        const webglAddon = new window.WebglAddon.WebglAddon();
        xterm.loadAddon(webglAddon);
        entry._webglLoaded = true;
      }
    } catch (e) {
      console.warn('[terminal] WebGL addon failed:', e);
    }

    // Listen for PTY output from Rust
    const unlisten = window.__TAURI__.event.listen(`pty-data-${terminalId}`, (event) => {
      xterm.write(event.payload);
    });
    const unlistenExit = window.__TAURI__.event.listen(`pty-exit-${terminalId}`, () => {
      xterm.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n');
      killTerminalTab(terminalId);
    });

    // Store cleanup functions
    entry._tauriUnlisten = async () => {
      (await unlisten)();
      (await unlistenExit)();
    };

    // Mark as "connected" with a fake ws object for compatibility
    entry.ws = {
      readyState: WebSocket.OPEN,
      send(msgStr) {
        const msg = JSON.parse(msgStr);
        if (msg.type === 'terminal_input') {
          window.__TAURI__.core.invoke('pty_write', { terminalId, data: msg.data });
        } else if (msg.type === 'terminal_resize') {
          window.__TAURI__.core.invoke('pty_resize', { terminalId, cols: msg.cols, rows: msg.rows });
        }
      },
      close() {}
    };
  }

  // Connect (or reconnect) a terminal WebSocket with auto-retry on disconnect
  function connectTerminalWs(terminalId) {
    const entry = openTerminals.get(terminalId);
    if (!entry) return;

    const { xterm } = entry;
    let dead = false; // true once terminal process exited — stop reconnecting

    const termWs = new WebSocket(`ws://${location.host}/ws/terminal?id=${terminalId}`);
    entry.ws = termWs;

    termWs.onopen = () => {
      try {
        // Only load WebGL addon once (on initial connect)
        if (!entry._webglLoaded) {
          const webglAddon = new window.WebglAddon.WebglAddon();
          xterm.loadAddon(webglAddon);
          entry._webglLoaded = true;
        }
      } catch (e) {
        console.warn('[terminal] WebGL addon failed:', e);
      }
    };

    termWs.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'terminal_output') {
          xterm.write(msg.data);
        } else if (msg.type === 'terminal_exit') {
          dead = true;
          xterm.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n');
          killTerminalTab(terminalId);
        }
      } catch {}
    };

    termWs.onclose = () => {
      if (dead) return;
      // Only reconnect if this terminal is still tracked
      if (!openTerminals.has(terminalId)) return;
      xterm.write('\r\n\x1b[90m[reconnecting...]\x1b[0m');
      setTimeout(() => {
        if (openTerminals.has(terminalId)) connectTerminalWs(terminalId);
      }, 2000);
    };
  }

  // Connect terminal — picks Tauri IPC or WebSocket based on environment
  function connectTerminal(terminalId) {
    if (isTauri) {
      connectTerminalTauri(terminalId);
    } else {
      connectTerminalWs(terminalId);
    }
  }

  function createXterm(sessionId) {
    const xterm = new window.Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Menlo', monospace",
      fontWeight: 400,
      fontWeightBold: 700,
      letterSpacing: 0,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
      allowTransparency: false,
      scrollback: 10000,
      minimumContrastRatio: 1,
    });
    const fitAddon = new window.FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);

// Register file link provider for clickable paths
    if (window.FileLinkProvider) {
      window.FileLinkProvider.register(xterm, () => {
        // Look up cwd dynamically — sessionId may be set after terminal creation
        // Check the passed sessionId first, then scan openTerminals for this xterm
        const sid = sessionId || findSessionIdForXterm(xterm);
        if (sid) {
          const session = allSessions.find(s => s.id === sid);
          if (session) return session.cwd;
        }
        // Fallback: use _getActiveCwd
        if (window._getActiveCwd) return window._getActiveCwd();
        return '';
      });
    }

    return { xterm, fitAddon };
  }

  function reconnectTerminal(terminalId, sessionId) {
    const ch = characters.get(sessionId);
    const name = ch?.name || nextAvailableName();
    const { xterm, fitAddon } = createXterm(sessionId);

    // Forward keystrokes to current WS (looked up dynamically)
    xterm.onData((data) => {
      const entry = openTerminals.get(terminalId);
      if (entry?.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({ type: 'terminal_input', data }));
      }
    });

    openTerminals.set(terminalId, { xterm, ws: null, fitAddon, name, sessionId });
    sessionTerminals.set(sessionId, terminalId);
    connectTerminal(terminalId);
    showTerminalPanel(terminalId);
  }

  async function launchTerminal(cwd, sessionId, charName) {
    let terminalId;

    if (isTauri) {
      // Spawn PTY via Rust backend
      const id = `term-${Date.now()}`;
      const workDir = cwd || '/';
      try {
        const result = await window.__TAURI__.core.invoke('pty_spawn', {
          cols: 120, rows: 30,
          cwd: workDir,
          terminalId: id,
        });
        terminalId = result.terminal_id;
        // Register with Bun server so hooks can track this terminal
        fetch('/api/terminal/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ terminalId, cwd: workDir }),
        }).catch(() => {});
      } catch (e) {
        console.error('[terminal] Tauri PTY spawn failed:', e);
        return;
      }
    } else {
      // Spawn PTY via Bun server
      const res = await fetch('/api/terminal/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: cwd || '' }),
      });
      const resp = await res.json();
      terminalId = resp.terminalId;
    }

    if (!terminalId) return;

    const { xterm, fitAddon } = createXterm(sessionId);
    const name = charName || nextAvailableName();

    // Forward keystrokes
    xterm.onData((data) => {
      const entry = openTerminals.get(terminalId);
      if (entry?.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({ type: 'terminal_input', data }));
      }
    });

    openTerminals.set(terminalId, { xterm, ws: null, fitAddon, name, sessionId: null });
    connectTerminal(terminalId);
    showTerminalPanel(terminalId);
  }

  function showTerminalPanel(terminalId) {
    const panel = document.getElementById('terminal-panel');
    const container = document.getElementById('terminal-container');

    // Hide file viewers when switching to terminal
    if (window.FileViewer) window.FileViewer.hideAll();

    // Detach currently active terminal's DOM
    if (activeTerminalId && activeTerminalId !== terminalId) {
      const prev = openTerminals.get(activeTerminalId);
      if (prev && prev.xterm.element) {
        prev.xterm.element.style.display = 'none';
      }
    }

    activeTerminalId = terminalId;
    const term = openTerminals.get(terminalId);
    if (!term) return;

    // Restore saved width on first open
    if (!panel.classList.contains('open') && panel._restoreWidth) {
      panel._restoreWidth();
    }

    // Open panel + backdrop + shift camera
    panel.classList.add('open');
    document.getElementById('terminal-backdrop').classList.add('open');
    if (panel._updateCameraShift) panel._updateCameraShift();


    // Attach xterm if not yet attached
    if (!term.xterm.element) {
      term.xterm.open(container);
    }
    term.xterm.element.style.display = '';

    // Fit after panel animation and send resize to trigger PTY repaint
    const fitAndResize = () => {
      term.fitAddon.fit();
      if (term.ws.readyState === WebSocket.OPEN) {
        term.ws.send(JSON.stringify({
          type: 'terminal_resize',
          cols: term.xterm.cols,
          rows: term.xterm.rows,
        }));
        term.xterm.focus();
      } else {
        // WS not open yet (reconnect case) — retry shortly
        setTimeout(fitAndResize, 200);
      }
    };
    setTimeout(fitAndResize, 1050); // after 1s slide animation completes

    updateTerminalTabs();
  }

  function killTerminalTab(terminalId) {
    const term = openTerminals.get(terminalId);
    if (term) {
      if (term.sessionId) sessionTerminals.delete(term.sessionId);
      term.xterm.dispose();
      if (term._tauriUnlisten) term._tauriUnlisten();
      if (term.ws && term.ws.readyState === WebSocket.OPEN) term.ws.close();
      // Tell server/Tauri to kill PTY
      if (isTauri) {
        window.__TAURI__.core.invoke('pty_kill', { terminalId }).catch(() => {});
      } else {
        fetch('/api/terminal/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ terminalId }),
        }).catch(() => {});
      }
    }
    openTerminals.delete(terminalId);

    if (activeTerminalId === terminalId) {
      // Switch to another tab or close panel
      const remaining = Array.from(openTerminals.keys());
      if (remaining.length > 0) {
        showTerminalPanel(remaining[remaining.length - 1]);
      } else {
        activeTerminalId = null;
        minimizeTerminalPanel();
      }
    }
    updateTerminalTabs();
  }

  function minimizeTerminalPanel() {
    // Just hide the panel — all terminals stay alive
    const panel = document.getElementById('terminal-panel');
    panel.classList.remove('open');
    document.getElementById('terminal-backdrop').classList.remove('open');
    // Shift camera back to center
    if (panel._updateCameraShift) panel._updateCameraShift();
  }

  function closeTerminalPanel() {
    minimizeTerminalPanel();
  }

  function updateTerminalTabs() {
    const tabsEl = document.getElementById('terminal-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = '';

    // Terminal tabs
    for (const [id, t] of openTerminals) {
      const isActiveTermTab = id === activeTerminalId && !(window.FileViewer && window.FileViewer.getActiveFilePath());
      const tab = document.createElement('button');
      tab.className = `terminal-tab${isActiveTermTab ? ' active' : ''}`;

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = t.name;
      tab.appendChild(label);

      const kill = document.createElement('span');
      kill.className = 'tab-close';
      kill.textContent = '✕';
      kill.title = 'kill session';
      kill.addEventListener('click', (e) => {
        e.stopPropagation();
        killTerminalTab(id);
      });
      tab.appendChild(kill);

      tab.addEventListener('click', () => {
        // Hide file viewers, show terminal
        if (window.FileViewer) window.FileViewer.hideAll();
        showTerminalPanel(id);
      });
      tabsEl.appendChild(tab);
    }

    // File viewer tabs
    if (window.FileViewer) {
      const openFiles = window.FileViewer.getOpenFiles();
      const activeFile = window.FileViewer.getActiveFilePath();

      for (const [path, entry] of openFiles) {
        const filename = path.split('/').pop();
        const tab = document.createElement('button');
        tab.className = `terminal-tab file-tab${path === activeFile ? ' active' : ''}${!entry.pinned ? ' preview' : ''}`;

        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.textContent = '{}';
        tab.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = filename;
        label.title = path;
        tab.appendChild(label);

        const dot = document.createElement('span');
        dot.className = `unsaved-dot${entry.dirty ? ' visible' : ''}`;
        tab.appendChild(dot);

        const close = document.createElement('span');
        close.className = 'tab-close';
        close.textContent = '✕';
        close.title = 'close file';
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          window.FileViewer.closeFile(path);
        });
        tab.appendChild(close);

        // Single click: show file (it's already open)
        tab.addEventListener('click', () => {
          // Hide active terminal xterm
          if (activeTerminalId) {
            const prev = openTerminals.get(activeTerminalId);
            if (prev && prev.xterm.element) prev.xterm.element.style.display = 'none';
          }
          window.FileViewer.showFile(path);
          updateTerminalTabs();
        });

        // Double click: pin the tab
        tab.addEventListener('dblclick', (e) => {
          e.preventDefault();
          if (!entry.pinned) {
            entry.pinned = true;
            updateTerminalTabs();
          }
        });

        tabsEl.appendChild(tab);
      }
    }
  }

  function findSessionIdForXterm(xterm) {
    for (const [, t] of openTerminals) {
      if (t.xterm === xterm && t.sessionId) return t.sessionId;
    }
    return null;
  }

  // Expose hooks for file-viewer.js and command-palette.js
  window._updateTerminalTabs = updateTerminalTabs;
  window._hideActiveTerminal = function() {
    if (activeTerminalId) {
      const prev = openTerminals.get(activeTerminalId);
      if (prev && prev.xterm.element) prev.xterm.element.style.display = 'none';
    }
  };
  window._getActiveCwd = function() {
    // Get cwd from the active terminal's session
    if (activeTerminalId) {
      const term = openTerminals.get(activeTerminalId);
      if (term && term.sessionId) {
        const session = allSessions.find(s => s.id === term.sessionId);
        if (session) return session.cwd;
      }
    }
    // Fallback: first session with a cwd
    for (const s of allSessions) {
      if (s.cwd) return s.cwd;
    }
    return '';
  };

  function handleTerminalResize() {
    if (!activeTerminalId) return;
    const term = openTerminals.get(activeTerminalId);
    if (!term) return;
    term.fitAddon.fit();
    if (term.ws.readyState === WebSocket.OPEN) {
      term.ws.send(JSON.stringify({
        type: 'terminal_resize',
        cols: term.xterm.cols,
        rows: term.xterm.rows,
      }));
    }
  }

  // ── Left-docked terminal panel: width resize + camera pan ────────────────
  (function setupTerminalResize() {
    const panel = document.getElementById('terminal-panel');
    const gameContainer = document.getElementById('game-container');
    if (!panel) return;
    const STORAGE_KEY = 'observatory-terminal-width';
    const MIN_W = 300;
    const MAX_W_RATIO = 0.75; // max 75% of screen

    function saveWidth() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(panel.offsetWidth));
    }

    function restoreWidth() {
      let w;
      try { w = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch {}
      if (!w || w < MIN_W) w = Math.round(window.innerWidth * 0.5);
      w = Math.max(MIN_W, Math.min(w, window.innerWidth * MAX_W_RATIO));
      panel.style.width = w + 'px';
      updateCameraShift();
    }

    function updateCameraShift() {
      if (panel.classList.contains('open')) {
        // Floor starts at col 1. Compute its screen X (before any shift).
        // offsetX positions visMinCol at the centering offset.
        // Col 1 screen X = offsetX + (1 - visMinCol) * TILE_SIZE * zoom
        // But offsetX is in canvas pixels (with dpr). Convert to CSS pixels.
        const dpr = window.devicePixelRatio || 1;
        const { offsetX } = computeOffset();
        const floorScreenX = (offsetX + (1 - visMinCol) * TILE_SIZE * zoom) / dpr;
        // Shift so terminal right edge aligns with floor start
        gameContainer.style.transform = `translateX(${panel.offsetWidth - floorScreenX}px)`;
      } else {
        gameContainer.style.transform = '';
      }
    }

    // Expose for showTerminalPanel / closeTerminalPanel
    panel._restoreWidth = restoreWidth;
    panel._updateCameraShift = updateCameraShift;

    // ── Right-edge resize ──
    let resizing = false, resizeStartX, resizeOrigW;

    panel.querySelector('.resize-handle.rh-e').addEventListener('mousedown', (e) => {
      resizing = true;
      resizeStartX = e.clientX;
      resizeOrigW = panel.offsetWidth;
      // Disable transitions during drag for instant feedback
      panel.style.transition = 'none';
      gameContainer.style.transition = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const dx = e.clientX - resizeStartX;
      const newW = Math.max(MIN_W, Math.min(resizeOrigW + dx, window.innerWidth * MAX_W_RATIO));
      panel.style.width = newW + 'px';
      // Live-update camera shift
      const dpr = window.devicePixelRatio || 1;
      const { offsetX } = computeOffset();
      const floorScreenX = (offsetX + (1 - visMinCol) * TILE_SIZE * zoom) / dpr;
      gameContainer.style.transform = `translateX(${newW - floorScreenX}px)`;
    });

    document.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      // Re-enable transitions
      panel.style.transition = '';
      gameContainer.style.transition = '';
      saveWidth();
      handleTerminalResize();
    });
  })();

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    setupCanvas();
    setStatus(false);

    try {
      const res = await fetch('assets/default-layout-1.json');
      layout = await res.json();
    } catch (e) {
      console.error('[Observatory] Failed to load layout:', e);
      return;
    }

    buildTileMap(layout);
    buildBlockedTiles(layout);
    buildWalkableTiles();
    computeVisBounds();
    computeZoom();

    await loadAssets();
    buildFurnitureInstances(layout);

    requestAnimationFrame(renderFrame);
    connectWS();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
