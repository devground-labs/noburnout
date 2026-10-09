import { BaseGame } from '../../framework/BaseGame.js';

// Pattern Recall reuses the Maze Paint box design (the mp-* styles in style.css).

// Levels 1-3 ease you in with small mirror-symmetric patterns (easier to hold in your head).
// From level 4 the patterns are random, and each tier jumps to a bigger grid with more
// boxes lit. The time you get per box also shrinks level by level.
const TIERS = [
  { size: 3, count: 3, lit: [3, 4], symmetric: true },
  { size: 4, count: 4, lit: [6, 8], symmetric: false },
  { size: 5, count: 5, lit: [9, 12], symmetric: false },
  { size: 6, count: 8, lit: [13, 20], symmetric: false },
  { size: 7, count: 10, lit: [18, 28], symmetric: false },
  { size: 8, count: 10, lit: [24, 36], symmetric: false }
];

const LEVELS = [];
TIERS.forEach(t => {
  for (let k = 0; k < t.count; k++) {
    const lit = Math.round(t.lit[0] + ((t.lit[1] - t.lit[0]) * k) / Math.max(1, t.count - 1));
    const n = LEVELS.length;
    const perBox = Math.max(0.1, 0.45 - n * 0.009);
    LEVELS.push({ size: t.size, lit, symmetric: t.symmetric, showSec: 0.5 + lit * perBox });
  }
});

const READY_SEC = 0.8;
const STORE_KEY = 'pattern_recall_progress_v1';

const DIRS = [
  { codes: ['ArrowUp', 'KeyW'], dx: 0, dy: -1 },
  { codes: ['ArrowDown', 'KeyS'], dx: 0, dy: 1 },
  { codes: ['ArrowLeft', 'KeyA'], dx: -1, dy: 0 },
  { codes: ['ArrowRight', 'KeyD'], dx: 1, dy: 0 }
];

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { cleared: Array.isArray(p.cleared) ? p.cleared.filter(Number.isInteger) : [] };
  } catch {
    return { cleared: [] };
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Progress is a nicety; private mode / full storage must never break the game.
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `level.lit` boxes. Symmetric levels take left/right mirror pairs first.
function makePattern(level) {
  const n = level.size;
  const lit = new Set();
  if (level.symmetric) {
    const orbits = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x <= (n - 1) >> 1; x++) {
        orbits.push([...new Set([y * n + x, y * n + (n - 1 - x)])]);
      }
    }
    for (const o of shuffle(orbits)) {
      if (lit.size + o.length <= level.lit) o.forEach(i => lit.add(i));
      if (lit.size === level.lit) break;
    }
  }
  // Top up (non-symmetric levels, or an even grid that needs an odd count).
  const rest = shuffle([...Array(n * n).keys()].filter(i => !lit.has(i)));
  while (lit.size < level.lit) lit.add(rest.pop());
  return lit;
}

export class PatternRecallGame extends BaseGame {
  constructor() {
    super({
      id: 'pattern-recall',
      name: 'Pattern Recall',
      subtitle: 'Watch It, Then Draw It',
      description: 'A pattern lights up for a few seconds, then vanishes. Rebuild it from memory, box by box. Forty levels that get hard fast, with bigger grids, more boxes and less time. Clear a level to unlock the next.',
      icon: '🧠',
      badge: '2D Puzzle',
      genre: 'Memory',
      players: '1 Player',
      modes: ['Levels']
    });

    // DOM-based game: it owns an element instead of drawing on the shared WebGL scene.
    this.hasCustomRender = true;

    this.root = null;
    this.els = {};
    this.progress = loadProgress();
    this.levelIndex = 0;
    this.size = 0;
    this.cells = [];
    this.pattern = new Set();
    this.selected = new Set();
    this.phase = 'ready'; // ready -> show -> recall -> result
    this.t = 0;
    this.tries = 0;
    this.success = false;
    this.drawState = null; // while dragging: true = filling boxes, false = erasing
    this.cursor = { x: 0, y: 0 };
    this.cursorOn = false;
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
          <div class="mp-stats"><span data-mp="count"></span><span data-mp="tries"></span></div>
        </div>
        <div class="mp-board" data-mp="board">
          <div class="mp-grid" data-mp="grid"></div>
        </div>
        <div class="pr-bar" data-mp="bar" aria-hidden="true"><i data-mp="fill"></i></div>
        <p class="mp-msg" data-mp="msg" aria-live="polite"></p>
        <div class="mp-actions" data-mp="actions">
          <button type="button" class="mp-btn" data-mp="clear">Clear <kbd>C</kbd></button>
          <button type="button" class="mp-btn primary" data-mp="check">Check <kbd>Enter</kbd></button>
        </div>
        <div class="mp-win" data-mp="win" hidden>
          <h3 data-mp="win-title"></h3>
          <p data-mp="win-sub"></p>
          <button type="button" class="mp-btn primary" data-mp="again"></button>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-mp]').forEach(el => (this.els[el.dataset.mp] = el));
    engine.container.appendChild(this.root);
    engine.renderer.domElement.style.visibility = 'hidden';

    const g = this.els.grid;
    g.addEventListener('pointerdown', e => this.onPointerDown(e));
    g.addEventListener('pointermove', e => this.onPointerMove(e));
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => g.addEventListener(t, () => (this.drawState = null)));
    g.addEventListener('contextmenu', e => e.preventDefault());

    this.els.clear.addEventListener('click', () => this.clearSelection());
    this.els.check.addEventListener('click', () => this.check());
    this.els.again.addEventListener('click', () => this.afterResult());
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
    this.root?.remove();
    this.root = null;
    this.els = {};
    if (this.engine) this.engine.renderer.domElement.style.visibility = '';
  }

  render() {
    // DOM game: nothing to draw on the shared canvas.
  }

  // -------------------------------------------------------------------------
  // Rounds
  // -------------------------------------------------------------------------
  loadLevel(i) {
    const level = LEVELS[i];
    this.levelIndex = i;
    this.tries = 0;
    this.size = level.size;

    const { grid, board } = this.els;
    board.style.setProperty('--cols', level.size);
    board.style.setProperty('--rows', level.size);
    grid.textContent = '';
    this.cells = [];
    for (let k = 0; k < level.size * level.size; k++) {
      const d = document.createElement('div');
      d.className = 'mp-cell';
      grid.appendChild(d);
      this.cells.push(d);
    }

    this.els.level.textContent = `LEVEL ${i + 1} / ${LEVELS.length}`;
    this.els.name.textContent = `${level.size}×${level.size} grid`;
    this.beginRound();
  }

  beginRound() {
    this.pattern = makePattern(LEVELS[this.levelIndex]);
    this.selected = new Set();
    this.tries++;
    this.phase = 'ready';
    this.t = 0;
    this.success = false;
    this.drawState = null;
    this.cursor = { x: 0, y: 0 };
    this.cursorOn = false;
    this.els.win.hidden = true;
    this.els.board.classList.remove('won');
    this.cells.forEach(c => c.style.removeProperty('--d'));
    this.refresh();
  }

  setPhase(phase) {
    this.phase = phase;
    this.t = 0;
    this.refresh();
  }

  check() {
    if (this.phase !== 'recall') return;
    if (!this.selected.size) {
      this.els.msg.textContent = 'Tap the boxes you remember first.';
      return;
    }
    this.drawState = null;
    this.success = this.wrong().length === 0 && this.missed().length === 0;
    this.setPhase('result');

    const last = this.levelIndex === LEVELS.length - 1;
    const { win, again } = this.els;
    if (this.success) {
      if (!this.progress.cleared.includes(this.levelIndex)) {
        this.progress.cleared.push(this.levelIndex);
        saveProgress(this.progress);
      }
      [...this.pattern].forEach((ci, n) => this.cells[ci].style.setProperty('--d', `${n * 40}ms`));
      this.els.board.classList.add('won');
      this.els['win-title'].textContent = last ? `All ${LEVELS.length} cleared!` : 'Perfect memory!';
      this.els['win-sub'].textContent = `Level ${this.levelIndex + 1} cleared · ${this.tries === 1 ? 'first try' : `try ${this.tries}`}`;
      again.textContent = last ? 'Play again from level 1' : 'Next level';
      this.audio?.[last ? 'victory' : 'chime']();
    } else {
      this.els['win-title'].textContent = 'Not quite';
      this.els['win-sub'].textContent = `${this.wrong().length} wrong · ${this.missed().length} missed`;
      again.textContent = 'Try again';
      this.audio?.hit();
    }
    win.hidden = false;
  }

  afterResult() {
    if (this.phase !== 'result') return;
    if (!this.success) this.beginRound();
    else this.loadLevel(this.levelIndex + 1 < LEVELS.length ? this.levelIndex + 1 : 0);
  }

  wrong() {
    return [...this.selected].filter(i => !this.pattern.has(i));
  }

  missed() {
    return [...this.pattern].filter(i => !this.selected.has(i));
  }

  clearSelection() {
    if (this.phase !== 'recall' || !this.selected.size) return;
    this.selected.clear();
    this.audio?.click();
    this.refresh();
  }

  setCell(i, on) {
    if (this.selected.has(i) === on) return;
    if (on) this.selected.add(i);
    else this.selected.delete(i);
    this.audio?.click();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  cellIndexAt(e) {
    const r = this.els.grid.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.size);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.size);
    return x < 0 || y < 0 || x >= this.size || y >= this.size ? -1 : y * this.size + x;
  }

  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this.phase !== 'recall') return;
    const i = this.cellIndexAt(e);
    if (i < 0) return;
    this.cursorOn = false;
    this.drawState = !this.selected.has(i);
    this.setCell(i, this.drawState);
    try {
      this.els.grid.setPointerCapture(e.pointerId);
    } catch {
      // Capture only keeps a drag alive outside the grid; tapping works without it.
    }
  }

  onPointerMove(e) {
    if (this.drawState === null || this.phase !== 'recall') return;
    const i = this.cellIndexAt(e);
    if (i >= 0) this.setCell(i, this.drawState);
  }

  update(dt, input) {
    if (!this.root) return;
    this.t += dt;

    switch (this.phase) {
      case 'ready':
        if (this.t >= READY_SEC) this.setPhase('show');
        break;
      case 'show': {
        const dur = LEVELS[this.levelIndex].showSec;
        this.els.fill.style.width = `${Math.max(0, 1 - this.t / dur) * 100}%`;
        if (this.t >= dur) this.setPhase('recall');
        break;
      }
      case 'recall':
        this.keyboard(input);
        break;
      case 'result':
        if (input.wasJustPressed('Enter') || input.wasJustPressed('Space')) this.afterResult();
        break;
    }
  }

  keyboard(input) {
    if (input.wasJustPressed('Enter')) {
      this.check();
      return;
    }
    if (input.wasJustPressed('KeyC') || input.wasJustPressed('Backspace')) this.clearSelection();
    for (const d of DIRS) {
      if (!d.codes.some(c => input.wasJustPressed(c))) continue;
      const wasOn = this.cursorOn;
      this.cursorOn = true;
      if (wasOn) {
        this.cursor.x = Math.min(this.size - 1, Math.max(0, this.cursor.x + d.dx));
        this.cursor.y = Math.min(this.size - 1, Math.max(0, this.cursor.y + d.dy));
      }
      this.refresh();
    }
    if (input.wasJustPressed('Space')) {
      this.cursorOn = true;
      this.setCell(this.cursor.y * this.size + this.cursor.x, !this.selected.has(this.cursor.y * this.size + this.cursor.x));
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  refresh() {
    const ph = this.phase;
    this.cells.forEach((el, i) => {
      const inPattern = this.pattern.has(i);
      const picked = this.selected.has(i);
      el.classList.toggle('painted', ph === 'show' ? inPattern : ph === 'recall' ? picked : ph === 'result' && picked && inPattern);
      el.classList.toggle('wrong', ph === 'result' && picked && !inPattern);
      el.classList.toggle('missed', ph === 'result' && !picked && inPattern);
      el.classList.toggle('cursor', ph === 'recall' && this.cursorOn && i === this.cursor.y * this.size + this.cursor.x);
    });

    const lit = LEVELS[this.levelIndex].lit;
    this.els.count.textContent = ph === 'recall' || ph === 'result' ? `${this.selected.size} / ${lit} boxes` : `${lit} boxes`;
    this.els.tries.textContent = `Try ${this.tries}`;
    this.els.bar.classList.toggle('on', ph === 'show');
    if (ph !== 'show') this.els.fill.style.width = '100%';
    this.els.actions.hidden = ph === 'result';
    this.els.check.disabled = ph !== 'recall' || !this.selected.size;
    this.els.clear.disabled = ph !== 'recall' || !this.selected.size;
    this.els.grid.classList.toggle('locked', ph !== 'recall');

    const msgs = {
      ready: 'Get ready…',
      show: `Memorize the ${lit} lit boxes.`,
      recall: 'Now rebuild it. Tap or drag across the boxes you saw, then press Check.',
      result: this.success ? '' : 'Orange boxes are right, red are wrong, and outlines are the ones you missed.'
    };
    this.els.msg.textContent = msgs[ph];
  }

  getHUDHtml() {
    return '';
  }

  getControlsGuide() {
    return [
      { label: 'Pick boxes', keys: 'Tap / click, or drag across several' },
      { label: 'Keyboard', keys: 'Arrows / WASD to move · Space to toggle a box' },
      { label: 'Check', keys: 'Enter' },
      { label: 'Clear', keys: 'C / Backspace' },
      { label: 'Next / Try Again', keys: 'ENTER / SPACE after a result' },
      { label: 'Return to Lobby', keys: 'Lobby Button' }
    ];
  }
}
