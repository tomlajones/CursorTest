(() => {
  "use strict";

  const COLS = 10;
  const VISIBLE_ROWS = 20;
  const HIDDEN_ROWS = 2;
  const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

  // 4x4 matrices for rotation. Values are 1 for filled cells, 0 otherwise.
  const baseMatrices = {
    I: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    J: [
      [1, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    L: [
      [0, 0, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    O: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    S: [
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    T: [
      [0, 1, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    Z: [
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  };

  const pieceColors = {
    I: "#38bdf8",
    J: "#60a5fa",
    L: "#fb923c",
    O: "#facc15",
    S: "#34d399",
    T: "#f472b6",
    Z: "#fb7185",
  };

  function rotateMatrixCW(m) {
    // m[y][x] => out[y][x] rotated 90 degrees clockwise.
    const out = Array.from({ length: 4 }, () => Array(4).fill(0));
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        out[y][x] = m[3 - x][y];
      }
    }
    return out;
  }

  function matrixToBlocks(m) {
    const blocks = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (m[y][x]) blocks.push({ x, y });
      }
    }
    return blocks;
  }

  const SHAPES = {};
  for (const [type, base] of Object.entries(baseMatrices)) {
    const rotations = [base];
    for (let i = 1; i < 4; i++) rotations.push(rotateMatrixCW(rotations[i - 1]));
    SHAPES[type] = {
      rotations,
      blocks: rotations.map(matrixToBlocks),
    };
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 7-bag randomizer for fair piece distribution.
  const PIECE_TYPES = Object.keys(baseMatrices);
  let bag = [];
  function drawType() {
    if (bag.length === 0) {
      bag = shuffleInPlace([...PIECE_TYPES]);
    }
    return bag.pop();
  }

  // UI elements.
  const els = {
    startStop: document.getElementById("startStop"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlaySubtitle: document.getElementById("overlaySubtitle"),
    overlayAction: document.getElementById("overlayAction"),
    scoreValue: document.getElementById("scoreValue"),
    levelValue: document.getElementById("levelValue"),
    linesValue: document.getElementById("linesValue"),
    linesPerLevel: document.getElementById("linesPerLevel"),
    gameCanvas: document.getElementById("gameCanvas"),
    nextCanvas: document.getElementById("nextCanvas"),
    boardWrap: document.getElementById("boardWrap"),
  };

  const boardCtx = els.gameCanvas.getContext("2d");
  const nextCtx = els.nextCanvas.getContext("2d");

  const state = {
    board: emptyBoard(),
    active: null,
    nextType: null,

    score: 0,
    linesTotal: 0,
    level: 1,

    running: false,
    gameOver: false,
    softDrop: false,

    // Rendering metrics computed on resize.
    metrics: {
      cell: 24,
      width: 240,
      height: 480,
      dpr: 1,
    },
  };

  function selectedLinesPerLevel() {
    const n = parseInt(els.linesPerLevel.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  function computeLevel() {
    return 1 + Math.floor(state.linesTotal / selectedLinesPerLevel());
  }

  function dropIntervalMs(level) {
    // Gravity accelerates with level; clamped to keep it playable.
    const base = 850;
    const interval = base * Math.pow(0.86, Math.max(0, level - 1));
    return Math.max(55, interval);
  }

  function spawnPiece(type) {
    // Center in 10-wide board with a 4-wide matrix.
    const x = Math.floor((COLS - 4) / 2);
    const y = -2;
    return { type, rotation: 0, x, y };
  }

  function canPlace(piece) {
    const blocks = SHAPES[piece.type].blocks[piece.rotation];
    for (const b of blocks) {
      const x = piece.x + b.x;
      const y = piece.y + b.y;
      if (x < 0 || x >= COLS) return false;
      if (y >= ROWS) return false;
      if (y >= 0 && state.board[y][x]) return false;
    }
    return true;
  }

  function tryMove(dx, dy) {
    if (!state.active) return false;
    const next = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
    if (!canPlace(next)) return false;
    state.active = next;
    return true;
  }

  function attemptRotate(dir) {
    if (!state.active) return;
    const newRot = (state.active.rotation + (dir > 0 ? 1 : 3)) % 4;
    const tests = [
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -2, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: -1 },
    ];

    for (const t of tests) {
      const candidate = {
        ...state.active,
        rotation: newRot,
        x: state.active.x + t.x,
        y: state.active.y + t.y,
      };
      if (canPlace(candidate)) {
        state.active = candidate;
        return;
      }
    }
  }

  function lockPiece() {
    if (!state.active) return;
    const blocks = SHAPES[state.active.type].blocks[state.active.rotation];
    for (const b of blocks) {
      const x = state.active.x + b.x;
      const y = state.active.y + b.y;
      if (y < 0) {
        state.gameOver = true;
        state.running = false;
        return;
      }
      state.board[y][x] = pieceColors[state.active.type];
    }

    const cleared = clearLines();
    if (cleared > 0) {
      const mult = state.level;
      const lineScores = { 1: 100, 2: 300, 3: 500, 4: 800 };
      state.score += (lineScores[cleared] || 0) * mult;
      state.linesTotal += cleared;
      state.level = computeLevel();
    }

    // Spawn next.
    state.active = spawnPiece(state.nextType);
    state.nextType = drawType();
    if (!canPlace(state.active)) {
      state.gameOver = true;
      state.running = false;
    }

    state.softDrop = false;
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      let full = true;
      for (let x = 0; x < COLS; x++) {
        if (!state.board[y][x]) {
          full = false;
          break;
        }
      }
      if (full) {
        state.board.splice(y, 1);
        state.board.unshift(Array(COLS).fill(null));
        cleared++;
      }
    }
    return cleared;
  }

  function hardDrop() {
    if (!state.active) return 0;
    let dist = 0;
    while (tryMove(0, 1)) dist++;
    return dist;
  }

  function startNewGame() {
    state.board = emptyBoard();
    state.score = 0;
    state.linesTotal = 0;
    state.level = 1;
    state.gameOver = false;
    state.running = true;
    state.softDrop = false;
    bag = [];

    state.nextType = drawType();
    state.active = spawnPiece(drawType());
    if (!canPlace(state.active)) {
      state.gameOver = true;
      state.running = false;
    }

    updateHUD();
    showOverlay("Running", "Clear lines to advance levels.");
    els.startStop.textContent = "Stop";
    syncButtons();
    resetTiming();
  }

  function showOverlay(title, subtitle) {
    if (!state.gameOver && state.running) {
      els.overlay.classList.add("hidden");
      return;
    }
    if (state.gameOver) {
      els.overlayTitle.textContent = title || "Game Over";
      els.overlaySubtitle.textContent = subtitle || "Press Start to play again.";
      els.overlayAction.textContent = "Start";
    } else {
      els.overlayTitle.textContent = title || "Paused";
      els.overlaySubtitle.textContent = subtitle || "Press Start to resume.";
      els.overlayAction.textContent = "Start";
    }
    els.overlay.classList.remove("hidden");
  }

  function syncButtons() {
    els.startStop.textContent = state.running ? "Stop" : state.gameOver ? "Start" : "Start";
    els.overlayAction.textContent = state.gameOver ? "Start" : "Start";
  }

  function toggleStartStop() {
    if (state.gameOver) {
      startNewGame();
      return;
    }
    if (!state.running) {
      state.running = true;
      state.softDrop = false;
      state.gameOver = false;
      showOverlay("Running", "Clear lines to advance levels.");
      els.startStop.textContent = "Stop";
      resetTiming();
      return;
    }
    state.running = false;
    state.softDrop = false;
    syncButtons();
    showOverlay("Paused", "Press Start to resume.");
  }

  function resetTiming() {
    lastTime = performance.now();
    dropCounter = 0;
  }

  function updateHUD() {
    els.scoreValue.textContent = String(state.score);
    els.levelValue.textContent = String(state.level);
    els.linesValue.textContent = String(state.linesTotal);
  }

  // -------- Rendering --------
  function resize() {
    const rect = els.boardWrap.getBoundingClientRect();
    const availableW = rect.width;
    const availableH = rect.height;
    const cell = Math.floor(Math.min(availableW / COLS, availableH / VISIBLE_ROWS));

    const width = cell * COLS;
    const height = cell * VISIBLE_ROWS;
    const dpr = window.devicePixelRatio || 1;

    state.metrics.cell = Math.max(12, cell);
    state.metrics.width = width;
    state.metrics.height = height;
    state.metrics.dpr = dpr;

    // Scale canvas to device pixels while keeping drawing units in CSS pixels.
    els.gameCanvas.style.width = `${state.metrics.width}px`;
    els.gameCanvas.style.height = `${state.metrics.height}px`;
    els.gameCanvas.width = Math.floor(state.metrics.width * dpr);
    els.gameCanvas.height = Math.floor(state.metrics.height * dpr);
    boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Next canvas: keep it crisp but respect CSS sizing.
    const nextSize = Math.min(
      els.nextCanvas.parentElement.getBoundingClientRect().width - 2,
      240
    );
    const nextCss = Math.floor(nextSize);
    els.nextCanvas.style.width = `${nextCss}px`;
    els.nextCanvas.style.height = `${nextCss}px`;
    els.nextCanvas.width = Math.floor(nextCss * dpr);
    els.nextCanvas.height = Math.floor(nextCss * dpr);
    nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawRoundedBlock(x, y, size, color, alpha = 1) {
    const r = Math.max(2, Math.floor(size * 0.18));
    const pad = Math.max(1, Math.floor(size * 0.08));
    const w = size - pad * 2;
    const h = size - pad * 2;
    const px = x + pad;
    const py = y + pad;

    boardCtx.globalAlpha = alpha;

    // Base fill.
    boardCtx.fillStyle = color;
    boardCtx.strokeStyle = "rgba(255,255,255,0.25)";
    boardCtx.lineWidth = Math.max(1, size * 0.06);

    boardCtx.beginPath();
    boardCtx.moveTo(px + r, py);
    boardCtx.arcTo(px + w, py, px + w, py + h, r);
    boardCtx.arcTo(px + w, py + h, px, py + h, r);
    boardCtx.arcTo(px, py + h, px, py, r);
    boardCtx.arcTo(px, py, px + w, py, r);
    boardCtx.closePath();
    boardCtx.fill();
    boardCtx.stroke();

    // Subtle highlight.
    boardCtx.fillStyle = "rgba(255,255,255,0.18)";
    boardCtx.fillRect(px + pad, py + pad, w - 2 * pad, Math.max(2, h * 0.22));

    boardCtx.globalAlpha = 1;
  }

  function drawGhostPiece() {
    if (!state.active || state.gameOver) return;
    const ghost = { ...state.active };
    while (tryCanMovePiece(ghost, 0, 1)) ghost.y += 1;
    drawPiece(ghost, 0.22, true);
  }

  function tryCanMovePiece(piece, dx, dy) {
    const candidate = { ...piece, x: piece.x + dx, y: piece.y + dy };
    return canPlace(candidate);
  }

  function drawPiece(piece, alpha = 1, isGhost = false) {
    const { cell } = state.metrics;
    const blocks = SHAPES[piece.type].blocks[piece.rotation];
    const color = pieceColors[piece.type];

    for (const b of blocks) {
      const x = (piece.x + b.x) * cell;
      const yRow = piece.y + b.y;
      const y = (yRow - HIDDEN_ROWS) * cell;
      if (yRow < HIDDEN_ROWS) continue; // not visible yet
      drawRoundedBlock(x, y, cell, color, alpha);

      if (isGhost) {
        boardCtx.strokeStyle = "rgba(255,255,255,0.4)";
        boardCtx.lineWidth = Math.max(1, cell * 0.05);
        boardCtx.strokeRect(x, y, cell, cell);
      }
    }
  }

  function drawBoard() {
    const { cell, width, height } = state.metrics;
    boardCtx.clearRect(0, 0, width, height);

    // Board background.
    boardCtx.fillStyle = "rgba(0,0,0,0.35)";
    boardCtx.fillRect(0, 0, width, height);

    // Grid.
    boardCtx.strokeStyle = "rgba(255,255,255,0.06)";
    boardCtx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      boardCtx.beginPath();
      boardCtx.moveTo(x * cell + 0.5, 0);
      boardCtx.lineTo(x * cell + 0.5, height);
      boardCtx.stroke();
    }
    for (let y = 0; y <= VISIBLE_ROWS; y++) {
      boardCtx.beginPath();
      boardCtx.moveTo(0, y * cell + 0.5);
      boardCtx.lineTo(width, y * cell + 0.5);
      boardCtx.stroke();
    }

    // Locked blocks.
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const color = state.board[y][x];
        if (!color) continue;
        const px = x * cell;
        const py = (y - HIDDEN_ROWS) * cell;
        drawRoundedBlock(px, py, cell, color, 1);
      }
    }
  }

  function renderNext() {
    const canvasW = els.nextCanvas.width / state.metrics.dpr;
    const canvasH = els.nextCanvas.height / state.metrics.dpr;
    const size = Math.min(canvasW, canvasH);
    nextCtx.clearRect(0, 0, canvasW, canvasH);

    // Background.
    nextCtx.fillStyle = "rgba(0,0,0,0.25)";
    nextCtx.fillRect(0, 0, canvasW, canvasH);

    // Grid
    const cell = size / 4;
    nextCtx.strokeStyle = "rgba(255,255,255,0.06)";
    nextCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      nextCtx.beginPath();
      nextCtx.moveTo(i * cell + 0.5, 0);
      nextCtx.lineTo(i * cell + 0.5, size);
      nextCtx.stroke();
      nextCtx.beginPath();
      nextCtx.moveTo(0, i * cell + 0.5);
      nextCtx.lineTo(size, i * cell + 0.5);
      nextCtx.stroke();
    }

    if (!state.nextType) return;
    const blocks = SHAPES[state.nextType].blocks[0];
    const color = pieceColors[state.nextType];

    for (const b of blocks) {
      const x = b.x * cell;
      const y = b.y * cell;
      drawNextBlock(x, y, cell, color);
    }
  }

  function drawNextBlock(x, y, cell, color) {
    const r = Math.max(2, Math.floor(cell * 0.18));
    const pad = Math.max(1, Math.floor(cell * 0.08));
    const w = cell - pad * 2;
    const h = cell - pad * 2;
    const px = x + pad;
    const py = y + pad;

    nextCtx.globalAlpha = 1;
    nextCtx.fillStyle = color;
    nextCtx.strokeStyle = "rgba(255,255,255,0.25)";
    nextCtx.lineWidth = Math.max(1, cell * 0.06);

    nextCtx.beginPath();
    nextCtx.moveTo(px + r, py);
    nextCtx.arcTo(px + w, py, px + w, py + h, r);
    nextCtx.arcTo(px + w, py + h, px, py + h, r);
    nextCtx.arcTo(px, py + h, px, py, r);
    nextCtx.arcTo(px, py, px + w, py, r);
    nextCtx.closePath();
    nextCtx.fill();
    nextCtx.stroke();

    nextCtx.fillStyle = "rgba(255,255,255,0.18)";
    nextCtx.fillRect(px + pad, py + pad, w - 2 * pad, Math.max(2, h * 0.22));
  }

  function render() {
    if (!els.gameCanvas || !els.nextCanvas) return;

    drawBoard();
    drawGhostPiece();
    if (state.active && !state.gameOver) drawPiece(state.active, 1, false);
    renderNext();
    // HUD is cheap; keep it in sync.
    updateHUD();
  }

  // -------- Game loop --------
  let lastTime = 0;
  let dropCounter = 0;

  function stepDown() {
    if (!state.active) return;
    if (canMoveDown()) {
      state.active.y += 1;
      if (state.softDrop) state.score += 1;
    } else {
      lockPiece();
    }
  }

  function canMoveDown() {
    const candidate = { ...state.active, y: state.active.y + 1 };
    return canPlace(candidate);
  }

  function update(dt) {
    if (!state.running || state.gameOver || !state.active) return;
    dropCounter += dt;
    const intervalBase = dropIntervalMs(state.level);
    const interval = state.softDrop ? Math.max(20, intervalBase / 20) : intervalBase;

    // Apply as many steps as needed to catch up.
    let safety = 0;
    while (dropCounter >= interval && safety < 10) {
      dropCounter -= interval;
      safety++;
      stepDown();
      if (state.gameOver) break;
    }
  }

  function frame(t) {
    if (!lastTime) lastTime = t;
    const dt = t - lastTime;
    lastTime = t;

    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // -------- Input + wiring --------
  els.startStop.addEventListener("click", () => {
    if (!state.active) {
      // Initial game setup for first click.
      state.nextType = drawType();
      state.active = spawnPiece(state.nextType);
      state.nextType = drawType();
      if (!canPlace(state.active)) state.gameOver = true;
    }
    toggleStartStop();
  });

  els.overlayAction.addEventListener("click", () => {
    if (state.gameOver || !state.active) startNewGame();
    else toggleStartStop();
  });

  els.linesPerLevel.addEventListener("change", () => {
    // Recompute level based on stored total lines.
    state.level = computeLevel();
    if (state.active && state.running) {
      // Gravity interval automatically changes on next tick.
    }
    updateHUD();
  });

  window.addEventListener("keydown", (e) => {
    const targetTag = e.target && e.target.tagName ? e.target.tagName : "";
    if (targetTag === "SELECT" || targetTag === "INPUT" || targetTag === "TEXTAREA") return;

    const isGameActive = state.running && state.active && !state.gameOver;
    const code = e.code;

    if (code === "ArrowLeft") {
      if (!isGameActive) return;
      e.preventDefault();
      tryMove(-1, 0);
      return;
    }
    if (code === "ArrowRight") {
      if (!isGameActive) return;
      e.preventDefault();
      tryMove(1, 0);
      return;
    }
    if (code === "ArrowDown") {
      if (!state.active || state.gameOver) return;
      e.preventDefault();
      if (!state.running) return;
      state.softDrop = true;
      // Immediate step for responsiveness.
      const moved = tryMove(0, 1);
      if (moved) state.score += 1;
      else lockPiece();
      return;
    }

    if (code === "ArrowUp" || code === "KeyX") {
      if (!isGameActive) return;
      e.preventDefault();
      attemptRotate(+1);
      return;
    }
    if (code === "KeyZ") {
      if (!isGameActive) return;
      e.preventDefault();
      attemptRotate(-1);
      return;
    }

    if (code === "Space") {
      if (!isGameActive) return;
      e.preventDefault();
      const dist = hardDrop();
      state.score += dist * 2;
      lockPiece();
      return;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") state.softDrop = false;
  });

  window.addEventListener("blur", () => {
    if (state.running) {
      state.running = false;
      state.softDrop = false;
      syncButtons();
      showOverlay("Paused", "Press Start to resume.");
    }
  });

  function init() {
    resize();
    state.active = null;
    state.nextType = null;
    state.gameOver = false;
    state.running = false;
    els.startStop.textContent = "Start";
    showOverlay("Press Start", "Clear lines to advance levels.");
    updateHUD();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", () => {
    resize();
    render();
  });

  init();
})();
