import { BaseGame } from '../../framework/BaseGame.js';

// Bit Merge: slide the tiles, merge equal powers of two, and ship 2048.
// It reuses the Maze Paint / Pattern Recall shell (the mp-* styles) and adds the bm-* tile styles.

const MODES = {
  Classic: { size: 4, label: 'CLASSIC 4×4' },
  Roomy: { size: 5, label: 'ROOMY 5×5' }
};
const GOAL = 2048;
const SLIDE_MS = 110;
const SWIPE_MIN = 24;
const FORMATS = ['DEC', 'HEX', 'BIN'];
const STORE_PREFIX = 'bit_merge_v1_';
const FORMAT_KEY = 'bit_merge_format';

const DIRS = {
  up: { dr: -1, dc: 0, keys: ['ArrowUp', 'KeyW'] },
  down: { dr: 1, dc: 0, keys: ['ArrowDown', 'KeyS'] },
  left: { dr: 0, dc: -1, keys: ['ArrowLeft', 'KeyA'] },
  right: { dr: 0, dc: 1, keys: ['ArrowRight', 'KeyD'] }
};

function load(mode) {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_PREFIX + mode) || 'null');
    if (!s || !Array.isArray(s.cells)) return null;
    return s;
  } catch {
    return null;
  }
}

function save(mode, state) {
  try {
    localStorage.setItem(STORE_PREFIX + mode, JSON.stringify(state));
  } catch {
    // Saving is a nicety; private mode / full storage must never break the game.
  }
}

// Digits in the chosen number format, and a font scale that keeps long values inside the tile
function show(v, format) {
  if (format === 'HEX') return `0x${v.toString(16).toUpperCase()}`;
  if (format === 'BIN') return v.toString(2);
  return String(v);
}

function fontScale(len) {
  const scale = [0.5, 0.5, 0.5, 0.42, 0.34, 0.28, 0.24, 0.21, 0.19, 0.17, 0.155, 0.14, 0.13];
  return scale[Math.min(len, scale.length - 1)];
}

export class BitMergeGame extends BaseGame {
  constructor() {
    super({
      id: 'bit-merge',
      name: 'Bit Merge',
      subtitle: 'Merge Bits, Ship 2048',
      description: 'Slide the tiles and merge equal powers of two. Reach 2048 to ship it, then keep going for a higher score. Flip the numbers between decimal, hex and binary.',
      icon: '🧮',
      badge: '2D Puzzle',
      genre: 'Puzzle',
      players: '1 Player',
      modes: Object.keys(MODES)
    });

    // DOM-based game: it owns an element instead of drawing on the shared WebGL scene.
    this.hasCustomRender = true;

    this.root = null;
    this.els = {};
    this.n = 4;
    this.format = 'DEC';
    this.tiles = [];
    this.grid = [];
    this.score = 0;
    this.best = 0;
    this.moves = 0;
    this.won = false;
    this.keepGoing = false;
    this.over = false;
    this.undoState = null;
    this.busy = false;
    this._timers = [];
    this._nextId = 1;
    this._swipe = null;
    this.reported = 0; // the best score of this run already sent to the leaderboard
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async init(engine) {
    await super.init(engine);

    this.root = document.createElement('div');
    this.root.className = 'mp-root';
    this.root.innerHTML = `
      <div class="mp-wrap">
        <div class="mp-head">
          <div><div class="mp-level" data-mp="mode"></div><h2 class="mp-name">Bit Merge</h2></div>
          <div class="bm-scores">
            <div class="bm-score"><span>SCORE</span><b data-mp="score">0</b></div>
            <div class="bm-score"><span>BEST</span><b data-mp="best">0</b></div>
          </div>
        </div>
        <div class="bm-board" data-mp="board">
          <div class="bm-slots" data-mp="slots"></div>
          <div class="bm-tiles" data-mp="tiles"></div>
        </div>
        <p class="mp-msg" data-mp="msg" aria-live="polite"></p>
        <div class="mp-actions" data-mp="actions">
          <button type="button" class="mp-btn" data-mp="undo">Undo <kbd>Z</kbd></button>
          <button type="button" class="mp-btn" data-mp="format">DEC</button>
          <button type="button" class="mp-btn" data-mp="newgame">New game <kbd>R</kbd></button>
        </div>
        <div class="mp-win" data-mp="win" hidden>
          <h3 data-mp="win-title"></h3>
          <p data-mp="win-sub"></p>
          <button type="button" class="mp-btn primary" data-mp="cont">Keep going</button>
          <button type="button" class="mp-btn" data-mp="again">New game</button>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-mp]').forEach(el => (this.els[el.dataset.mp] = el));
    engine.container.appendChild(this.root);
    engine.renderer.domElement.style.visibility = 'hidden';

    try {
      const f = localStorage.getItem(FORMAT_KEY);
      if (FORMATS.includes(f)) this.format = f;
    } catch {
      // keep the default format
    }

    // Swipe (touch or mouse drag) on the board
    const b = this.els.board;
    b.addEventListener('pointerdown', e => {
      this._swipe = { x: e.clientX, y: e.clientY };
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // swipes still work without capture
      }
    });
    const end = e => {
      const s = this._swipe;
      this._swipe = null;
      if (!s || e.type === 'pointercancel') return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('contextmenu', e => e.preventDefault());

    this.els.undo.addEventListener('click', () => this.undo());
    this.els.newgame.addEventListener('click', () => this.newGame());
    this.els.again.addEventListener('click', () => this.newGame());
    this.els.cont.addEventListener('click', () => this.continueAfterWin());
    this.els.format.addEventListener('click', () => this.cycleFormat());
  }

  start(mode) {
    super.start(mode);
    this.mode = MODES[mode] ? mode : 'Classic';
    this.n = MODES[this.mode].size;
    this.buildBoard();
    const saved = load(this.mode);
    this.best = saved?.best || 0;
    if (saved && saved.cells.length === this.n * this.n && saved.cells.some(v => v > 0) && !saved.over) {
      this.restore(saved);
    } else {
      this.newGame(true);
    }
  }

  destroy() {
    super.destroy();
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this.root?.remove();
    this.root = null;
    this.els = {};
    if (this.engine) this.engine.renderer.domElement.style.visibility = '';
  }

  render() {
    // DOM game: nothing to draw on the shared canvas.
  }

  // -------------------------------------------------------------------------
  // Board
  // -------------------------------------------------------------------------
  buildBoard() {
    const { board, slots, tiles } = this.els;
    board.style.setProperty('--n', this.n);
    board.dataset.format = this.format;
    slots.textContent = '';
    for (let i = 0; i < this.n * this.n; i++) slots.appendChild(document.createElement('i'));
    tiles.textContent = '';
    this.els.mode.textContent = MODES[this.mode].label;
    this.els.format.textContent = this.format;
  }

  later(fn, ms) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter(t => t !== id);
      fn();
    }, ms);
    this._timers.push(id);
  }

  cell(r, c) {
    return this.grid[r * this.n + c];
  }

  setCell(r, c, tile) {
    this.grid[r * this.n + c] = tile;
  }

  makeTile(v, r, c, fresh = true) {
    const el = document.createElement('div');
    el.className = 'bm-tile' + (fresh ? ' new' : '');
    el.appendChild(document.createElement('span'));
    this.els.tiles.appendChild(el);
    const tile = { id: this._nextId++, v, r, c, el };
    this.setCell(r, c, tile);
    this.tiles.push(tile);
    this.paint(tile);
    return tile;
  }

  /** Update a tile's position, colour and label from its state. */
  paint(tile) {
    const { el, v } = tile;
    const k = Math.log2(v);
    el.style.setProperty('--r', tile.r);
    el.style.setProperty('--c', tile.c);
    el.dataset.k = Math.min(k, 14);
    const text = show(v, this.format);
    const span = el.firstChild;
    span.textContent = text;
    span.style.fontSize = `calc(var(--cell) * ${fontScale(text.length)})`;
  }

  repaintAll() {
    this.tiles.forEach(t => this.paint(t));
  }

  clearTiles() {
    this.els.tiles.textContent = '';
    this.tiles = [];
    this.grid = new Array(this.n * this.n).fill(null);
  }

  snapshot() {
    return { cells: this.grid.map(t => (t ? t.v : 0)), score: this.score, moves: this.moves };
  }

  restore(state) {
    this.clearTiles();
    state.cells.forEach((v, i) => {
      if (v > 0) this.makeTile(v, Math.floor(i / this.n), i % this.n, false);
    });
    this.score = state.score || 0;
    this.moves = state.moves || 0;
    this.won = !!state.won;
    this.keepGoing = !!state.keepGoing;
    this.over = false;
    this.undoState = null;
    this.busy = false;
    this.els.win.hidden = true;
    this.els.actions.hidden = false;
    this.refresh();
  }

  /** Send this run's score to the leaderboard (once per improvement). */
  reportScore() {
    if (this.score > this.reported) {
      this.reported = this.score;
      this.engine.account?.report(`bit-merge/${this.mode}`, this.score);
    }
  }

  newGame(silent = false) {
    if (this.root) this.reportScore(); // the run that is ending
    this.reported = 0;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this.clearTiles();
    this.score = 0;
    this.moves = 0;
    this.won = false;
    this.keepGoing = false;
    this.over = false;
    this.undoState = null;
    this.busy = false;
    this.els.win.hidden = true;
    this.els.actions.hidden = false;
    this.spawn();
    this.spawn();
    this.persist();
    this.refresh();
    if (!silent) this.audio?.click();
  }

  spawn() {
    const empty = [];
    for (let r = 0; r < this.n; r++) for (let c = 0; c < this.n; c++) if (!this.cell(r, c)) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    this.makeTile(Math.random() < 0.9 ? 2 : 4, r, c);
  }

  // -------------------------------------------------------------------------
  // Moving
  // -------------------------------------------------------------------------
  move(dir) {
    if (this.busy || this.over || !this.root || !this.els.win.hidden) return false;
    const { dr, dc } = DIRS[dir];
    const before = this.snapshot();
    const n = this.n;

    // Visit tiles nearest the wall first so each one slides as far as it can
    const rows = [...Array(n).keys()];
    const cols = [...Array(n).keys()];
    if (dr > 0) rows.reverse();
    if (dc > 0) cols.reverse();

    const absorbed = []; // tiles that slide into another tile and vanish
    const mergedInto = new Set();
    let moved = false;
    let gained = 0;
    let biggest = 0;

    for (const r of rows) {
      for (const c of cols) {
        const tile = this.cell(r, c);
        if (!tile) continue;
        let rr = r;
        let cc = c;
        while (true) {
          const nr = rr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= n || nc >= n) break;
          const next = this.cell(nr, nc);
          if (!next) {
            rr = nr;
            cc = nc;
            continue;
          }
          if (next.v === tile.v && !mergedInto.has(next.id)) {
            // merge: this tile slides onto the other, which doubles
            this.setCell(r, c, null);
            absorbed.push({ tile, into: next });
            mergedInto.add(next.id);
            next.v *= 2;
            gained += next.v;
            biggest = Math.max(biggest, next.v);
            tile.r = nr;
            tile.c = nc;
            moved = true;
            rr = -1;
          }
          break;
        }
        if (rr === -1) continue;
        if (rr !== r || cc !== c) {
          this.setCell(r, c, null);
          this.setCell(rr, cc, tile);
          tile.r = rr;
          tile.c = cc;
          moved = true;
        }
      }
    }
    if (!moved) return false;

    this.undoState = before;
    this.moves++;
    this.score += gained;
    if (this.score > this.best) this.best = this.score;
    this.busy = true;

    // Slide everything, then tidy up once the slide has finished
    this.tiles.forEach(t => {
      t.el.style.setProperty('--r', t.r);
      t.el.style.setProperty('--c', t.c);
      t.el.classList.remove('new', 'merged');
    });
    this.audio?.beep(280 + Math.log2(Math.max(2, biggest || 2)) * 55, 0.06, biggest ? 'triangle' : 'sine', biggest ? 0.2 : 0.1);

    this.later(() => {
      absorbed.forEach(({ tile, into }) => {
        tile.el.remove();
        this.tiles = this.tiles.filter(t => t !== tile);
        this.paint(into);
        into.el.classList.add('merged');
      });
      this.spawn();
      this.busy = false;
      this.afterMove(biggest);
    }, SLIDE_MS);
    this.refresh();
    return true;
  }

  afterMove(biggest) {
    this.persist();
    const top = Math.max(...this.tiles.map(t => t.v));
    if (!this.won && !this.keepGoing && top >= GOAL) {
      this.won = true;
      this.reportScore();
      this.showPanel(`Shipped! ${show(GOAL, this.format)}`, `Score ${this.score.toLocaleString()} · ${this.moves} moves`, true);
      this.audio?.victory?.();
    } else if (!this.canMove()) {
      this.over = true;
      this.reportScore();
      this.persist();
      this.showPanel('No moves left', `Score ${this.score.toLocaleString()} · best tile ${show(top, this.format)}`, false);
      this.audio?.crash?.();
    } else if (biggest >= 128) {
      this.audio?.chime?.();
    }
    this.refresh();
  }

  canMove() {
    const n = this.n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const t = this.cell(r, c);
        if (!t) return true;
        if (c + 1 < n && this.cell(r, c + 1)?.v === t.v) return true;
        if (r + 1 < n && this.cell(r + 1, c)?.v === t.v) return true;
      }
    }
    return false;
  }

  showPanel(title, sub, canContinue) {
    this.els['win-title'].textContent = title;
    this.els['win-sub'].textContent = sub;
    this.els.cont.hidden = !canContinue;
    this.els.win.hidden = false;
    this.els.actions.hidden = true;
  }

  continueAfterWin() {
    this.keepGoing = true;
    this.els.win.hidden = true;
    this.els.actions.hidden = false;
    this.persist();
    this.refresh();
  }

  undo() {
    if (!this.undoState || this.busy || !this.root) return;
    const s = this.undoState;
    const state = { ...s, won: this.won, keepGoing: this.keepGoing };
    this.restore(state);
    this.persist();
    this.audio?.click();
  }

  cycleFormat() {
    this.format = FORMATS[(FORMATS.indexOf(this.format) + 1) % FORMATS.length];
    this.els.format.textContent = this.format;
    this.els.board.dataset.format = this.format;
    try {
      localStorage.setItem(FORMAT_KEY, this.format);
    } catch {
      // the format simply won't be remembered
    }
    this.repaintAll();
    this.refresh();
    this.audio?.click();
  }

  persist() {
    save(this.mode, { ...this.snapshot(), best: this.best, won: this.won, keepGoing: this.keepGoing, over: this.over });
  }

  // -------------------------------------------------------------------------
  // Input and HUD
  // -------------------------------------------------------------------------
  update(dt, input) {
    if (!this.root) return;
    for (const [dir, d] of Object.entries(DIRS)) {
      if (d.keys.some(k => input.wasJustPressed(k))) {
        this.move(dir);
        break;
      }
    }
    if (input.wasJustPressed('KeyZ') || input.wasJustPressed('Backspace')) this.undo();
    if (input.wasJustPressed('KeyR')) this.newGame();
    if (!this.els.win.hidden && (input.wasJustPressed('Enter') || input.wasJustPressed('Space'))) {
      if (this.won && !this.keepGoing && !this.over) this.continueAfterWin();
      else this.newGame();
    }
  }

  refresh() {
    const e = this.els;
    e.score.textContent = this.score.toLocaleString();
    e.best.textContent = this.best.toLocaleString();
    e.undo.disabled = !this.undoState;
    e.msg.textContent = this.over
      ? ''
      : `Swipe or use the arrow keys. Merge equal tiles to reach ${show(GOAL, this.format)}.`;
  }

  getHUDHtml() {
    return '';
  }

  getControlsGuide() {
    return [
      { label: 'Slide tiles', keys: 'Arrow keys / W A S D · swipe' },
      { label: 'Undo last move', keys: 'Z / Backspace' },
      { label: 'New game', keys: 'R' },
      { label: 'Keep going after 2048', keys: 'ENTER / SPACE' },
      { label: 'Decimal / hex / binary', keys: 'Format button' },
      { label: 'Return to Lobby', keys: 'Lobby Button' }
    ];
  }
}
