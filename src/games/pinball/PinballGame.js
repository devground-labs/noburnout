import { BaseGame } from '../../framework/BaseGame.js';

// ---------------------------------------------------------------------------
// Table layout in logical units (portrait, y grows downward). The playfield is
// x 20..540; the plunger lane is x 540..580 on the right.
// ---------------------------------------------------------------------------
const W = 600;
const H = 1010;
const HUD_H = 44; // css px reserved above the table for the score strip
const BALL_R = 10;
const GRAVITY = 1150;
const STEP = 1 / 480; // fixed physics step; small enough that flipper tips can't tunnel
const MAX_STEPS = 48;
const MAX_SPEED = 2400;
const DRAIN_Y = 985; // fully hidden under the apron

const FLIP_LEN = 84;
const FLIP_R0 = 11;
const FLIP_R1 = 6;
const FLIP_REST = 0.52; // radians below horizontal
const FLIP_UP = -0.45;
const FLIP_UP_SPEED = 24;
const FLIP_DOWN_SPEED = 14;

const LANE_X = 560;
const LANE_FLOOR = 975;
const LANE_REST_Y = LANE_FLOOR - BALL_R;
const LAUNCH_MIN = 1300;
const LAUNCH_MAX = 2300;

const BALLS_PER_GAME = 3;
const BALL_SAVE_TIME = 6;
const MAX_MULT = 5;
const RAIL_R = 5;

const KEYS_LEFT = ['ArrowLeft', 'KeyA', 'KeyZ', 'ShiftLeft'];
const KEYS_RIGHT = ['ArrowRight', 'KeyD', 'KeyM', 'Slash', 'ShiftRight'];
const KEYS_LAUNCH = ['Space', 'ArrowDown', 'KeyS', 'Enter'];

const C = {
  bg: '#0b0d12',
  fieldTop: '#173a7a',
  fieldBottom: '#0a1a3d',
  red: '#e11d48',
  redDark: '#9f1239',
  gold: '#f5b301',
  cream: '#fef3c7',
  chrome: '#cbd5e1',
  chromeDark: '#475569',
  rubber: '#111827',
  text: '#fef3c7'
};

// Mirror a left-side x coordinate onto the right side of the playfield.
const mx = x => 560 - x;

// Slingshot triangle corners (left side; the right side is mirrored).
const SL = { ax: 65, ay: 625, bx: 65, by: 740, cx: 140, cy: 798 };

function buildWalls() {
  const walls = [];
  const seg = (ax, ay, bx, by) => walls.push({ ax, ay, bx, by });

  // Top arch: centre (300, 280), radius 280, from the left wall over to the right wall.
  const N = 28;
  let px = 20, py = 280;
  for (let i = 1; i <= N; i++) {
    const t = Math.PI + (Math.PI * i) / N;
    const x = 300 + 280 * Math.cos(t);
    const y = 280 + 280 * Math.sin(t);
    seg(px, py, x, y);
    px = x; py = y;
  }
  // Inlane slopes run tangent into the top of each flipper's pivot so the ball
  // rolls straight onto the flipper instead of wedging against the pivot.
  seg(20, 280, 20, 746); // left wall
  seg(20, 746, 181.7, 871.3); // left slope into the flipper
  seg(540, 250, 540, H); // plunger lane inner wall
  seg(580, 280, 580, H); // right outer wall
  seg(540, 746, mx(181.7), 871.3); // right slope
  seg(540, LANE_FLOOR, 580, LANE_FLOOR); // plunger top

  // Slingshot backs (their kicking faces are separate, see slings)
  for (const s of [1, -1]) {
    const X = x => (s === 1 ? x : mx(x));
    seg(X(SL.ax), SL.ay, X(SL.bx), SL.by);
    seg(X(SL.bx), SL.by, X(SL.cx), SL.cy);
  }
  return walls;
}

const WALLS = buildWalls();

// Chrome guide rails (capsules). Orbit rails form a channel up each side;
// the short rails at the top split the three rollover lanes.
const RAILS = [
  { ax: 75, ay: 335, bx: 75, by: 560 },
  { ax: mx(75), ay: 335, bx: mx(75), by: 560 },
  { ax: 190, ay: 62, bx: 190, by: 130 },
  { ax: 250, ay: 70, bx: 250, by: 130 },
  { ax: 310, ay: 70, bx: 310, by: 130 },
  { ax: 370, ay: 52, bx: 370, by: 130 }
];

// One-way cap over the plunger lane, enabled once the ball has left it.
const LANE_CAP = { ax: 577, ay: 240, bx: 536, by: 262 };

export class PinballGame extends BaseGame {
  constructor() {
    super({
      id: 'pinball',
      name: 'Pinball',
      subtitle: 'A Classic Two-Flipper Table',
      description: 'Shoot the orbits, spin the spinners, sink the saucer and clear the drop targets. Light everything to build your multiplier.',
      icon: '🎯',
      badge: '2D Table',
      genre: 'Pinball',
      players: '1 Player',
      modes: ['Classic', 'Zen']
    });

    // 2D game: owns a canvas and draws with Canvas2D instead of the shared WebGL scene.
    this.hasCustomRender = true;

    this.canvas = null;
    this.ctx = null;
    this.staticCanvas = null;
    this.apronCanvas = null;
    this.layout = { cssW: 0, cssH: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };

    this.highScore = parseInt(localStorage.getItem('pinball_highscore') || '0', 10);
    this.hud = null;
    this._pointers = new Map();
    this._acc = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async init(engine) {
    await super.init(engine);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pb-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.staticCanvas = document.createElement('canvas');
    this.apronCanvas = document.createElement('canvas');
    engine.container.appendChild(this.canvas);
    engine.renderer.domElement.style.visibility = 'hidden';

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => this.canvas.addEventListener(t, this._onPointerUp));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this.resize(true);
  }

  start(mode) {
    super.start(mode);
    this.resetGame();
  }

  destroy() {
    super.destroy();
    this.canvas?.remove();
    this.canvas = null;
    this.staticCanvas = null;
    this.apronCanvas = null;
    this._pointers.clear();
    if (this.engine) this.engine.renderer.domElement.style.visibility = '';
  }

  resetGame() {
    this.isZen = this.currentMode === 'Zen';
    this.score = 0;
    this.ballsLeft = BALLS_PER_GAME;
    this.mult = 1;
    this.isGameOver = false;
    this.isNewBest = false;

    this.flippers = [
      { px: 175, py: 880, side: 1, a: FLIP_REST, w: 0, pressed: false },
      { px: mx(175), py: 880, side: -1, a: FLIP_REST, w: 0, pressed: false }
    ];
    this.bumpers = [
      { x: 190, y: 300, r: 28, flash: 0, cool: 0 },
      { x: 370, y: 300, r: 28, flash: 0, cool: 0 },
      { x: 280, y: 400, r: 28, flash: 0, cool: 0 }
    ];
    this.slings = [
      { ax: SL.ax, ay: SL.ay, bx: SL.cx, by: SL.cy, flash: 0, cool: 0 },
      { ax: mx(SL.ax), ay: SL.ay, bx: mx(SL.cx), by: SL.cy, flash: 0, cool: 0 }
    ];
    this.targets = [230, 280, 330].map(x => ({ x, y: 520, down: false }));
    this.targetReset = 0;
    this.lanes = [
      { x: 220, y: 105, lit: false, cool: 0 },
      { x: 280, y: 105, lit: false, cool: 0 },
      { x: 340, y: 105, lit: false, cool: 0 }
    ];
    this.laneFlash = 0;
    // Spinners sit across each orbit channel; shooting up through one lights its arrow.
    this.spinners = [
      { x0: 22, x1: 70, y: 440, angle: 0, vel: 0, half: 0, lit: false },
      { x0: mx(70), x1: mx(22), y: 440, angle: 0, vel: 0, half: 0, lit: false }
    ];
    this.orbitFlash = 0;
    this.saucer = { x: 280, y: 215, hold: 0, cool: 0, flash: 0 };

    this.particles = [];
    this.floaters = [];
    this.trail = [];
    this.shake = 0;
    this.banner = { text: '', t: 0 };

    this.serveBall();
    this.setOverlay(false);
  }

  serveBall() {
    this.ball = { x: LANE_X, y: LANE_REST_Y, vx: 0, vy: 0 };
    this.ballReady = true;
    this.charge = 0;
    this.charging = false;
    this.needsRelease = this.launchHeld();
    this.laneExited = false;
    this.saveTimer = 0;
    this.saveUsed = false;
    this.stuckTime = 0;
    this.trail = [];
    if (this.saucer) this.saucer.hold = 0;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  _onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const { ox, scale } = this.layout;
    const mid = ox + (W / 2) * scale;
    this._pointers.set(e.pointerId, e.clientX < mid ? 'L' : 'R');
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is only a nicety (keeps the release on the canvas); never lose the press over it.
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
  }

  anyKey(codes) {
    return codes.some(c => this.input.isDown(c));
  }

  anyJust(codes) {
    return codes.some(c => this.input.wasJustPressed(c));
  }

  launchHeld() {
    return this.anyKey(KEYS_LAUNCH) || this._pointers.size > 0;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  update(dt) {
    if (this.isGameOver) {
      if (this.anyJust(['Enter', 'Space'])) this.resetGame();
      this.tickEffects(dt);
      return;
    }

    let pL = this.anyKey(KEYS_LEFT);
    let pR = this.anyKey(KEYS_RIGHT);
    for (const side of this._pointers.values()) {
      if (side === 'L') pL = true;
      else pR = true;
    }
    const [fl, fr] = this.flippers;
    if (pL && !fl.pressed) this.onFlip(-1);
    if (pR && !fr.pressed) this.onFlip(1);
    fl.pressed = pL;
    fr.pressed = pR;

    // Plunger: hold to pull back, release to fire.
    if (this.ballReady) {
      const held = this.launchHeld();
      if (!held) this.needsRelease = false;
      if (held && !this.needsRelease) {
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt * 1.1);
      } else if (this.charging) {
        this.launch();
      }
    }

    this._acc += dt;
    let steps = 0;
    while (this._acc >= STEP && steps < MAX_STEPS) {
      this.step(STEP);
      this._acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this._acc = 0;

    this.checkStuck(dt, pL || pR);
    if (this.saveTimer > 0) this.saveTimer -= dt;
    if (this.targetReset > 0) {
      this.targetReset -= dt;
      if (this.targetReset <= 0) this.targets.forEach(t => (t.down = false));
    }

    const b = this.ball;
    this.trail.push(b.x, b.y);
    if (this.trail.length > 12) this.trail.splice(0, 2);

    this.tickEffects(dt);
  }

  tickEffects(dt) {
    for (const o of [...this.bumpers, ...this.slings]) {
      o.flash = Math.max(0, o.flash - dt * 5);
      o.cool -= dt;
    }
    for (const l of this.lanes) l.cool -= dt;
    for (const s of this.spinners) {
      s.angle += s.vel * dt;
      s.vel *= Math.exp(-1.6 * dt);
      if (s.vel < 0.5) s.vel = 0;
      const half = Math.floor(s.angle / Math.PI);
      if (half > s.half) {
        s.half = half;
        if (!this.isGameOver) this.addScore(25, (s.x0 + s.x1) / 2, s.y - 14, true);
        this.tone(1900, 0.02, 'square', 0.04);
      }
    }
    this.saucer.cool -= dt;
    this.saucer.flash = Math.max(0, this.saucer.flash - dt);
    this.laneFlash = Math.max(0, this.laneFlash - dt);
    this.orbitFlash = Math.max(0, this.orbitFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.banner.t = Math.max(0, this.banner.t - dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.y -= 40 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  onFlip(dir) {
    this.tone(150, 0.06, 'triangle', 0.12, 60);
    // Flipping rotates the lit rollover lanes, like a real table's lane change.
    const lit = this.lanes.map(l => l.lit);
    const n = lit.length;
    this.lanes.forEach((l, i) => (l.lit = lit[(i - dir + n) % n]));
  }

  launch() {
    const b = this.ball;
    b.vy = -(LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * this.charge);
    b.vx = 0;
    this.ballReady = false;
    this.charging = false;
    this.charge = 0;
    this.tone(220, 0.18, 'sawtooth', 0.1, 660);
  }

  step(h) {
    for (const f of this.flippers) {
      const target = f.pressed ? FLIP_UP : FLIP_REST;
      const prev = f.a;
      if (f.a > target) f.a = Math.max(target, f.a - FLIP_UP_SPEED * h);
      else f.a = Math.min(target, f.a + FLIP_DOWN_SPEED * h);
      const wl = (f.a - prev) / h;
      f.w = f.side === 1 ? wl : -wl;
    }

    const b = this.ball;
    if (this.ballReady) {
      b.x = LANE_X;
      b.y = LANE_REST_Y - this.charge * 22;
      b.vx = b.vy = 0;
      return;
    }

    const sc = this.saucer;
    if (sc.hold > 0) {
      b.x = sc.x;
      b.y = sc.y;
      b.vx = b.vy = 0;
      sc.hold -= h;
      if (sc.hold <= 0) {
        b.vx = (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 160);
        b.vy = 480;
        sc.cool = 0.8;
        this.tone(120, 0.12, 'square', 0.12, 60);
      }
      return;
    }

    b.vy += GRAVITY * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAX_SPEED) {
      b.vx *= MAX_SPEED / sp;
      b.vy *= MAX_SPEED / sp;
    }
    const prevY = b.y;
    b.x += b.vx * h;
    b.y += b.vy * h;

    for (const w of WALLS) this.collideSeg(w.ax, w.ay, w.bx, w.by, 0, 0, 0.45);
    for (const r of RAILS) this.collideSeg(r.ax, r.ay, r.bx, r.by, RAIL_R, RAIL_R, 0.5);
    if (this.laneExited) this.collideSeg(LANE_CAP.ax, LANE_CAP.ay, LANE_CAP.bx, LANE_CAP.by, 0, 0, 0.45);

    for (const s of this.slings) {
      const imp = this.collideSeg(s.ax, s.ay, s.bx, s.by, 0, 0, 0.5);
      if (imp > 140 && s.cool <= 0) {
        const n = this._c;
        b.vx += n.nx * 520;
        b.vy += n.ny * 520;
        s.flash = 1;
        s.cool = 0.12;
        this.addScore(10, b.x, b.y);
        this.tone(330, 0.07, 'sawtooth', 0.1, 180);
        this.burst(b.x, b.y, C.cream, 6);
      }
    }

    for (const bp of this.bumpers) {
      if (this.collideCircle(bp.x, bp.y, bp.r, 0.6) && bp.cool <= 0) {
        const n = this._c;
        const vn = b.vx * n.nx + b.vy * n.ny;
        const kick = Math.max(0, 700 - vn);
        b.vx += n.nx * kick;
        b.vy += n.ny * kick;
        bp.flash = 1;
        bp.cool = 0.06;
        this.shake = Math.max(this.shake, 3);
        this.addScore(100, bp.x, bp.y - bp.r);
        this.tone(520 + Math.random() * 60, 0.08, 'square', 0.1, 820);
        this.burst(b.x, b.y, C.gold, 10);
      }
    }

    for (const t of this.targets) {
      if (t.down) continue;
      if (this.collideSeg(t.x - 18, t.y, t.x + 18, t.y, 4, 4, 0.4) > 0) {
        t.down = true;
        this.addScore(500, t.x, t.y);
        this.tone(900, 0.08, 'square', 0.1, 600);
        this.burst(t.x, t.y, C.gold, 8);
        if (this.targets.every(x => x.down)) {
          this.addScore(5000, 280, 490);
          this.bumpMult('TARGETS CLEARED');
          this.targetReset = 1.2;
        }
      }
    }

    for (const f of this.flippers) {
      const dir = f.side === 1 ? f.a : Math.PI - f.a;
      const tx = f.px + FLIP_LEN * Math.cos(dir);
      const ty = f.py + FLIP_LEN * Math.sin(dir);
      this.collideSeg(f.px, f.py, tx, ty, FLIP_R0, FLIP_R1, 0.25, f);
    }

    for (const s of this.spinners) {
      if (b.x > s.x0 && b.x < s.x1 && (prevY - s.y) * (b.y - s.y) < 0) {
        s.vel = Math.min(70, Math.abs(b.vy) * 0.03);
        if (b.vy < 0) this.shootOrbit(s);
      }
    }

    if (sc.cool <= 0 && Math.hypot(b.x - sc.x, b.y - sc.y) < 14 && Math.hypot(b.vx, b.vy) < 1100) {
      sc.hold = 0.9;
      sc.flash = 1.2;
      this.addScore(1500, sc.x, sc.y - 20);
      this.showBanner('SAUCER');
      this.tone(90, 0.15, 'triangle', 0.15, 50);
      this.audio.chime();
    }

    for (const l of this.lanes) {
      if (l.cool <= 0 && Math.hypot(b.x - l.x, b.y - l.y) < 18) {
        l.cool = 0.4;
        if (!l.lit) {
          l.lit = true;
          this.addScore(50, l.x, l.y);
          this.tone(1200, 0.06, 'sine', 0.1, 1500);
          if (this.lanes.every(x => x.lit)) {
            this.addScore(2000, 280, 80);
            this.bumpMult('LANES COMPLETE');
            this.laneFlash = 1;
            this.lanes.forEach(x => (x.lit = false));
          }
        }
      }
    }

    if (!this.laneExited && b.x < 532) {
      this.laneExited = true;
      this.saveTimer = BALL_SAVE_TIME;
    }
    // A weak launch rolls back down onto the plunger.
    if (!this.laneExited && b.x > 540 && b.y >= LANE_REST_Y - 0.5 && b.vy >= 0) {
      this.ballReady = true;
      this.charge = 0;
      this.charging = false;
      this.needsRelease = this.launchHeld();
    }

    if (b.y > DRAIN_Y) this.drain();
  }

  shootOrbit(s) {
    this.addScore(750, (s.x0 + s.x1) / 2, s.y);
    this.tone(700, 0.12, 'triangle', 0.1, 1400);
    if (!s.lit) {
      s.lit = true;
      if (this.spinners.every(x => x.lit)) {
        this.addScore(3000, 280, 470);
        this.bumpMult('ORBITS COMPLETE');
        this.orbitFlash = 1;
        this.spinners.forEach(x => (x.lit = false));
      }
    }
  }

  // Capsule (segment with radius tapering r0 -> r1) vs ball. Returns impact speed.
  collideSeg(ax, ay, bx, by, r0, r1, e, flipper = null) {
    const b = this.ball;
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey;
    let t = ((b.x - ax) * ex + (b.y - ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t, cy = ay + ey * t;
    const dx = b.x - cx, dy = b.y - cy;
    const rr = r0 + (r1 - r0) * t + BALL_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * rr;
    b.y = cy + ny * rr;
    let svx = 0, svy = 0;
    if (flipper) {
      svx = -flipper.w * (cy - flipper.py);
      svy = flipper.w * (cx - flipper.px);
    }
    this._c = { nx, ny };
    return this.resolve(nx, ny, svx, svy, e);
  }

  collideCircle(x, y, r, e) {
    const b = this.ball;
    const dx = b.x - x, dy = b.y - y;
    const rr = r + BALL_R;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    b.x = x + nx * rr;
    b.y = y + ny * rr;
    this._c = { nx, ny };
    return this.resolve(nx, ny, 0, 0, e) || 1;
  }

  resolve(nx, ny, svx, svy, e) {
    const b = this.ball;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    // Kill tiny bounces so the ball can rest and roll without jittering.
    const rest = vn > -40 ? 0 : e;
    b.vx = rvx - (1 + rest) * vn * nx + svx;
    b.vy = rvy - (1 + rest) * vn * ny + svy;
    return -vn;
  }

  checkStuck(dt, flipping) {
    const b = this.ball;
    if (this.ballReady || this.saucer.hold > 0 || flipping || Math.hypot(b.vx, b.vy) > 15) {
      this.stuckTime = 0;
      return;
    }
    this.stuckTime += dt;
    if (this.stuckTime > 3) {
      b.vy = -600;
      b.vx = (Math.random() - 0.5) * 400;
      this.stuckTime = 0;
      this.showBanner('NUDGE');
    }
  }

  drain() {
    if (this.saveTimer > 0 && !this.saveUsed) {
      this.serveBall();
      this.saveUsed = true;
      this.showBanner('BALL SAVED');
      this.tone(660, 0.2, 'triangle', 0.12, 990);
      return;
    }
    this.shake = 8;
    this.tone(320, 0.5, 'sawtooth', 0.12, 50);
    this.mult = 1;
    if (!this.isZen) this.ballsLeft--;
    if (this.ballsLeft <= 0) {
      this.gameOver();
      return;
    }
    this.showBanner(this.isZen ? 'NEW BALL' : `BALL ${BALLS_PER_GAME - this.ballsLeft + 1}`);
    this.serveBall();
  }

  gameOver() {
    this.isGameOver = true;
    this.ballReady = true; // park the ball out of sight
    this.ball.y = DRAIN_Y + 100;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewBest = true;
      localStorage.setItem('pinball_highscore', String(this.highScore));
      this.audio.victory();
    }
    this.setOverlay(true);
  }

  addScore(points, x, y, quiet = false) {
    const v = points * this.mult;
    this.score += v;
    if (!quiet) this.floaters.push({ x, y, text: `+${v.toLocaleString()}`, life: 0.8 });
  }

  bumpMult(reason) {
    if (this.mult < MAX_MULT) this.mult++;
    this.showBanner(`${reason} · ${this.mult}X`);
    this.audio.chime();
  }

  showBanner(text) {
    this.banner = { text, t: 1.6 };
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n && this.particles.length < 140; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 260;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.25, color });
    }
  }

  tone(freq, dur, type, vol, slideTo) {
    const a = this.audio;
    if (!a || !a.enabled || !a.ctx) return;
    const now = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const gain = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(a.masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------
  resize(force = false) {
    const el = this.engine.container;
    const cssW = el.clientWidth || window.innerWidth;
    const cssH = el.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The navbar is shown after init and shrinks on small screens, so track it too.
    const nav = document.getElementById('arcade-navbar');
    const navH = nav && nav.style.display !== 'none' ? nav.offsetHeight : 0;
    const L = this.layout;
    if (!force && cssW === L.cssW && cssH === L.cssH && dpr === L.dpr && navH === L.navH) return;

    // FRAME leaves room for the cabinet rails drawn outside the playfield.
    const FRAME = 18;
    const top = navH + 6;
    const pad = 8;
    const availW = cssW - pad * 2;
    const availH = cssH - top - HUD_H - pad;
    const scale = Math.max(0.1, Math.min(availW / (W + FRAME * 2), availH / (H + FRAME)));
    this.layout = {
      cssW, cssH, dpr, scale, navH,
      ox: (cssW - W * scale) / 2,
      oy: top + HUD_H + FRAME * scale + Math.max(0, (availH - (H + FRAME) * scale) / 2)
    };

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.drawStatic();
    this.drawApron();
  }

  tableTransform(g, extraX = 0, extraY = 0) {
    const { dpr, scale, ox, oy } = this.layout;
    const k = dpr * scale;
    g.setTransform(k, 0, 0, k, (ox + extraX) * dpr, (oy + extraY) * dpr);
  }

  // -------------------------------------------------------------------------
  // Static artwork (drawn once per resize)
  // -------------------------------------------------------------------------
  tablePath(g) {
    g.beginPath();
    g.moveTo(20, H);
    g.lineTo(20, 280);
    g.arc(300, 280, 280, Math.PI, Math.PI * 2);
    g.lineTo(580, H);
    g.closePath();
  }

  chromeStroke(g, width) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    g.lineWidth = width + 5;
    g.stroke();
    g.strokeStyle = C.chromeDark;
    g.lineWidth = width + 2;
    g.stroke();
    g.strokeStyle = C.chrome;
    g.lineWidth = width;
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = Math.max(1, width * 0.3);
    g.stroke();
  }

  drawStatic() {
    const s = this.staticCanvas;
    s.width = this.canvas.width;
    s.height = this.canvas.height;
    const g = s.getContext('2d');

    const bg = g.createLinearGradient(0, 0, 0, s.height);
    bg.addColorStop(0, '#11141b');
    bg.addColorStop(1, '#07080b');
    g.fillStyle = bg;
    g.fillRect(0, 0, s.width, s.height);
    this.tableTransform(g);

    // Cabinet: dark side rails around the glass.
    this.tablePath(g);
    g.lineJoin = 'round';
    g.strokeStyle = '#1b1f29';
    g.lineWidth = 34;
    g.stroke();
    g.strokeStyle = '#2b3140';
    g.lineWidth = 22;
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    g.lineWidth = 2;
    g.stroke();

    // Playfield wood, painted.
    this.tablePath(g);
    const field = g.createLinearGradient(0, 0, 0, H);
    field.addColorStop(0, C.fieldTop);
    field.addColorStop(0.55, '#102a5c');
    field.addColorStop(1, C.fieldBottom);
    g.fillStyle = field;
    g.fill();

    g.save();
    this.tablePath(g);
    g.clip();
    this.paintArtwork(g);
    g.restore();

    // Walls and rails
    g.beginPath();
    WALLS.forEach((w, i) => {
      if (i >= WALLS.length - 4) return; // sling backs are drawn as plastics
      g.moveTo(w.ax, w.ay);
      g.lineTo(w.bx, w.by);
    });
    this.chromeStroke(g, 4);

    g.beginPath();
    for (const r of RAILS) {
      g.moveTo(r.ax, r.ay);
      g.lineTo(r.bx, r.by);
    }
    this.chromeStroke(g, RAIL_R * 2 - 3);

    // Slingshot plastics
    for (const side of [1, -1]) {
      const X = x => (side === 1 ? x : mx(x));
      g.beginPath();
      g.moveTo(X(SL.ax), SL.ay);
      g.lineTo(X(SL.bx), SL.by);
      g.lineTo(X(SL.cx), SL.cy);
      g.closePath();
      const pg = g.createLinearGradient(X(SL.ax), SL.ay, X(SL.cx), SL.cy);
      pg.addColorStop(0, C.red);
      pg.addColorStop(1, C.redDark);
      g.fillStyle = pg;
      g.fill();
      g.strokeStyle = C.cream;
      g.lineWidth = 2;
      g.stroke();
      // Inner stripe
      g.beginPath();
      g.moveTo(X(SL.ax + 10), SL.ay + 28);
      g.lineTo(X(SL.bx + 10), SL.by - 8);
      g.lineTo(X(SL.cx - 26), SL.cy - 20);
      g.closePath();
      g.strokeStyle = 'rgba(254, 243, 199, 0.55)';
      g.lineWidth = 2;
      g.stroke();
      // Posts at the corners
      for (const [x, y] of [[SL.ax, SL.ay], [SL.bx, SL.by], [SL.cx, SL.cy]]) {
        this.drawPost(g, X(x), y, 5);
      }
    }

    // Saucer cup
    const sc = { x: 280, y: 215 };
    const cup = g.createRadialGradient(sc.x - 3, sc.y - 3, 2, sc.x, sc.y, 17);
    cup.addColorStop(0, '#000');
    cup.addColorStop(0.7, '#111827');
    cup.addColorStop(1, '#6b7280');
    g.fillStyle = cup;
    g.beginPath(); g.arc(sc.x, sc.y, 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.chrome;
    g.lineWidth = 2;
    g.stroke();

    // Spinner brackets
    for (const x of [22, 70, mx(70), mx(22)]) this.drawPost(g, x, 440, 3);
  }

  paintArtwork(g) {
    // Sunburst behind the bumper cluster
    const cx = 280, cy = 340;
    for (let i = 0; i < 32; i++) {
      if (i % 2) continue;
      const a0 = (i / 32) * Math.PI * 2;
      const a1 = ((i + 1) / 32) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, 760, a0, a1);
      g.closePath();
      g.fillStyle = 'rgba(255, 255, 255, 0.035)';
      g.fill();
    }
    const glow = g.createRadialGradient(cx, cy, 10, cx, cy, 230);
    glow.addColorStop(0, 'rgba(245, 179, 1, 0.22)');
    glow.addColorStop(1, 'rgba(245, 179, 1, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // Painted rings around the bumpers
    g.strokeStyle = 'rgba(245, 179, 1, 0.35)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, 160, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(254, 243, 199, 0.18)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, 172, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(254, 243, 199, 0.22)';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(a) * 186, cy + Math.sin(a) * 186, 2, 0, Math.PI * 2); g.fill();
    }

    // Orbit channels painted darker with lane stripes
    for (const [x0, x1] of [[20, 75], [485, 540]]) {
      const ch = g.createLinearGradient(0, 260, 0, 340);
      ch.addColorStop(0, 'rgba(0, 0, 0, 0)');
      ch.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      g.fillStyle = ch;
      g.fillRect(x0, 260, x1 - x0, 310);
      g.strokeStyle = 'rgba(254, 243, 199, 0.12)';
      g.lineWidth = 1;
      g.setLineDash([6, 8]);
      g.beginPath(); g.moveTo((x0 + x1) / 2, 340); g.lineTo((x0 + x1) / 2, 560); g.stroke();
      g.setLineDash([]);
    }

    // Top lanes band
    const band = g.createLinearGradient(0, 40, 0, 140);
    band.addColorStop(0, 'rgba(0, 0, 0, 0)');
    band.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    g.fillStyle = band;
    g.fillRect(190, 40, 180, 100);

    // Red lower field fading up behind the flippers
    const low = g.createLinearGradient(0, 600, 0, H);
    low.addColorStop(0, 'rgba(225, 29, 72, 0)');
    low.addColorStop(1, 'rgba(225, 29, 72, 0.32)');
    g.fillStyle = low;
    g.fillRect(0, 600, W, H - 600);

    // Chevron stripes pointing up the centre lane
    g.fillStyle = 'rgba(254, 243, 199, 0.07)';
    for (let i = 0; i < 4; i++) {
      const y = 760 - i * 26;
      g.beginPath();
      g.moveTo(240, y + 14); g.lineTo(280, y - 6); g.lineTo(320, y + 14);
      g.lineTo(320, y + 24); g.lineTo(280, y + 4); g.lineTo(240, y + 24);
      g.closePath();
      g.fill();
    }

    // Plunger lane
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    g.fillRect(540, 240, 40, H - 240);

    // Inlane arrows (painted, unlit)
    g.fillStyle = 'rgba(254, 243, 199, 0.25)';
    for (const x of [42, mx(42)]) {
      for (let i = 0; i < 3; i++) {
        const y = 650 + i * 18;
        g.beginPath();
        g.moveTo(x - 7, y);
        g.lineTo(x + 7, y);
        g.lineTo(x, y + 8);
        g.closePath();
        g.fill();
      }
    }
  }

  drawPost(g, x, y, r) {
    g.fillStyle = C.rubber;
    g.beginPath(); g.arc(x, y, r + 2, 0, Math.PI * 2); g.fill();
    const pg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(1, '#94a3b8');
    g.fillStyle = pg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // Lower plastics and apron. Drawn over the ball so a draining ball slides under it.
  drawApron() {
    const s = this.apronCanvas;
    s.width = this.canvas.width;
    s.height = this.canvas.height;
    const g = s.getContext('2d');
    this.tableTransform(g);

    for (const side of [1, -1]) {
      const X = x => (side === 1 ? x : mx(x));
      g.beginPath();
      g.moveTo(X(20), 746);
      g.lineTo(X(181.7), 871.3);
      g.lineTo(X(150), 952);
      g.lineTo(X(20), 952);
      g.closePath();
      const pg = g.createLinearGradient(0, 746, 0, 952);
      pg.addColorStop(0, '#1e293b');
      pg.addColorStop(1, '#0f172a');
      g.fillStyle = pg;
      g.fill();
      g.strokeStyle = 'rgba(245, 179, 1, 0.5)';
      g.lineWidth = 2;
      g.stroke();
    }

    g.beginPath();
    g.moveTo(20, 945);
    g.quadraticCurveTo(280, 975, 540, 945);
    g.lineTo(540, H);
    g.lineTo(20, H);
    g.closePath();
    const ap = g.createLinearGradient(0, 945, 0, H);
    ap.addColorStop(0, C.cream);
    ap.addColorStop(1, '#d6c79a');
    g.fillStyle = ap;
    g.fill();
    g.strokeStyle = C.chromeDark;
    g.lineWidth = 2;
    g.stroke();

    // Red band and rivets
    g.fillStyle = C.red;
    g.beginPath();
    g.moveTo(20, 978);
    g.quadraticCurveTo(280, 1002, 540, 978);
    g.lineTo(540, 990);
    g.quadraticCurveTo(280, 1014, 20, 990);
    g.closePath();
    g.fill();
    g.fillStyle = '#64748b';
    for (const x of [40, 140, 420, 520]) {
      g.beginPath(); g.arc(x, 962 + Math.abs(x - 280) * -0.04, 3, 0, Math.PI * 2); g.fill();
    }
  }

  // -------------------------------------------------------------------------
  // Per-frame rendering
  // -------------------------------------------------------------------------
  render() {
    if (!this.canvas || !this.ball) return;
    this.resize();
    const g = this.ctx;
    const { dpr } = this.layout;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.staticCanvas, 0, 0);

    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    this.tableTransform(g, sx, sy);

    this.drawLamps(g);
    this.drawLaneCap(g);
    this.drawTargets(g);
    this.drawSlings(g);
    this.drawSpinners(g);
    this.drawBumpers(g);
    this.drawBall(g);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.apronCanvas, sx * dpr, sy * dpr);
    this.tableTransform(g, sx, sy);

    this.drawPlunger(g);
    this.drawFlippers(g);
    this.drawEffects(g);
    this.drawHints(g);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawHudStrip(g);
  }

  lamp(g, x, y, r, color, on, shape = 'circle') {
    if (on) {
      const gl = g.createRadialGradient(x, y, r * 0.3, x, y, r * 2.6);
      gl.addColorStop(0, color + 'aa');
      gl.addColorStop(1, color + '00');
      g.fillStyle = gl;
      g.beginPath(); g.arc(x, y, r * 2.6, 0, Math.PI * 2); g.fill();
    }
    g.beginPath();
    if (shape === 'arrow') {
      g.moveTo(x, y - r * 1.3);
      g.lineTo(x + r, y + r * 0.7);
      g.lineTo(x, y + r * 0.2);
      g.lineTo(x - r, y + r * 0.7);
      g.closePath();
    } else if (shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
    } else {
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fillStyle = on ? '#fffbeb' : color + '40';
    g.fill();
    g.strokeStyle = on ? color : color + '99';
    g.lineWidth = 1.5;
    g.stroke();
    if (on) {
      g.fillStyle = color + '99';
      g.fill();
    }
  }

  drawLamps(g) {
    const blink = Math.floor(performance.now() / 160) % 2 === 0;

    const laneFlash = this.laneFlash > 0 && blink;
    for (const l of this.lanes) this.lamp(g, l.x, l.y, 11, C.gold, l.lit || laneFlash, 'star');

    const orbitFlash = this.orbitFlash > 0 && blink;
    for (const s of this.spinners) {
      const x = (s.x0 + s.x1) / 2;
      this.lamp(g, x, 500, 10, '#38bdf8', s.lit || orbitFlash, 'arrow');
      this.lamp(g, x, 530, 7, '#38bdf8', s.lit || orbitFlash, 'arrow');
    }

    this.targets.forEach(t => this.lamp(g, t.x, 548, 6, C.gold, t.down));

    // Multiplier ladder
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 10px "Plus Jakarta Sans", sans-serif';
    [2, 3, 4, 5].forEach((m, i) => {
      const x = 226 + i * 36;
      this.lamp(g, x, 640, 13, C.red, this.mult >= m);
      g.fillStyle = this.mult >= m ? '#4c0519' : 'rgba(254, 243, 199, 0.55)';
      g.fillText(`${m}X`, x, 641);
    });

    const sc = this.saucer;
    const scOn = sc.hold > 0 || (sc.flash > 0 && blink);
    this.lamp(g, sc.x, sc.y - 34, 7, C.gold, scOn);
    this.lamp(g, sc.x - 30, sc.y - 14, 5, C.gold, scOn);
    this.lamp(g, sc.x + 30, sc.y - 14, 5, C.gold, scOn);

    // Shoot again
    const saveOn = this.saveTimer > 0 && !this.saveUsed && (this.saveTimer > 2 || blink);
    this.lamp(g, 280, 862, 12, C.red, saveOn);
    g.font = '800 6px "Plus Jakarta Sans", sans-serif';
    g.fillStyle = saveOn ? '#4c0519' : 'rgba(254, 243, 199, 0.5)';
    g.fillText('SHOOT', 280, 859);
    g.fillText('AGAIN', 280, 866);
    g.textBaseline = 'alphabetic';
  }

  drawLaneCap(g) {
    g.beginPath();
    g.moveTo(LANE_CAP.ax, LANE_CAP.ay);
    g.lineTo(LANE_CAP.bx, LANE_CAP.by);
    if (this.laneExited) {
      this.chromeStroke(g, 3);
    } else {
      g.strokeStyle = 'rgba(203, 213, 225, 0.25)';
      g.lineWidth = 3;
      g.stroke();
    }
  }

  drawTargets(g) {
    for (const t of this.targets) {
      if (t.down) {
        g.fillStyle = 'rgba(0, 0, 0, 0.5)';
        g.fillRect(t.x - 19, t.y - 3, 38, 6);
        continue;
      }
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fillRect(t.x - 17, t.y - 2, 38, 10);
      const tg = g.createLinearGradient(0, t.y - 6, 0, t.y + 6);
      tg.addColorStop(0, '#fff7d6');
      tg.addColorStop(1, '#e8d49a');
      g.fillStyle = tg;
      g.fillRect(t.x - 19, t.y - 6, 38, 12);
      g.fillStyle = C.red;
      g.fillRect(t.x - 19, t.y - 1.5, 38, 3);
    }
  }

  drawSlings(g) {
    g.lineCap = 'round';
    for (const s of this.slings) {
      // Rubber band, bowing in for a moment when it fires
      const midX = (s.ax + s.bx) / 2, midY = (s.ay + s.by) / 2;
      const nx = s.by - s.ay, ny = -(s.bx - s.ax);
      const len = Math.hypot(nx, ny);
      const dir = s.ax < 280 ? 1 : -1;
      const bow = s.flash * 6 * dir;
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.quadraticCurveTo(midX + (nx / len) * bow, midY + (ny / len) * bow, s.bx, s.by);
      g.strokeStyle = C.rubber;
      g.lineWidth = 6;
      g.stroke();
      g.strokeStyle = s.flash > 0 ? C.gold : 'rgba(255, 255, 255, 0.25)';
      g.lineWidth = 1.5;
      g.stroke();
    }
  }

  drawSpinners(g) {
    for (const s of this.spinners) {
      const h = 7 * Math.abs(Math.cos(s.angle));
      const x0 = s.x0 + 2, x1 = s.x1 - 2;
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.fillRect(x0 + 2, s.y - h + 3, x1 - x0, h * 2);
      const sg = g.createLinearGradient(0, s.y - h, 0, s.y + h);
      sg.addColorStop(0, '#f8fafc');
      sg.addColorStop(1, '#94a3b8');
      g.fillStyle = sg;
      g.fillRect(x0, s.y - h, x1 - x0, h * 2 || 1);
      g.strokeStyle = C.chromeDark;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(s.x0, s.y); g.lineTo(s.x1, s.y); g.stroke();
    }
  }

  drawBumpers(g) {
    for (const b of this.bumpers) {
      const f = b.flash;
      g.fillStyle = 'rgba(0, 0, 0, 0.4)';
      g.beginPath(); g.arc(b.x + 4, b.y + 5, b.r + 5, 0, Math.PI * 2); g.fill();
      if (f > 0) {
        const gl = g.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + 26);
        gl.addColorStop(0, `rgba(255, 214, 102, ${0.6 * f})`);
        gl.addColorStop(1, 'rgba(255, 214, 102, 0)');
        g.fillStyle = gl;
        g.beginPath(); g.arc(b.x, b.y, b.r + 26, 0, Math.PI * 2); g.fill();
      }
      // Metal skirt
      g.fillStyle = '#cbd5e1';
      g.beginPath(); g.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); g.fill();
      // Body
      const body = g.createRadialGradient(b.x - 8, b.y - 8, 2, b.x, b.y, b.r);
      body.addColorStop(0, '#fb7185');
      body.addColorStop(1, C.redDark);
      g.fillStyle = body;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill();
      // Cap
      const capR = b.r * 0.68;
      const cap = g.createRadialGradient(b.x - 5, b.y - 6, 1, b.x, b.y, capR);
      cap.addColorStop(0, '#ffffff');
      cap.addColorStop(1, f > 0.2 ? '#fde68a' : '#e7dcb8');
      g.fillStyle = cap;
      g.beginPath(); g.arc(b.x, b.y, capR, 0, Math.PI * 2); g.fill();
      // Star
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 4.2 : 9.5;
        g.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = f > 0.2 ? C.gold : C.red;
      g.fill();
    }
  }

  drawPlunger(g) {
    const topY = LANE_FLOOR + (this.ballReady ? this.charge * 22 : 0);
    // Spring
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 2;
    g.beginPath();
    const coils = 7;
    const span = H - topY - 8;
    for (let i = 0; i <= coils * 2; i++) {
      const y = topY + 8 + (span * i) / (coils * 2);
      const x = i % 2 ? 551 : 569;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    // Tip
    const tg = g.createLinearGradient(546, 0, 574, 0);
    tg.addColorStop(0, '#64748b');
    tg.addColorStop(0.5, '#f1f5f9');
    tg.addColorStop(1, '#64748b');
    g.fillStyle = tg;
    g.fillRect(546, topY, 28, 8);
    if (this.ballReady && this.charge > 0) {
      g.fillStyle = 'rgba(0, 0, 0, 0.5)';
      g.fillRect(584, 760, 10, 200);
      g.fillStyle = this.charge > 0.95 ? C.gold : C.red;
      g.fillRect(585, 960 - 198 * this.charge, 8, 198 * this.charge);
    }
  }

  drawFlippers(g) {
    for (const f of this.flippers) {
      const dir = f.side === 1 ? f.a : Math.PI - f.a;
      const tx = f.px + FLIP_LEN * Math.cos(dir);
      const ty = f.py + FLIP_LEN * Math.sin(dir);
      const outline = () => {
        g.beginPath();
        g.arc(f.px, f.py, FLIP_R0 + 1, dir + Math.PI / 2, dir + Math.PI * 1.5);
        g.arc(tx, ty, FLIP_R1 + 1, dir - Math.PI / 2, dir + Math.PI / 2);
        g.closePath();
      };
      g.save();
      g.translate(3, 4);
      outline();
      g.fillStyle = 'rgba(0, 0, 0, 0.4)';
      g.fill();
      g.restore();
      outline();
      const fg = g.createLinearGradient(f.px, f.py - 12, f.px, f.py + 12);
      fg.addColorStop(0, '#ffffff');
      fg.addColorStop(1, '#d4d4d8');
      g.fillStyle = fg;
      g.fill();
      g.strokeStyle = C.red;
      g.lineWidth = 3.5;
      g.stroke();
      const pc = g.createRadialGradient(f.px - 1, f.py - 1, 0.5, f.px, f.py, 5);
      pc.addColorStop(0, '#fff');
      pc.addColorStop(1, '#64748b');
      g.fillStyle = pc;
      g.beginPath(); g.arc(f.px, f.py, 4.5, 0, Math.PI * 2); g.fill();
    }
  }

  drawBall(g) {
    const b = this.ball;
    if (b.y > DRAIN_Y + 50) return;
    const tr = this.trail;
    for (let i = 0; i < tr.length; i += 2) {
      g.fillStyle = `rgba(226, 232, 240, ${(i / tr.length) * 0.14})`;
      g.beginPath(); g.arc(tr[i], tr[i + 1], BALL_R * 0.85, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath(); g.arc(b.x + 3, b.y + 4, BALL_R, 0, Math.PI * 2); g.fill();
    const grad = g.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, BALL_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, '#d1d5db');
    grad.addColorStop(1, '#374151');
    g.fillStyle = grad;
    g.beginPath(); g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); g.fill();
  }

  drawEffects(g) {
    for (const p of this.particles) {
      g.globalAlpha = Math.min(1, p.life * 3);
      g.fillStyle = p.color;
      g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.font = '800 16px "Plus Jakarta Sans", sans-serif';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    for (const f of this.floaters) {
      g.globalAlpha = Math.min(1, f.life * 2.5);
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = C.cream;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    if (this.banner.t > 0) {
      g.globalAlpha = Math.min(1, this.banner.t * 2);
      g.font = '800 24px "Plus Jakarta Sans", sans-serif';
      const w = g.measureText(this.banner.text).width + 40;
      g.fillStyle = 'rgba(15, 23, 42, 0.88)';
      g.fillRect(280 - w / 2, 572, w, 42);
      g.strokeStyle = C.gold;
      g.lineWidth = 2;
      g.strokeRect(280 - w / 2, 572, w, 42);
      g.fillStyle = C.gold;
      g.fillText(this.banner.text, 280, 602);
      g.globalAlpha = 1;
    }
  }

  drawHints(g) {
    if (!this.ballReady || this.isGameOver || this.charging) return;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 260);
    g.globalAlpha = pulse;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(15, 23, 42, 0.75)';
    g.fillRect(110, 734, 340, 60);
    g.fillStyle = C.cream;
    g.font = '800 19px "Plus Jakarta Sans", sans-serif';
    g.fillText(this.isTouch ? 'HOLD & RELEASE TO LAUNCH' : 'HOLD SPACE TO LAUNCH', 280, 760);
    g.font = '600 13px "Plus Jakarta Sans", sans-serif';
    g.fillStyle = 'rgba(254, 243, 199, 0.8)';
    g.fillText(this.isTouch ? 'Tap left / right side to flip' : '← / A  left flipper    → / D  right flipper', 280, 782);
    g.globalAlpha = 1;
  }

  drawHudStrip(g) {
    const { ox, oy, scale } = this.layout;
    const w = W * scale;
    const y = oy - HUD_H - 18 * scale;
    const mid = y + HUD_H / 2 + 1;
    const small = w < 360;

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#94a3b8';
    g.font = `700 ${small ? 9 : 10}px "Plus Jakarta Sans", sans-serif`;
    g.fillText('SCORE', ox + 4, mid - 9);
    g.fillStyle = C.cream;
    g.font = `800 ${small ? 18 : 21}px "Plus Jakarta Sans", sans-serif`;
    g.fillText(this.score.toLocaleString(), ox + 4, mid + 8);

    g.textAlign = 'center';
    g.fillStyle = this.mult > 1 ? C.gold : 'rgba(254, 243, 199, 0.4)';
    g.font = `800 ${small ? 15 : 18}px "Plus Jakarta Sans", sans-serif`;
    g.fillText(`${this.mult}X`, ox + w * 0.56, mid);

    g.textAlign = 'right';
    g.fillStyle = '#94a3b8';
    g.font = `700 ${small ? 9 : 10}px "Plus Jakarta Sans", sans-serif`;
    g.fillText(`BEST ${Math.max(this.highScore, this.score).toLocaleString()}`, ox + w - 4, mid - 9);
    if (this.isZen) {
      g.fillStyle = C.cream;
      g.font = '700 13px "Plus Jakarta Sans", sans-serif';
      g.fillText('ZEN ∞', ox + w - 4, mid + 8);
    } else {
      for (let i = 0; i < BALLS_PER_GAME; i++) {
        g.beginPath();
        g.arc(ox + w - 10 - i * 16, mid + 8, 5, 0, Math.PI * 2);
        g.fillStyle = i < this.ballsLeft ? '#e2e8f0' : 'rgba(226, 232, 240, 0.15)';
        g.fill();
      }
    }
    g.textBaseline = 'alphabetic';
  }

  // -------------------------------------------------------------------------
  // DOM HUD (game-over card only; the live score is drawn on the canvas)
  // -------------------------------------------------------------------------
  getHUDHtml() {
    this.hud = null;
    return `
      <div class="pb-over" data-pb="over">
        <div class="pb-over-card">
          <h1>GAME OVER</h1>
          <div class="pb-over-score" data-pb="final">0</div>
          <p class="pb-over-best" data-pb="best"></p>
          <button class="pb-restart" data-pb="restart">PLAY AGAIN <kbd>ENTER</kbd></button>
        </div>
      </div>`;
  }

  bindHud() {
    const root = this.engine.ui.hudContainer;
    if (!root) return false;
    const els = {};
    root.querySelectorAll('[data-pb]').forEach(el => (els[el.dataset.pb] = el));
    if (!els.over) return false;
    els.restart.addEventListener('click', () => this.isGameOver && this.resetGame());
    this.hud = els;
    return true;
  }

  setOverlay(show) {
    if (!this.hud && !this.bindHud()) return;
    const h = this.hud;
    h.over.classList.toggle('show', show);
    if (show) {
      h.final.textContent = this.score.toLocaleString();
      h.best.textContent = this.isNewBest ? '★ NEW PERSONAL BEST ★' : `BEST ${this.highScore.toLocaleString()}`;
      h.best.classList.toggle('record', this.isNewBest);
    }
  }

  updateHUD() {
    if (!this.hud) this.bindHud();
  }

  getControlsGuide() {
    return [
      { label: 'Left Flipper', keys: '← / A / Z / L-Shift · tap left side' },
      { label: 'Right Flipper', keys: '→ / D / M / R-Shift · tap right side' },
      { label: 'Launch Ball', keys: 'Hold & release SPACE / ↓ · hold & release touch' },
      { label: 'Restart (game over)', keys: 'ENTER / SPACE' },
      { label: 'Return to Lobby', keys: 'Lobby Button' }
    ];
  }
}
