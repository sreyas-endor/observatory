// Observatory — Canvas 2D game engine
// Pixel-art office room with animated Metro City characters
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const TILE_SIZE = 16;
  const CHAR_W = 16;
  const CHAR_H = 32;
  const WALK_SPEED = 48;        // px/sec
  const WALK_FRAME_DUR = 0.15;  // sec per walk frame step
  const TYPE_FRAME_DUR = 0.30;  // sec per type/read frame toggle
  const WANDER_PAUSE_MIN = 1.5;
  const WANDER_PAUSE_MAX = 4.0;
  const WANDER_MOVES_MIN = 2;
  const WANDER_MOVES_MAX = 5;
  const SEAT_REST_MIN = 3.0;
  const SEAT_REST_MAX = 8.0;
  const CHAR_SITTING_OFFSET = 6;    // px shift down when seated
  const BUBBLE_VERTICAL_OFFSET = 24; // px above character y
  const BUBBLE_FADE_DUR = 0.5;
  const MAX_DELTA = 0.1;            // cap delta time
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

  // ── Floor / wall colors ───────────────────────────────────────────────────
  // Tile types: 255=VOID, 0=WALL, 1=floor(blue), 7=floor(tan), 9=floor(gray-blue)
  const TILE_COLORS = {
    0: '#3e4760',
    7: '#c4a882',
    1: '#8098b8',
    9: '#687a9a',
  };

  // ── Furniture catalog ─────────────────────────────────────────────────────
  // fw/fh = footprint in tiles, pw/ph = sprite pixel size
  // bgTiles: top rows considered background (walkable), rest blocked
  // mirrored: flip sprite horizontally
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

  // ── Seats (in front of the two DESK_FRONTs in default-layout-1.json) ─────
  // DESK_FRONT at (2,12) → seat bench at (3,14) facing UP
  // DESK_FRONT at (6,12) → seat bench at (7,14) facing UP
  const SEAT_DEFS = [
    { seatId: 'seat-0', col: 3, row: 14, dir: DIR.UP },
    { seatId: 'seat-1', col: 7, row: 14, dir: DIR.UP },
  ];

  // ── Sofa lounge spots — one per character slot, spread around the sofa U ──
  // SOFA_FRONT at (14,13), SOFA_SIDE at (13,14), SOFA_SIDE:left at (16,14),
  // SOFA_BACK at (14,16). Characters wait at tiles just outside the U.
  const LOUNGE_TABLE_SPOTS = [
    { col: 14, row: 12, dir: DIR.DOWN  },  // slot 0 — above SOFA_FRONT, left
    { col: 15, row: 12, dir: DIR.DOWN  },  // slot 1 — above SOFA_FRONT, right
    { col: 12, row: 15, dir: DIR.RIGHT },  // slot 2 — left of left sofa arm
    { col: 12, row: 16, dir: DIR.RIGHT },  // slot 3
    { col: 17, row: 15, dir: DIR.LEFT  },  // slot 4 — right of right sofa arm
    { col: 17, row: 16, dir: DIR.LEFT  },  // slot 5
  ];

  // ── Bubble pixel data ─────────────────────────────────────────────────────
  const BUBBLE_WAITING_DATA = {
    palette: { '_': null, 'B': '#555566', 'F': '#EEEEFF', 'G': '#44BB66' },
    pixels: [
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','G','F','B'],
      ['B','F','F','F','F','F','F','G','F','F','B'],
      ['B','F','F','G','F','F','G','F','F','F','B'],
      ['B','F','F','F','G','G','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['_','_','_','_','B','B','B','_','_','_','_'],
      ['_','_','_','_','_','B','_','_','_','_','_'],
      ['_','_','_','_','_','_','_','_','_','_','_'],
    ]
  };

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
    // small z (3×3) + big Z (4×4), diagonal goes top-right → bottom-left
    palette: { '_': null, 'B': '#555566', 'F': '#EEEEFF', 'Z': '#7799DD' },
    pixels: [
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['B','F','F','F','F','F','F','F','F','F','B'],
      ['B','F','Z','Z','Z','F','F','F','F','F','B'],  // small z top
      ['B','F','F','Z','F','F','F','F','F','F','B'],  // small z mid (centre = diagonal)
      ['B','F','Z','Z','Z','F','F','F','F','F','B'],  // small z bottom
      ['B','F','F','F','F','Z','Z','Z','Z','F','B'],  // big Z top
      ['B','F','F','F','F','F','F','Z','F','F','B'],  // big Z upper diag (col 7)
      ['B','F','F','F','F','F','Z','F','F','F','B'],  // big Z lower diag (col 6)
      ['B','F','F','F','F','Z','Z','Z','Z','F','B'],  // big Z bottom
      ['_','B','B','B','B','B','B','B','B','B','_'],
      ['_','_','_','_','B','B','B','_','_','_','_'],
      ['_','_','_','_','_','B','_','_','_','_','_'],
      ['_','_','_','_','_','_','_','_','_','_','_'],
    ]
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let canvas, ctx;
  let zoom = 3;
  let layout = null;
  let tileMap = [];
  let blockedTiles = new Set();
  let walkableTiles = [];
  let furnitureInstances = [];
  let characters = new Map();    // sessionId → character obj
  let charSprites = [];          // per-palette index → { down, up, right, left }
  let charFaceCanvases = [];     // per-palette index → 16×14 head crop canvas
  let furnitureImages = {};      // file → HTMLImageElement
  let floorImages = {};          // tile type index → HTMLImageElement
  let bubbleWaitingCanvas = null;
  let bubblePermissionCanvas = null;
  let bubbleSleepingCanvas = null;
  let seatAssignments = new Map(); // seatId → sessionId
  let ws = null;
  let assetsLoaded = false;
  let lastTimestamp = null;
  let charSlotCounter = 0;

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const sessionLogs  = new Map();   // sessionId → LogEntry[]
  let activePanelId  = null;        // sessionId currently shown in panel
  window.__obsSessions = [];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function randRange(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max)   { return min + Math.floor(Math.random() * (max - min + 1)); }

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
    if (blockedTiles.has(`${col},${row}`)) return false;
    return true;
  }

  function findPath(sc, sr, ec, er) {
    if (sc === ec && sr === er) return [];
    if (!isWalkable(ec, er)) return [];
    const key = (c, r) => `${c},${r}`;
    const visited = new Set([key(sc, sr)]);
    const parent = new Map();
    const queue = [{ col: sc, row: sr }];
    const dirs4 = [{dc:0,dr:-1},{dc:0,dr:1},{dc:-1,dr:0},{dc:1,dr:0}];
    while (queue.length) {
      const curr = queue.shift();
      const ck = key(curr.col, curr.row);
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
      for (const d of dirs4) {
        const nc = curr.col + d.dc, nr = curr.row + d.dr;
        const nk = key(nc, nr);
        if (visited.has(nk)) continue;
        if (!isWalkable(nc, nr)) continue;
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
  // Cols: 0=walkA, 1=walkB, 2=walkC, 3=typeA, 4=typeB, 5=readA, 6=readB
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
    const FACE_H = 14; // head region (top 14px of 32px frame)
    const oc = document.createElement('canvas');
    oc.width = CHAR_W; oc.height = FACE_H;
    const c = oc.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, CHAR_W, FACE_H, 0, 0, CHAR_W, FACE_H);
    return oc;
  }

  function buildCharSprites(img) {
    // Returns { down, up, right, left } each with { walk[4], typing[2], reading[2] }
    const build = (dirRow) => {
      const f = (col) => extractFrame(img, dirRow, col);
      return {
        walk:    [f(0), f(1), f(2), f(1)],
        typing:  [f(3), f(4)],
        reading: [f(5), f(6)],
      };
    };
    const flip = (sprites) => ({
      walk:    sprites.walk.map(flipCanvas),
      typing:  sprites.typing.map(flipCanvas),
      reading: sprites.reading.map(flipCanvas),
    });
    const right = build(2);
    return {
      [DIR.DOWN]:  build(0),
      [DIR.UP]:    build(1),
      [DIR.RIGHT]: right,
      [DIR.LEFT]:  flip(right),
    };
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
        if (!color) continue;
        c.fillStyle = color;
        c.fillRect(col, r, 1, 1);
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

  async function loadAssets() {
    // Character spritesheets
    const charImgs = await Promise.all(
      Array.from({ length: 6 }, (_, i) => loadImage(`assets/characters/char_${i}.png`))
    );
    charSprites = charImgs.map(img => img ? buildCharSprites(img) : null);
    charFaceCanvases = charImgs.map(img => img ? buildFaceCanvas(img) : null);

    // Floor tile images
    await Promise.all(
      Array.from({ length: 9 }, (_, i) => loadImage(`assets/floors/floor_${i}.png`).then(img => {
        floorImages[i] = img;
      }))
    );

    // Furniture images (only those referenced by layout)
    const filesToLoad = new Set();
    for (const f of (layout?.furniture || [])) {
      const cat = FC[f.type];
      if (cat) filesToLoad.add(cat.file);
    }
    await Promise.all([...filesToLoad].map(file =>
      loadImage(file).then(img => { furnitureImages[file] = img; })
    ));

    bubbleWaitingCanvas    = buildBubbleCanvas(BUBBLE_WAITING_DATA);
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

  // Lounge zone: right room (cols 11–18, rows 11–20, floor types 1 and 9)
  function buildLoungeTiles() {
    return walkableTiles.filter(t => t.col >= 11 && t.col <= 18 && t.row >= 11 && t.row <= 20);
  }

  function buildFurnitureInstances(layoutData) {
    furnitureInstances = [];
    for (const f of layoutData.furniture) {
      const cat = FC[f.type];
      if (!cat) continue;
      const img = furnitureImages[cat.file];
      // Sprite top-left in game units
      const x = f.col * TILE_SIZE;
      const y = (f.row + cat.fh) * TILE_SIZE - cat.ph;
      // zY: bottom of footprint for sorting
      const zY = (f.row + cat.fh) * TILE_SIZE;
      furnitureInstances.push({ x, y, img, mirrored: !!cat.mirrored, pw: cat.pw, ph: cat.ph, zY });
    }
  }

  // ── Character management ──────────────────────────────────────────────────
  function createCharacter(sessionId, type, seatId) {
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
    const center = tileCenter(col, row);
    const palette = charSlotCounter % 6;
    charSlotCounter++;
    const name = CHAR_NAMES[palette];
    return {
      sessionId, type, seatId, name,
      state: STATE.TYPE,
      dir:   seat ? seat.dir : DIR.DOWN,
      x: center.x, y: center.y,
      tileCol: col, tileRow: row,
      path: [], moveProgress: 0,
      isActive: true,
      currentTool: null,
      palette,
      frame: 0, frameTimer: 0,
      wanderTimer: 0,
      wanderCount: 0,
      wanderLimit: randInt(WANDER_MOVES_MIN, WANDER_MOVES_MAX),
      seatTimer: 0,
      bubbleType: null,  // null | 'waiting' | 'permission'
      bubbleTimer: 0,
      needsInput: false, // true when blocked on AskUserQuestion
      inactiveTimer: 0, // seconds since session went idle
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
    const wasActive    = ch.isActive;
    const wasNeedsInput = ch.needsInput;

    switch (state) {
      case 'thinking':
      case 'reading':
      case 'editing':
      case 'running':
      case 'mcp':
        ch.isActive    = true;
        ch.needsInput  = false;
        ch.currentTool = state === 'reading' ? 'Read' : null;
        ch.bubbleType  = null;
        break;
      case 'input':
        // Mid-task: blocked waiting for user answer → walk to lounge table
        ch.isActive   = true;  // still "in a session"
        ch.needsInput = true;
        ch.bubbleType = 'permission'; // amber "..." bubble
        ch.bubbleTimer = 0;
        break;
      case 'waiting':
        ch.isActive    = false;
        ch.needsInput  = false;
        ch.currentTool = null;
        ch.bubbleType  = null;
        break;
      case 'error':
        ch.isActive    = false;
        ch.needsInput  = false;
        ch.currentTool = null;
        ch.bubbleType  = 'permission';
        ch.bubbleTimer = 0;
        break;
      default: // idle = PostToolUse, still mid-session — keep at desk
        ch.isActive    = true;
        ch.needsInput  = false;
        ch.currentTool = null;
        ch.bubbleType  = null;
        break;
    }

    // Just started needing input → walk to sofa spot for READ
    if (!wasNeedsInput && ch.needsInput) {
      walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
    }

    // Input answered / resumed working → walk back to desk
    if (wasNeedsInput && !ch.needsInput && ch.isActive && ch.seatId) {
      const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
      if (seat) walkTo(ch, seat.col, seat.row, seat.dir);
    }

    // Became inactive → start lounge wander phase
    if (wasActive && !ch.isActive) {
      ch.inactiveTimer = 0;
      ch.wanderTimer = 0; // wander immediately
      const restTiles = buildLoungeTiles();
      if (restTiles.length > 0) {
        const t = restTiles[Math.floor(Math.random() * restTiles.length)];
        walkTo(ch, t.col, t.row, ch.dir);
      }
    }

    // Became active again → reset inactive timer
    if (!wasActive && ch.isActive) {
      ch.inactiveTimer = 0;
      ch.bubbleType = null;
    }

    // Became active (from idle/lounge) while not at seat → repath to desk
    if (!wasActive && ch.isActive && !ch.needsInput && ch.state !== STATE.TYPE && ch.seatId) {
      const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
      if (seat) walkTo(ch, seat.col, seat.row, seat.dir);
    }

    // Became inactive while typing → immediate idle transition
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
        if (ch && ch.seatId) seatAssignments.delete(ch.seatId);
        characters.delete(id);
        if (id === activePanelId) closePanel();
      }
    }

    // Add / update
    for (const session of newSessions) {
      let ch = characters.get(session.id);
      if (!ch) {
        const seatId = assignSeat();
        ch = createCharacter(session.id, session.type, seatId);
        characters.set(session.id, ch);
        if (seatId) seatAssignments.set(seatId, session.id);
      }
      ch.startedAt = session.startedAt || ch.startedAt || Date.now();
      applySessionState(ch, session.state);
    }
  }

  // ── Character update (state machine) ─────────────────────────────────────
  function updateCharacter(ch, dt) {
    ch.frameTimer += dt;
    if (ch.bubbleType) ch.bubbleTimer += dt;
    if (!ch.isActive) ch.inactiveTimer += dt;

    switch (ch.state) {
      case STATE.TYPE: {
        if (ch.frameTimer >= TYPE_FRAME_DUR) {
          ch.frameTimer -= TYPE_FRAME_DUR;
          ch.frame = (ch.frame + 1) % 2;
        }
        // Needs user input — leave desk and walk to lounge table
        if (ch.needsInput) {
          walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
          break;
        }
        if (!ch.isActive) {
          if (ch.seatTimer > 0) { ch.seatTimer -= dt; break; }
          if (ch.seatTimer < 0) ch.seatTimer = 0; // clear sentinel
          ch.state = STATE.IDLE;
          ch.frame = 0; ch.frameTimer = 0;
          ch.wanderTimer = randRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
          ch.wanderCount = 0;
          ch.wanderLimit = randInt(WANDER_MOVES_MIN, WANDER_MOVES_MAX);
        }
        break;
      }

      case STATE.READ: {
        // Lounging near sofa — animate read frames, wait for input to clear
        if (ch.frameTimer >= TYPE_FRAME_DUR) {
          ch.frameTimer -= TYPE_FRAME_DUR;
          ch.frame = (ch.frame + 1) % 2;
        }
        // Ensure facing the sofa
        ch.dir = loungeSpot(ch).dir;
        // If no longer blocked, applySessionState will call walkTo → STATE.WALK
        // but guard here too in case state changed without applySessionState
        if (!ch.needsInput) {
          ch.state = STATE.IDLE;
          ch.frame = 0; ch.frameTimer = 0;
        }
        break;
      }

      case STATE.IDLE: {
        ch.frame = 0;
        // Waiting for user input near the sofa — walk there, then switch to READ
        if (ch.needsInput) {
          if (ch.tileCol !== loungeSpot(ch).col || ch.tileRow !== loungeSpot(ch).row) {
            walkTo(ch, loungeSpot(ch).col, loungeSpot(ch).row, loungeSpot(ch).dir);
          } else {
            ch.dir = loungeSpot(ch).dir;
            ch.state = STATE.READ;
            ch.frame = 0; ch.frameTimer = 0;
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
        {
          if (ch.inactiveTimer < 5 * 60) {
            // Phase 1: wander the rest area
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
            // Phase 2: walk to lounge spot and sleep
            const spot = loungeSpot(ch);
            if (ch.tileCol !== spot.col || ch.tileRow !== spot.row) {
              walkTo(ch, spot.col, spot.row, spot.dir);
            } else {
              ch.dir = spot.dir;
              if (ch.bubbleType !== 'sleeping') {
                ch.bubbleType = 'sleeping';
                ch.bubbleTimer = 0;
              }
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
              // Arrived near sofa — switch to reading/lounging animation
              ch.state = STATE.READ;
            } else if (!ch.seatId) {
              ch.state = STATE.TYPE;
            } else {
              const seat = SEAT_DEFS.find(s => s.seatId === ch.seatId);
              if (seat && ch.tileCol === seat.col && ch.tileRow === seat.row) {
                ch.state = STATE.TYPE; ch.dir = seat.dir;
              } else {
                ch.state = STATE.IDLE;
              }
            }
          } else {
            // Inactive — arrived at destination, stand still
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
        // Repath to seat if became active mid-wander (not when waiting for input)
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
        return ch.currentTool === 'Read'
          ? dirSprites.reading[ch.frame % 2]
          : dirSprites.typing[ch.frame % 2];
      case STATE.READ:
        return dirSprites.reading[ch.frame % 2];
      case STATE.WALK:
        return dirSprites.walk[ch.frame % 4];
      case STATE.IDLE:
      default:
        return dirSprites.walk[1];
    }
  }

  // ── Visible bounds (skip leading/trailing VOID rows & cols) ──────────────
  let visMinCol = 0, visMinRow = 0, visMaxCol = 0, visMaxRow = 0;

  function computeVisBounds() {
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (let r = 0; r < tileMap.length; r++) {
      for (let c = 0; c < tileMap[r].length; c++) {
        if (tileMap[r][c] !== 255) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }
    visMinRow = minR === Infinity ? 0 : minR;
    visMaxRow = maxR === -Infinity ? (tileMap.length - 1) : maxR;
    visMinCol = minC === Infinity ? 0 : minC;
    visMaxCol = maxC === -Infinity ? (tileMap[0].length - 1) : maxC;
  }

  // ── Zoom computation ──────────────────────────────────────────────────────
  function computeZoom() {
    if (!layout) return;
    const W = canvas.width, H = canvas.height;
    const visCols = visMaxCol - visMinCol + 1;
    const visRows = visMaxRow - visMinRow + 1;
    const zoomW = W / (visCols * TILE_SIZE);
    const zoomH = H / (visRows * TILE_SIZE);
    zoom = Math.min(zoomW, zoomH);
  }

  function computeOffset() {
    if (!layout) return { offsetX: 0, offsetY: 0 };
    const W = canvas.width, H = canvas.height;
    const visCols = visMaxCol - visMinCol + 1;
    const visRows = visMaxRow - visMinRow + 1;
    const mapW = visCols * TILE_SIZE * zoom;
    const mapH = visRows * TILE_SIZE * zoom;
    // Offset so (visMinCol, visMinRow) maps to top-left of the centered rect
    return {
      offsetX: Math.floor((W - mapW) / 2) - visMinCol * TILE_SIZE * zoom,
      offsetY: Math.floor((H - mapH) / 2) - visMinRow * TILE_SIZE * zoom,
    };
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

    // Furniture
    for (const f of furnitureInstances) {
      if (!f.img) continue;
      const fx = offsetX + f.x * zoom;
      const fy = offsetY + f.y * zoom;
      const fw = f.pw * zoom;
      const fh = f.ph * zoom;
      const zY  = f.zY;
      if (f.mirrored) {
        drawables.push({ zY, draw: () => {
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(fx + fw, fy);
          ctx.scale(-1, 1);
          ctx.drawImage(f.img, 0, 0, fw, fh);
          ctx.restore();
        }});
      } else {
        drawables.push({ zY, draw: () => {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(f.img, fx, fy, fw, fh);
        }});
      }
    }

    // Characters
    for (const ch of characters.values()) {
      const sprite = getCharSprite(ch);
      if (!sprite) continue;
      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const sw = CHAR_W * zoom;
      const sh = CHAR_H * zoom;
      const drawX = Math.round(offsetX + ch.x * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - sh);
      const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

      drawables.push({ zY: charZY, draw: () => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, drawX, drawY, sw, sh);
      }});

      // ── Above-head: activity pill + timer (stacked upward from head top)
      drawables.push({ zY: charZY + 0.005, draw: () => {
        const cx   = Math.round(offsetX + ch.x * zoom);
        const fs   = Math.max(11, Math.round(11 * zoom / 3));
        const px   = Math.max(5, Math.round(5 * zoom / 3));
        const py   = Math.max(3, Math.round(3 * zoom / 3));
        const gap  = Math.max(3, Math.round(3 * zoom / 3));
        const pillH = fs + py * 2;
        ctx.font = `bold ${fs}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Start just above the character head (or above the bubble if one is showing)
        // Bubble top = drawY + (CHAR_H - BUBBLE_VERTICAL_OFFSET - 14) * zoom = drawY - 6*zoom
        const bubbleTop = ch.bubbleType
          ? drawY - Math.round((BUBBLE_VERTICAL_OFFSET - CHAR_H + 14) * zoom)
          : drawY;
        let curY = bubbleTop - gap;

        // ── Activity pill (just above head, only when coding) ─────
        const entries = sessionLogs.get(ch.sessionId) || [];
        const latest  = (ch.isActive && ch.state === STATE.TYPE && entries.length)
                        ? entries[entries.length - 1] : null;
        if (latest && latest.kind !== 'done') {
          const icon   = LOG_ICONS[latest.kind] ?? '.';
          const detail = latest.detail ? latest.detail.slice(0, 20) : latest.kind;
          const label  = latest.kind === 'thinking' ? '...' : icon + ': ' + detail;
          const tw     = ctx.measureText(label).width;
          const pillW  = tw + px * 2;
          curY -= pillH;
          ctx.fillStyle = ACTIVITY_COLORS[latest.kind] ?? '#6c71c4';
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.roundRect(cx - pillW / 2, curY, pillW, pillH, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, cx, curY + py);
          curY -= gap;
        }

        // ── Timer pill (above activity, or directly above head) ───
        let timerLabel, timerColor;
        if (ch.isActive) {
          const elapsed = ch.startedAt ? (Date.now() - ch.startedAt) / 1000 : 0;
          timerLabel = 'coding ' + fmtDuration(elapsed);
          timerColor = '#2aa198';
        } else if (ch.inactiveTimer < 5 * 60) {
          timerLabel = 'idle ' + fmtDuration(ch.inactiveTimer);
          timerColor = '#93a1a1';
        } else {
          timerLabel = 'asleep ' + fmtDuration(ch.inactiveTimer - 5 * 60);
          timerColor = '#6c71c4';
        }
        const ttw   = ctx.measureText(timerLabel).width;
        const tpillW = ttw + px * 2;
        curY -= pillH;
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath();
        ctx.roundRect(cx - tpillW / 2, curY, tpillW, pillH, 3);
        ctx.fill();
        ctx.fillStyle = timerColor;
        ctx.fillText(timerLabel, cx, curY + py);
      }});

      // ── Name tag below feet (always bottom-most) ──────────────────────────
      drawables.push({ zY: charZY + 0.01, draw: () => {
        const nx   = Math.round(offsetX + ch.x * zoom);
        const ny   = Math.round(offsetY + (ch.y + sittingOff) * zoom) + Math.max(2, Math.round(2 * zoom / 3));
        const fs   = Math.max(9, Math.round(9 * zoom / 3));
        const px   = Math.max(4, Math.round(4 * zoom / 3));
        const py   = Math.max(2, Math.round(2 * zoom / 3));
        const pillH = fs + py * 2;
        ctx.font = `bold ${fs}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tw   = ctx.measureText(ch.name).width;
        const pillW = tw + px * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.beginPath();
        ctx.roundRect(nx - pillW / 2, ny, pillW, pillH, 3);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ch.name, nx, ny + py);
      }});
    }

    drawables.sort((a, b) => a.zY - b.zY);
    for (const d of drawables) d.draw();
  }

  function renderBubbles(offsetX, offsetY) {
    for (const ch of characters.values()) {
      if (!ch.bubbleType) continue;
      const bubbleSrc = ch.bubbleType === 'permission' ? bubblePermissionCanvas
                      : ch.bubbleType === 'sleeping'   ? bubbleSleepingCanvas
                      : bubbleWaitingCanvas;
      if (!bubbleSrc) continue;

      let alpha = 1.0;
      if (ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DUR) {
        alpha = ch.bubbleTimer / BUBBLE_FADE_DUR;
      }

      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const bw = bubbleSrc.width * zoom;
      const bh = bubbleSrc.height * zoom;
      const bx = Math.round(offsetX + ch.x * zoom - bw / 2);
      const by = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET) * zoom - bh - zoom);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bubbleSrc, bx, by, bw, bh);
      ctx.restore();
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
    const { offsetX, offsetY } = computeOffset();
    ctx.imageSmoothingEnabled = false;
    renderTiles(offsetX, offsetY);
    renderScene(offsetX, offsetY);
    renderBubbles(offsetX, offsetY);
  }

  // ── Hit testing ───────────────────────────────────────────────────────────
  function getCharacterAt(px, py) {
    const { offsetX, offsetY } = computeOffset();
    for (const [id, ch] of characters.entries()) {
      const sittingOff = ch.state === STATE.TYPE ? CHAR_SITTING_OFFSET : 0;
      const sw = CHAR_W * zoom;
      const sh = CHAR_H * zoom;
      const drawX = Math.round(offsetX + ch.x * zoom - sw / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - sh);
      if (px >= drawX && px <= drawX + sw && py >= drawY && py <= drawY + sh) {
        return { id, ch };
      }
    }
    return null;
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const LOG_ICONS = {
    prompt:   '>',  thinking: '...', read: 'r',
    edit:     'e',  bash:     '$',   mcp:  'm',
    input:    '?',  done:     'ok',  error:'!',
  };

  function fmtDuration(secs) {
    secs = Math.floor(secs);
    if (secs < 60) return secs + 's';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
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

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function openPanel(sessionId) {
    activePanelId = sessionId;
    const panel   = document.getElementById('sidebar-panel');
    const title   = document.getElementById('panel-title');
    const cwdEl   = document.getElementById('panel-cwd');
    const logEl   = document.getElementById('panel-log');

    const session = Array.from(characters.values()).find(c => c.sessionId === sessionId);
    const displayName = session ? session.name : sessionId.slice(0, 8);
    title.textContent = displayName;

    // Try to get cwd from the session data we received
    const rawSessions = window.__obsSessions || [];
    const s = rawSessions.find(s => s.id === sessionId);
    if (s) {
      title.textContent = displayName + ' · ' + (s.type === 'claude' ? 'Claude' : 'Cursor');
      cwdEl.textContent = s.cwd || '';
    }

    // Render full log
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
    const logEl = document.getElementById('panel-log');
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

    const rawSessions = window.__obsSessions || [];
    for (const s of rawSessions) {
      const dot = document.createElement('div');
      dot.className = `s-dot st-${s.state}${s.id === activePanelId ? ' active' : ''}`;
      const ch2 = characters.get(s.id);
      const charName = ch2 ? ch2.name : (s.type === 'claude' ? 'Claude' : 'Cursor');
      dot.title = charName + ' · ' + s.id.slice(0,8);
      const ch = characters.get(s.id);
      const faceCanvas = ch != null ? charFaceCanvases[ch.palette] : null;
      if (faceCanvas) {
        const dc = document.createElement('canvas');
        dc.width = 22; dc.height = 22;
        dc.style.imageRendering = 'pixelated';
        const dctx = dc.getContext('2d');
        dctx.imageSmoothingEnabled = false;
        const dstW = 22;
        const dstH = Math.round(14 * (22 / 16)); // ~19px, preserve aspect
        const dstY = Math.round((22 - dstH) / 2);
        dctx.drawImage(faceCanvas, 0, 0, 16, 14, 0, dstY, dstW, dstH);
        dot.appendChild(dc);
      } else {
        dot.textContent = s.type === 'claude' ? 'C' : 'V';
      }
      dot.addEventListener('click', () => {
        if (activePanelId === s.id) { closePanel(); } else { openPanel(s.id); }
      });
      dots.appendChild(dot);
    }

    // Update toggle arrow direction
    const toggle = document.getElementById('strip-toggle');
    if (toggle) toggle.textContent = activePanelId ? '→' : '←';
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connectWS() {
    const wsUrl = `ws://${location.host}/ws`;
    ws = new WebSocket(wsUrl);
    ws.onopen = () => setStatus(true);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'sessions') {
          window.__obsSessions = msg.data || [];
          syncSessions(msg.data || []);
          updateStrip();
        } else if (msg.type === 'logs') {
          // Full log history on connect
          for (const [id, entries] of Object.entries(msg.data || {})) {
            sessionLogs.set(id, entries);
          }
          if (activePanelId) openPanel(activePanelId);
        } else if (msg.type === 'log_append') {
          appendToPanel(msg.sessionId, msg.entry);
          if (msg.sessionId !== activePanelId) updateStrip(); // dot state update handled by sessions msg
        }
      } catch {}
    };
    ws.onclose = () => { setStatus(false); setTimeout(connectWS, 3000); };
    ws.onerror = () => ws.close();
  }

  function sendFocus(sessionId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'focus', sessionId }));
    }
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function setStatus(connected) {
    const dot   = document.getElementById('ws-dot');
    const label = document.getElementById('ws-label');
    if (dot)   dot.classList.toggle('connected', connected);
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
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top)  * scaleY;
      const hit = getCharacterAt(px, py);
      if (hit) {
        if (activePanelId === hit.id) {
          closePanel();
        } else {
          openPanel(hit.id);
        }
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top)  * scaleY;
      canvas.style.cursor = getCharacterAt(px, py) ? 'pointer' : 'default';
    });

    document.getElementById('panel-close').addEventListener('click', closePanel);
    document.getElementById('strip-toggle').addEventListener('click', () => {
      if (activePanelId) {
        closePanel();
      } else {
        const sessions = window.__obsSessions || [];
        if (sessions.length > 0) openPanel(sessions[0].id);
      }
    });
    updateStrip();
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth - 44; // 44px sidebar strip
    const H = window.innerHeight;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.imageSmoothingEnabled = false;
    computeZoom();
    // Recompute furniture positions after zoom change (sizes are zoom-dependent in render)
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
