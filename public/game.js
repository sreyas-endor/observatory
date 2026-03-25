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
  const CHAR_NAMES = ['Linus', 'Hopper', 'Carmack', 'Lovelace', 'Karpathy', 'Knuth'];

  // Activity pill colours (match sidebar Solarized theme)
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
  const TILE_COLORS = { 0: '#3e4760', 7: '#c4a882', 1: '#8098b8', 9: '#687a9a' };

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

  // ── Seat definitions ──────────────────────────────────────────────────────
  const SEAT_DEFS = [
    { seatId: 'seat-0', col: 3, row: 14, dir: DIR.UP },
    { seatId: 'seat-1', col: 7, row: 14, dir: DIR.UP },
  ];

  // ── Lounge spots — one per character slot around the sofa U ──────────────
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
    const FACE_H = 14;
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
      Array.from({ length: 9 }, (_, i) =>
        loadImage(`assets/floors/floor_${i}.png`).then(img => { floorImages[i] = img; })
      )
    );
    // Tile type 7 = left room floor (near-black/white checker) → warm tan tint
    if (floorImages[7]) floorImages[7] = tintImage(floorImages[7], 210, 175, 130);

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
    const palette = charSlotCounter % 6;
    charSlotCounter++;
    return {
      sessionId, type, seatId,
      name:     CHAR_NAMES[palette],
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

    // Just started needing input → walk to sofa
    if (!wasNeedsInput && ch.needsInput) {
      walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
    }

    // Input answered → walk back to desk
    if (wasNeedsInput && !ch.needsInput && ch.isActive && ch.seatId) {
      const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
      if (seat) walkTo(ch, seat.col, seat.row, seat.dir);
    }

    // Became inactive → start lounge wander phase
    if (wasActive && !ch.isActive) {
      ch.stateChangedAt = Date.now();
      ch.wanderTimer = 0;
      const restTiles = buildLoungeTiles();
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
        if (ch.needsInput) {
          walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
          break;
        }
        if (!ch.isActive) {
          if (ch.seatTimer > 0) { ch.seatTimer -= dt; break; }
          if (ch.seatTimer < 0) ch.seatTimer = 0;
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
        if (ch.needsInput) {
          if (ch.tileCol !== loungeSpot(ch).col || ch.tileRow !== loungeSpot(ch).row) {
            walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
          } else {
            ch.dir   = loungeSpot(ch).dir;
            ch.state = STATE.READ; ch.frame = 0; ch.frameTimer = 0;
          }
          break;
        }
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
        // Inactive — phase 1: wander lounge (0–5 min), phase 2: sleep (5–15 min)
        const inactiveSecs = ch.stateChangedAt ? (Date.now() - ch.stateChangedAt) / 1000 : 0;
        if (inactiveSecs < 5 * 60) {
          ch.bubbleType = null;
          ch.wanderTimer -= dt;
          if (ch.wanderTimer <= 0) {
            const restTiles = buildLoungeTiles();
            if (restTiles.length > 0) {
              const t = restTiles[Math.floor(Math.random() * restTiles.length)];
              walkTo(ch, t.col, t.row, ch.dir);
            }
            ch.wanderTimer = randRange(3, 7);
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

    // Activity pill — only when actively coding
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
      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const sw    = CHAR_W * zoom;
      const sh    = CHAR_H * zoom;
      const drawX = Math.round(offsetX + ch.x * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - sh);
      const footY = Math.round(offsetY + (ch.y + sittingOff) * zoom);
      const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;
      const cx    = Math.round(offsetX + ch.x * zoom);

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

      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const bw = bubbleSrc.width  * zoom;
      const bh = bubbleSrc.height * zoom;
      const bx = Math.round(offsetX + ch.x * zoom - bw / 2);
      const by = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET) * zoom - bh - zoom);

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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const sw    = CHAR_W * zoom;
      const sh    = CHAR_H * zoom;
      const drawX = Math.round(offsetX + ch.x * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - sh);
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
    const panel = document.getElementById('sidebar-panel');
    const logEl = document.getElementById('panel-log');

    const ch = characters.get(sessionId);
    const s  = allSessions.find(s => s.id === sessionId);
    document.getElementById('panel-title').textContent =
      (ch ? ch.name : sessionId.slice(0, 8)) + (s ? ' · ' + (s.type === 'claude' ? 'Claude' : 'Cursor') : '');
    document.getElementById('panel-cwd').textContent = s?.cwd || '';

    logEl.innerHTML = '';
    const entries = sessionLogs.get(sessionId) || [];
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'panel-empty';
      empty.textContent = 'no activity yet';
      logEl.appendChild(empty);
    } else {
      for (const entry of entries) {
        if (entry.kind === 'prompt' && logEl.children.length > 0) {
          const sep = document.createElement('hr');
          sep.className = 'log-sep';
          logEl.appendChild(sep);
        }
        logEl.appendChild(buildLogRow(entry));
      }
      logEl.scrollTop = logEl.scrollHeight;
    }

    panel.classList.add('open');
    updateStrip();
  }

  function closePanel() {
    activePanelId = null;
    document.getElementById('sidebar-panel').classList.remove('open');
    updateStrip();
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

  function updateStrip() {
    const dots = document.getElementById('strip-dots');
    if (!dots) return;
    dots.innerHTML = '';

    for (const s of allSessions) {
      const dot = document.createElement('div');
      dot.className = `s-dot st-${s.state}${s.id === activePanelId ? ' active' : ''}`;
      const ch = characters.get(s.id);
      dot.title = (ch ? ch.name : s.id.slice(0, 8)) + ' · ' + s.id.slice(0, 8);

      const faceCanvas = ch ? charFaceCanvases[ch.palette] : null;
      if (faceCanvas) {
        const dc  = document.createElement('canvas');
        dc.width  = 22; dc.height = 22;
        dc.style.imageRendering = 'pixelated';
        const dctx = dc.getContext('2d');
        dctx.imageSmoothingEnabled = false;
        const dstH = Math.round(14 * (22 / 16));
        dctx.drawImage(faceCanvas, 0, 0, 16, 14, 0, Math.round((22 - dstH) / 2), 22, dstH);
        dot.appendChild(dc);
      } else {
        dot.textContent = s.type === 'claude' ? 'C' : 'V';
      }

      dot.addEventListener('click', () => {
        if (activePanelId === s.id) closePanel(); else openPanel(s.id);
      });
      dots.appendChild(dot);
    }

    const toggle = document.getElementById('strip-toggle');
    if (toggle) toggle.textContent = activePanelId ? '→' : '←';
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
          updateStrip();
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

  function sendFocus(sessionId) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'focus', sessionId }));
    }
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function setStatus(connected) {
    document.getElementById('ws-dot')?.classList.toggle('connected', connected);
    const label = document.getElementById('ws-label');
    if (label) label.textContent = connected ? 'observatory connected' : 'reconnecting…';
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
        if (activePanelId === hit.id) closePanel(); else openPanel(hit.id);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width  / rect.width);
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height);
      canvas.style.cursor = getCharacterAt(px, py) ? 'pointer' : 'default';
    });

    document.getElementById('panel-close').addEventListener('click', closePanel);
    document.getElementById('strip-toggle').addEventListener('click', () => {
      if (activePanelId) {
        closePanel();
      } else if (allSessions.length > 0) {
        openPanel(allSessions[0].id);
      }
    });
    updateStrip();
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
  }

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
