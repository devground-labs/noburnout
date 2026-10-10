import { BaseGame } from '../../framework/BaseGame.js';
import { LEVELS } from './levels.js';

const DIRS = [
  { codes: ['ArrowUp', 'KeyW'], dx: 0, dy: -1 },
  { codes: ['ArrowDown', 'KeyS'], dx: 0, dy: 1 },
  { codes: ['ArrowLeft', 'KeyA'], dx: -1, dy: 0 },
  { codes: ['ArrowRight', 'KeyD'], dx: 1, dy: 0 }
];

const STORE_KEY = 'maze_paint_progress_v2';
const WAVE_MS = 28;

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      cleared: Array.isArray(p.cleared) ? p.cleared.filter(Number.isInteger) : [],
      best: p.best && typeof p.best === 'object' ? p.best : {}
    };
  } catch {
    return { cleared: [], best: {} };
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Progress is a nicety; private mode / full storage must never break the game.
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export class MazePaintGame extends BaseGame {
  constructor() {
    super({
      id: 'maze-paint',
      name: 'Maze Paint',
      subtitle: 'One Stroke, Every Box',
      description: 'Drag a single path through the maze and paint every box exactly once, without crossing your own trail. Fifty patterns, each one trickier than the last. Clear a level to unlock the next.',
      icon: '🎨',
      badge: '2D Puzzle',
      genre: 'Puzzle',
      players: '1 Player',
      modes: ['Levels']
    });

    // DOM-based game: it owns an element instead of drawing on the shared WebGL scene.
    this.hasCustomRender = true;

    this.root = null;
    this.els = {};
    this.progress = loadProgress();
    this.levelIndex = 0;
    this.path = [];
    this.painted = null;
    this.cells = [];
    this.cols = 0;
    this.rows = 0;
    this.openCount = 0;
    this.won = false;
    this.drawing = false;
    this.elapsed = 0;
    this.cursor = { x: 0, y: 0 };
    this._shownSecond = -1;
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
          <div><div class="mp-level" data-mp="level"></div><h2 class="mp-name" data-mp="name"></h2></div>
          <div class="mp-stats"><span data-mp="count"></span><span data-mp="time">0:00</span></div>
        </div>
        <div class="mp-board" data-mp="board">
          <div class="mp-grid" data-mp="grid"></div>
          <svg class="mp-trail" data-mp="trail" aria-hidden="true"></svg>
        </div>
        <p class="mp-msg" data-mp="msg" aria-live="polite"></p>
        <div class="mp-actions" data-mp="actions">
          <button type="button" class="mp-btn" data-mp="undo">Undo <kbd>Z</kbd></button>
          <button type="button" class="mp-btn" data-mp="restart">Restart <kbd>R</kbd></button>
        </div>
        <div class="mp-win" data-mp="win" hidden>
          <h3 data-mp="win-title"></h3>
          <p data-mp="win-sub"></p>
          <button type="button" class="mp-btn primary" data-mp="next"></button>
          <button type="button" class="mp-btn" data-mp="replay">Replay</button>
        </div>
        <button type="button" class="mp-link" data-mp="reset">Reset progress</button>
      </div>`;
    this.root.querySelectorAll('[data-mp]').forEach(el => (this.els[el.dataset.mp] = el));
    engine.container.appendChild(this.root);
    engine.renderer.domElement.style.visibility = 'hidden';

    const g = this.els.grid;
    this._down = e => this.onPointerDown(e);
    this._move = e => this.onPointerMove(e);
    this._up = e => this.onPointerUp(e);
    g.addEventListener('pointerdown', this._down);
    g.addEventListener('pointermove', this._move);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => g.addEventListener(t, this._up));
    g.addEventListener('contextmenu', e => e.preventDefault());

    this.els.undo.addEventListener('click', () => this.undo());
    this.els.restart.addEventListener('click', () => this.restartLevel());
    this.els.replay.addEventListener('click', () => this.restartLevel());
    this.els.next.addEventListener('click', () => this.advance());
    this.els.reset.addEventListener('click', () => this.onResetClick());
  }

  start(mode) {
    super.start(mode);
    // Resume at the first level that hasn't been cleared yet.
    let first = 0;
    while (first < LEVELS.length - 1 && this.progress.cleared.includes(first)) first++;
    this.loadLevel(first);
  }

  destroy() {
    super.destroy();
    clearTimeout(this._resetTimer);
    this.root?.remove();
    this.root = null;
    this.els = {};
    if (this.engine) this.engine.renderer.domElement.style.visibility = '';
  }

  render() {
    // DOM game: nothing to draw on the shared canvas.
  }

  // -------------------------------------------------------------------------
  // Levels
  // -------------------------------------------------------------------------
  // Two taps, so a stray tap can't wipe every cleared level.
  onResetClick() {
    const btn = this.els.reset;
    if (!this._resetArmed) {
      this._resetArmed = true;
      btn.textContent = 'Tap again to erase all progress';
      btn.classList.add('confirm');
      this._resetTimer = setTimeout(() => this.disarmReset(), 4000);
      return;
    }
    this.disarmReset();
    this.progress = { cleared: [], best: {} };
    saveProgress(this.progress);
    this.loadLevel(0);
  }

  disarmReset() {
    clearTimeout(this._resetTimer);
    this._resetArmed = false;
    if (!this.els.reset) return;
    this.els.reset.textContent = 'Reset progress';
    this.els.reset.classList.remove('confirm');
  }

  loadLevel(i) {
    const level = LEVELS[i];
    this.levelIndex = i;
    this.rows = level.grid.length;
    this.cols = level.grid[0].length;
    this.cells = [];
    this.openCount = 0;
    level.grid.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const open = ch !== '#';
        if (open) this.openCount++;
        this.cells.push({ x, y, open });
      });
    });

    const { grid, board } = this.els;
    board.style.setProperty('--cols', this.cols);
    board.style.setProperty('--rows', this.rows);
    this.els.trail.setAttribute('viewBox', `0 0 ${this.cols} ${this.rows}`);
    grid.textContent = '';
    for (const c of this.cells) {
      const d = document.createElement('div');
      d.className = c.open ? 'mp-cell' : 'mp-cell wall';
      c.el = d;
      grid.appendChild(d);
    }

    this.els.name.textContent = level.name;
    this.els.level.textContent = `LEVEL ${i + 1} / ${LEVELS.length}`;
    this.restartLevel();
  }

  restartLevel() {
    this.path = [];
    this.painted = new Set();
    this.won = false;
    this.drawing = false;
    this.elapsed = 0;
    this._shownSecond = -1;
    const first = this.cells.find(c => c.open);
    this.cursor = { x: first.x, y: first.y };
    this.els.board.classList.remove('won');
    this.els.win.hidden = true;
    this.els.actions.hidden = false;
    for (const c of this.cells) c.el.style.removeProperty('--d');
    this.refresh();
  }

  advance() {
    this.loadLevel(this.levelIndex + 1 < LEVELS.length ? this.levelIndex + 1 : 0);
  }

  // -------------------------------------------------------------------------
  // Painting rules
  // -------------------------------------------------------------------------
  idx(x, y) {
    return y * this.cols + x;
  }

  cellAt(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return this.cells[this.idx(x, y)];
  }

  head() {
    return this.path.length ? this.cells[this.path[this.path.length - 1]] : null;
  }

  beginAt(cell) {
    this.path = [this.idx(cell.x, cell.y)];
    this.painted = new Set(this.path);
    this.cursor = { x: cell.x, y: cell.y };
    this.audio?.click();
    this.refresh();
  }

  // Move the trail head onto `cell`: extend onto a free neighbour, or step back one box to erase.
  stepTo(cell) {
    const h = this.head();
    if (!h) {
      this.beginAt(cell);
      return true;
    }
    const i = this.idx(cell.x, cell.y);
    if (Math.abs(cell.x - h.x) + Math.abs(cell.y - h.y) !== 1) return false;
    if (this.path.length > 1 && i === this.path[this.path.length - 2]) {
      this.painted.delete(this.path.pop());
      this.audio?.click();
      this.refresh();
      return true;
    }
    if (!cell.open || this.painted.has(i)) return false;
    this.path.push(i);
    this.painted.add(i);
    this.audio?.click();
    if (this.path.length === this.openCount) this.win();
    this.refresh();
    return true;
  }

  truncateTo(cell) {
    const i = this.idx(cell.x, cell.y);
    const at = this.path.indexOf(i);
    if (at < 0 || at === this.path.length - 1) return;
    for (const dropped of this.path.splice(at + 1)) this.painted.delete(dropped);
    this.audio?.click();
    this.refresh();
  }

  undo() {
    if (this.won || !this.path.length) return;
    this.painted.delete(this.path.pop());
    this.audio?.click();
    this.refresh();
  }

  hasMoves() {
    const h = this.head();
    if (!h) return true;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const n = this.cellAt(h.x + dx, h.y + dy);
      return n && n.open && !this.painted.has(this.idx(n.x, n.y));
    });
  }

  win() {
    this.won = true;
    this.drawing = false;
    const i = this.levelIndex;
    const prevBest = this.progress.best[i];
    const isBest = prevBest === undefined || this.elapsed < prevBest;
    if (isBest) this.progress.best[i] = Math.round(this.elapsed * 10) / 10;
    if (!this.progress.cleared.includes(i)) this.progress.cleared.push(i);
    saveProgress(this.progress);

    const last = i === LEVELS.length - 1;
    const allDone = LEVELS.every((_, n) => this.progress.cleared.includes(n));
    this.path.forEach((ci, n) => this.cells[ci].el.style.setProperty('--d', `${n * WAVE_MS}ms`));
    this.els.board.classList.add('won');
    this.els.actions.hidden = true;
    this.els.win.hidden = false;
    this.els['win-title'].textContent = last && allDone ? `All ${LEVELS.length} cleared!` : `${LEVELS[i].name} complete`;
    this.els['win-sub'].textContent = `${fmtTime(this.elapsed)}${isBest ? ' · new best' : ` · best ${fmtTime(this.progress.best[i])}`}`;
    this.els.next.textContent = last ? 'Play again from level 1' : 'Next level';
    if (last && allDone) this.audio?.victory();
    else this.audio?.chime();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  pointerCell(e) {
    const r = this.els.grid.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.cols);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.rows);
    const c = this.cellAt(x, y);
    return c && c.open ? c : null;
  }

  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this.won) return;
    const c = this.pointerCell(e);
    if (!c) return;
    const i = this.idx(c.x, c.y);
    if (this.painted.has(i)) this.truncateTo(c);
    else if (!this.stepTo(c)) this.beginAt(c); // not next to the trail: start a fresh one
    this.drawing = true;
    try {
      this.els.grid.setPointerCapture(e.pointerId);
    } catch {
      // Capture only keeps the drag alive outside the grid; the paint still works without it.
    }
  }

  onPointerMove(e) {
    if (!this.drawing || this.won) return;
    const c = this.pointerCell(e);
    const h = this.head();
    if (c && h && c !== h) this.stepTo(c);
  }

  onPointerUp() {
    this.drawing = false;
  }

  update(dt, input) {
    if (!this.root) return;

    if (this.won) {
      if (input.wasJustPressed('Enter') || input.wasJustPressed('Space')) this.advance();
      else if (input.wasJustPressed('KeyR')) this.restartLevel();
      return;
    }

    if (input.wasJustPressed('KeyR')) {
      this.restartLevel();
      return;
    }
    if (input.wasJustPressed('KeyZ') || input.wasJustPressed('Backspace')) this.undo();

    for (const d of DIRS) {
      if (!d.codes.some(c => input.wasJustPressed(c))) continue;
      const h = this.head();
      if (h) {
        const n = this.cellAt(h.x + d.dx, h.y + d.dy);
        if (n) this.stepTo(n);
      } else {
        // No trail yet: arrows move the highlight, Space / Enter drops the first paint.
        const n = this.cellAt(this.cursor.x + d.dx, this.cursor.y + d.dy);
        if (n && n.open) {
          this.cursor = { x: n.x, y: n.y };
          this.refresh();
        }
      }
    }
    if (!this.path.length && (input.wasJustPressed('Space') || input.wasJustPressed('Enter'))) {
      this.beginAt(this.cellAt(this.cursor.x, this.cursor.y));
    }

    if (this.path.length) {
      this.elapsed += dt;
      const s = Math.floor(this.elapsed);
      if (s !== this._shownSecond) {
        this._shownSecond = s;
        this.els.time.textContent = fmtTime(this.elapsed);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  refresh() {
    const h = this.head();
    for (const c of this.cells) {
      if (!c.open) continue;
      const i = this.idx(c.x, c.y);
      const on = this.painted.has(i);
      c.el.classList.toggle('painted', on);
      c.el.classList.toggle('head', !this.won && c === h);
      c.el.classList.toggle('cursor', !this.path.length && c.x === this.cursor.x && c.y === this.cursor.y);
    }

    const pts = this.path.map(i => `${this.cells[i].x + 0.5},${this.cells[i].y + 0.5}`).join(' ');
    this.els.trail.innerHTML = this.path.length > 1 && !this.won
      ? `<polyline points="${pts}" />`
      : '';

    this.els.count.textContent = `${this.path.length} / ${this.openCount} boxes`;
    this.els.time.textContent = fmtTime(this.elapsed);
    this.els.undo.disabled = !this.path.length;
    this.els.restart.disabled = !this.path.length;

    let msg;
    if (this.won) msg = '';
    else if (!this.path.length) msg = 'Pick any box to start, then paint every box once. Never cross your own trail.';
    else if (!this.hasMoves()) msg = 'Dead end. Drag back along your trail, or hit Undo.';
    else msg = 'Keep going. Drag back over your trail to erase.';
    this.els.msg.textContent = msg;
    this.els.msg.classList.toggle('warn', !this.won && this.path.length > 0 && !this.hasMoves());
  }

  getHUDHtml() {
    return '';
  }

  getControlsGuide() {
    return [
      { label: 'Paint', keys: 'Click / touch a box, then drag through the others' },
      { label: 'Erase', keys: 'Drag back over your trail · Z / Backspace to undo' },
      { label: 'Keyboard', keys: 'Arrows / WASD to move · Space / Enter to start' },
      { label: 'Restart Level', keys: 'R' },
      { label: 'Next Level', keys: 'ENTER / SPACE after a win' },
      { label: 'Return to Lobby', keys: 'Lobby Button' }
    ];
  }
}
