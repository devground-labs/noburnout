import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BaseGame } from '../../framework/BaseGame.js';

// =========================================================================
// Config
// =========================================================================
const LANES = [-1.5, 1.5];
const LANE_COLORS = [0x0ea5e9, 0xf43f5e];
const BALL_R = 0.7;
const GRAVITY = -32;
const JUMP_V = 10; // single jump apex ~1.56 (clears low blocks)
const DOUBLE_JUMP_V = 9.5; // double jump needed for tall walls
const SPAWN_Z = -70;
const DESPAWN_Z = 15;
const MAX_LIVES = 3;
const INVULN_TIME = 1.6;
const LEVELS = [
  { name: 'Easy', color: '#22c55e', speed: 18, delay: 1.35, tall: 0, gem: 0.35, at: 0 },
  { name: 'Medium', color: '#0ea5e9', speed: 24, delay: 1.1, tall: 0.25, gem: 0.4, at: 250 },
  { name: 'Hard', color: '#f59e0b', speed: 30, delay: 0.95, tall: 0.35, gem: 0.45, at: 650 },
  { name: 'Insane', color: '#f43f5e', speed: 36, delay: 0.85, tall: 0.45, gem: 0.5, at: 1200 }
];

const LEVEL_STEP = 600; // metres per level once the preset levels run out
const OVERDRIVE_COLORS = ['#f43f5e', '#a855f7', '#ec4899', '#ef4444'];

/** Level config for any level number: presets first, then endless scaling. */
function levelConfig(n) {
  if (n <= LEVELS.length) return LEVELS[n - 1];
  const k = n - LEVELS.length; // levels past Insane
  const last = LEVELS[LEVELS.length - 1];
  return {
    name: `Insane +${k}`,
    color: OVERDRIVE_COLORS[(k - 1) % OVERDRIVE_COLORS.length],
    speed: Math.min(54, last.speed + k * 3),
    delay: Math.max(0.6, last.delay - k * 0.04),
    tall: Math.min(0.6, last.tall + k * 0.03),
    gem: last.gem,
    at: last.at + k * LEVEL_STEP
  };
}

const BG = 0xf4f6f9;
const ROAD_LEN = 100;
const ROAD_W = 2.4;
const ROAD_Z = -30;
const LOW_H = 0.8;
const TALL_H = 1.9;
const OBS_W = 1.7;
const OBS_D = 0.9;

const HIP_Y = 0.75;
const THIGH = 0.38;
const SHIN = 0.37;
const UPPER_ARM = 0.28;
const FOREARM = 0.26;
const RUNNER_SCALE = 0.88;

export class CyberRunnerGame extends BaseGame {
  constructor() {
    super({
      id: 'cyber-runner',
      name: 'Cyber-Runner',
      subtitle: '1-2 Player Runner Race',
      description: 'Jump and double jump over obstacles, grab gems and outlast your friend across 4 levels from Easy to Insane.',
      icon: '🏃',
      badge: 'Endless Runner',
      genre: 'Runner',
      players: '1-2 Players',
      modes: ['1 Player', '2 Players']
    });

    this.hasCustomRender = true;

    this.ownScene = null;
    this.ownCamera = null;
    this.hud = null;
    this._size = { w: 0, h: 0 };

    this.state = 'countdown'; // countdown | playing | paused | ending | over
    this.numPlayers = 1;
    this.level = 1;
    this.distance = 0;
    this.speed = 6;
    this.targetSpeed = 6;
    this.spawnTimer = 0;
    this.gemTimer = -1;
    this.gemHigh = false;
    this.shake = 0;
    this.countdownT = 0;
    this.lastCount = 0;
    this.endTimer = 0;
    this.overAt = 0;
    this.elapsed = 0;
    this.muted = false;
    this.best = parseInt(localStorage.getItem('cyberRunnerBest') || '0', 10);
    this.session = [0, 0];

    this.obstacles = [];
    this.gems = [];
    this.particles = [];
    this.pylons = [];
    this.roads = [];
    this.rails = [];
    this.laneX = [...LANES];
    this.roadTextures = [];
    this.runners = [];
    this.actx = null;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================
  async init(engine) {
    await super.init(engine);

    this.ownScene = new THREE.Scene();
    this.ownScene.background = new THREE.Color(BG);
    this.ownScene.fog = new THREE.FogExp2(BG, 0.02);

    this.ownCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.camBase = new THREE.Vector3();
    this.camTarget = new THREE.Vector3(0, 0.8, -8);

    this.buildLights();
    this.buildWorld();
    this.buildSharedAssets();
    this.runners = [this.makePlayer(0), this.makePlayer(1)];

    this._onPointer = (e) => this.onPointer(e);
    engine.renderer.domElement.addEventListener('pointerdown', this._onPointer);

    this.resize(true);
  }

  start(mode) {
    super.start(mode);
    this.numPlayers = String(mode).startsWith('1') ? 1 : 2;
    this.hud = null;
    this.bindHud();
    this.startCountdown();
  }

  destroy() {
    super.destroy();
    this.engine?.renderer.domElement.removeEventListener('pointerdown', this._onPointer);
    this.ownScene?.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    });
    this.ownScene = null;
    this.actx?.close?.();
    this.actx = null;
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  resize(force = false) {
    const el = this.engine.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    if (!force && w === this._size.w && h === this._size.h) return;
    this._size = { w, h };
    this.ownCamera.aspect = w / h;
    this.ownCamera.updateProjectionMatrix();
    this.placeCamera();
  }

  placeCamera() {
    const aspect = this.ownCamera.aspect;
    if (aspect < 1) this.camBase.set(0, 5.8, 12 + (1 - aspect) * 8);
    else this.camBase.set(0, 4.2, 9);
    this.ownCamera.position.copy(this.camBase);
    this.ownCamera.lookAt(this.camTarget);
  }

  render() {
    if (!this.ownScene) return;
    this.resize();
    this.engine.renderer.render(this.ownScene, this.ownCamera);
  }

  // =========================================================================
  // World
  // =========================================================================
  buildLights() {
    const scene = this.ownScene;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdbeafe, 1.8));

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 14, 6);
    sun.target.position.set(0, 0, -6);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 16, bottom: -16, near: 1, far: 60 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    this.cyanLight = new THREE.PointLight(0x06b6d4, 6, 14);
    this.magentaLight = new THREE.PointLight(0xf43f5e, 6, 14);
    scene.add(this.cyanLight, this.magentaLight);
  }

  makeRoadTexture(hex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(15,23,42,0.05)';
    g.fillRect(0, 0, 128, 2);
    g.fillStyle = hex;
    g.fillRect(0, 0, 6, 128);
    g.fillRect(122, 0, 6, 128);
    g.globalAlpha = 0.3;
    g.fillRect(60, 20, 8, 56);
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 25);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.engine.renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  buildWorld() {
    const scene = this.ownScene;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    this.grid = new THREE.GridHelper(120, 120, 0xbae6fd, 0xe2e8f0);
    this.grid.position.y = 0.005;
    scene.add(this.grid);

    LANES.forEach((x, i) => {
      const tex = this.makeRoadTexture(i === 0 ? '#0ea5e9' : '#f43f5e');
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_W, ROAD_LEN),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 })
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, ROAD_Z);
      road.receiveShadow = true;
      scene.add(road);
      this.roads.push(road);
      this.roadTextures.push(tex);
    });

    const railGeo = new THREE.BoxGeometry(0.1, 0.12, ROAD_LEN);
    // x2 / x1 = rail position in 2-player / 1-player layout (null = hidden in 1P)
    [
      { x2: -2.75, x1: -1.35, c: LANE_COLORS[0] },
      { x2: 2.75, x1: 1.35, c: LANE_COLORS[1], c1: LANE_COLORS[0] },
      { x2: 0, x1: null, c: 0xcbd5e1 }
    ].forEach((def) => {
      const mat = new THREE.MeshStandardMaterial({ color: def.c, emissive: def.c, emissiveIntensity: def.x2 === 0 ? 0 : 0.5, roughness: 0.3 });
      const rail = new THREE.Mesh(railGeo, mat);
      rail.position.set(def.x2, 0.06, ROAD_Z);
      scene.add(rail);
      this.rails.push({ mesh: rail, mat, ...def });
    });

    // Roadside pylons scroll past to make the speed visible
    const postGeo = new THREE.BoxGeometry(0.12, 1.6, 0.12);
    const capGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
    const capMats = (this.capMats = [new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), new THREE.MeshBasicMaterial({ color: 0xfb7185 })]);
    for (let i = 0; i < 12; i++) {
      [-1, 1].forEach((side, si) => {
        const g = new THREE.Group();
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.8;
        post.castShadow = true;
        const cap = new THREE.Mesh(capGeo, capMats[si]);
        cap.position.y = 1.7;
        g.add(post, cap);
        g.position.set(side * 3.8, 0, 20 - i * 10);
        g.userData = { side, cap, si };
        scene.add(g);
        this.pylons.push(g);
      });
    }

    // Ambient floating dust
    const dustCount = 500;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPos[i] = (Math.random() - 0.5) * 50;
      dustPos[i + 1] = Math.random() * 14;
      dustPos[i + 2] = (Math.random() - 0.5) * 80 - 20;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x94a3b8, size: 0.06, transparent: true, opacity: 0.6 }));
    scene.add(this.dust);
  }

  buildSharedAssets() {
    this.haloGeo = new THREE.RingGeometry(0.75, 0.9, 48);
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.6 });
    this.shortsMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    this.shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    this.lowGeo = new RoundedBoxGeometry(OBS_W, LOW_H, OBS_D, 4, 0.12);
    this.tallGeo = new RoundedBoxGeometry(OBS_W, TALL_H, OBS_D, 4, 0.12);
    this.bandGeo = new THREE.BoxGeometry(OBS_W * 1.01, 0.08, OBS_D * 1.01);
    this.obsMats = LANE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.25 }));
    this.tallMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.25 });
    this.bandMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.gemGeo = new THREE.OctahedronGeometry(0.32, 0);
    this.gemMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.2, flatShading: true
    });

    this.partGeo = new THREE.IcosahedronGeometry(0.08, 0);
    this.partMats = new Map();
  }

  // =========================================================================
  // Players: low-poly human runners
  // =========================================================================
  limb(len, radius, mat) {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len - radius * 2, 6, 12), mat);
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    return pivot;
  }

  makeRunner(color) {
    const jerseyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    const accentMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 });

    const figure = new THREE.Group();
    figure.scale.setScalar(RUNNER_SCALE);
    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    figure.add(hips);

    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.12, 6, 12), this.shortsMat);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.castShadow = true;
    const torso = new THREE.Group();
    hips.add(pelvis, torso);

    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.28, 6, 16), jerseyMat);
    chest.position.y = 0.3;
    chest.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), this.skinMat);
    head.position.y = 0.8;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.168, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat);
    hair.position.copy(head.position);
    hair.rotation.x = 0.35;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.028, 8, 32), accentMat);
    band.position.set(0, 0.83, 0);
    band.rotation.x = Math.PI / 2 + 0.15;
    torso.add(chest, head, hair, band);

    const arm = (side) => {
      const sh = this.limb(UPPER_ARM, 0.065, this.skinMat);
      sh.position.set(side * 0.27, 0.55, 0);
      sh.rotation.z = side * 0.12;
      const el = this.limb(FOREARM, 0.055, this.skinMat);
      el.position.y = -UPPER_ARM;
      sh.add(el);
      torso.add(sh);
      return { sh, el };
    };
    const leg = (side) => {
      const hp = this.limb(THIGH, 0.09, this.skinMat);
      hp.position.x = side * 0.11;
      const kn = this.limb(SHIN, 0.075, this.skinMat);
      kn.position.y = -THIGH;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), this.shoeMat);
      shoe.position.set(0, -SHIN + 0.03, -0.05);
      shoe.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.025, 0.265), accentMat);
      sole.position.set(0, -SHIN - 0.01, -0.05);
      kn.add(shoe, sole);
      hp.add(kn);
      hips.add(hp);
      return { hp, kn };
    };

    return { figure, hips, torso, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  }

  makePlayer(i) {
    const laneX = this.laneX[i];
    const color = LANE_COLORS[i];

    // root (collision centre) -> squash (pivot at the feet) -> runner figure
    const root = new THREE.Group();
    root.position.set(laneX, BALL_R, 0);
    const squash = new THREE.Group();
    squash.position.y = -BALL_R;
    root.add(squash);
    const rig = this.makeRunner(color);
    squash.add(rig.figure);
    this.ownScene.add(root);

    const halo = new THREE.Mesh(
      this.haloGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(laneX, 0.03, 0);
    this.ownScene.add(halo);

    return {
      i, laneX, color, root, squash, rig, halo,
      vy: 0, grounded: true, jumps: 0, squashAmt: 0,
      phase: i * Math.PI, air: 0, flipT: -1,
      lives: MAX_LIVES, invuln: 0, score: 0, streak: 0, out: false,
      els: null
    };
  }

  // =========================================================================
  // HUD (scoped styles live in style.css under .cr-*)
  // =========================================================================
  getHUDHtml() {
    const card = (n) => `
      <section class="cr-card cr-p${n} cr-glass" data-cr="card${n}">
        <span class="cr-label">Player ${n}</span>
        <span class="cr-score" data-cr="score${n}">0</span>
        <div class="cr-meta"><div class="cr-hearts" data-cr="hearts${n}"></div><span class="cr-streak" data-cr="streak${n}">🔥 x2</span></div>
      </section>`;
    return `
      <div class="cr-hud">
        <header class="cr-top">
          ${card(1)}
          <section class="cr-level cr-glass" data-cr="levelCard">
            <span class="cr-tag" data-cr="levelTag">Easy</span>
            <span class="cr-lvl" data-cr="levelDisplay">Level 1</span>
            <div class="cr-progress"><div data-cr="levelProgress"></div></div>
            <span class="cr-dist" data-cr="distDisplay">0 m</span>
          </section>
          ${card(2)}
        </header>

        <div class="cr-hints">
          <span class="cr-badge cr-glass"><kbd>W</kbd> / <kbd>Space</kbd> P1 jump</span>
          <span class="cr-badge cr-glass cr-hint-p2"><kbd>↑</kbd> P2 jump</span>
          <span class="cr-badge cr-glass">Press again in air = double jump</span>
          <span class="cr-badge cr-glass"><kbd>P</kbd> pause · <kbd>M</kbd> <span data-cr="muteLabel">sound on</span></span>
        </div>

        <div class="cr-flash cr-left" data-cr="flash1"></div>
        <div class="cr-flash cr-right" data-cr="flash2"></div>
        <div class="cr-countdown" data-cr="countdown"></div>
        <div class="cr-banner" data-cr="banner"><div class="cr-s">Level up</div><div class="cr-t" data-cr="bannerTitle">Level 2</div></div>

        <div class="cr-overlay" data-cr="pauseScreen">
          <div class="cr-panel cr-glass">
            <h2 class="cr-ptitle">Paused</h2>
            <p class="cr-psub">Press <kbd>P</kbd> to resume</p>
            <button class="cr-btn" data-cr="resumeBtn">Resume</button>
          </div>
        </div>

        <div class="cr-overlay" data-cr="gameOverScreen">
          <div class="cr-panel cr-glass">
            <h2 class="cr-ptitle" data-cr="gameOverTitle">Player 1 Wins!</h2>
            <p class="cr-psub" data-cr="gameOverText"></p>
            <div class="cr-final">
              <div class="cr-fs" style="--c:#0ea5e9"><div class="cr-n">Player 1</div><div class="cr-v" data-cr="final1">0</div></div>
              <div class="cr-fs" data-cr="final2box" style="--c:#f43f5e"><div class="cr-n">Player 2</div><div class="cr-v" data-cr="final2">0</div></div>
            </div>
            <button class="cr-btn" data-cr="restartBtn">Rematch <kbd>Space</kbd></button>
            <div class="cr-newbest" data-cr="newBest">★ New best score!</div>
            <div class="cr-stats"><span>Best <b data-cr="best">0</b></span><span data-cr="sessionRow">Session <b data-cr="session">P1 0 – 0 P2</b></span></div>
          </div>
        </div>
      </div>`;
  }

  bindHud() {
    const root = this.engine.ui.hudContainer;
    if (!root) return;
    const q = {};
    root.querySelectorAll('[data-cr]').forEach((el) => (q[el.dataset.cr] = el));
    this.hud = q;

    this.runners.forEach((p, idx) => {
      const n = idx + 1;
      p.els = { score: q['score' + n], hearts: q['hearts' + n], streak: q['streak' + n], card: q['card' + n], flash: q['flash' + n] };
      p.els.hearts.innerHTML = Array.from({ length: MAX_LIVES }, () => '<span class="cr-heart">♥</span>').join('');
    });

    q.restartBtn.addEventListener('click', () => this.startCountdown());
    q.resumeBtn.addEventListener('click', () => this.togglePause());
    q.sessionRow.style.display = this.numPlayers === 2 ? '' : 'none';
    root.querySelector('.cr-hint-p2').style.display = this.numPlayers === 2 ? '' : 'none';
    this.updateStatsUI();
  }

  retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  mult(p) {
    return p.streak >= 25 ? 3 : p.streak >= 10 ? 2 : 1;
  }

  renderHearts(p) {
    [...p.els.hearts.children].forEach((h, k) => h.classList.toggle('lost', k >= p.lives));
  }

  updateStreak(p) {
    const m = this.mult(p);
    p.els.streak.textContent = `🔥 x${m}`;
    p.els.streak.classList.toggle('on', m > 1);
  }

  addScore(p, pts) {
    p.score += pts * this.mult(p);
    p.els.score.textContent = p.score;
    this.retrigger(p.els.score, 'cr-bump');
  }

  setLevelUI() {
    const L = levelConfig(this.level);
    this.hud.levelCard.style.setProperty('--lc', L.color);
    this.hud.banner.style.setProperty('--lc', L.color);
    this.hud.levelDisplay.textContent = `Level ${this.level}`;
    this.hud.levelTag.textContent = L.name;
  }

  updateProgress() {
    const cur = levelConfig(this.level).at;
    const nxt = levelConfig(this.level + 1).at;
    const pct = ((this.distance - cur) / (nxt - cur)) * 100;
    this.hud.levelProgress.style.width = Math.min(100, pct) + '%';
    this.hud.distDisplay.textContent = Math.floor(this.distance) + ' m';
  }

  updateStatsUI() {
    this.hud.best.textContent = this.best;
    this.hud.session.textContent = `P1 ${this.session[0]} – ${this.session[1]} P2`;
  }

  showOverlay(name) {
    this.hud.pauseScreen.classList.toggle('show', name === 'pause');
    this.hud.gameOverScreen.classList.toggle('show', name === 'over');
  }

  showCount(html) {
    this.hud.countdown.innerHTML = `<span>${html}</span>`;
  }

  // =========================================================================
  // Audio (synthesized with the Web Audio API)
  // =========================================================================
  initAudio() {
    if (!this.actx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.actx = new Ctx();
    }
    if (this.actx && this.actx.state === 'suspended') this.actx.resume();
  }

  tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    const actx = this.actx;
    if (!actx || this.muted) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol) {
    const actx = this.actx;
    if (!actx || this.muted) return;
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = actx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  }

  sfx(name, arg) {
    const t = (...a) => this.tone(...a);
    switch (name) {
      case 'jump': return t(arg ? 520 : 440, 0.15, 'triangle', 0.12, arg ? 1040 : 880);
      case 'djump': return t(arg ? 780 : 660, 0.18, 'triangle', 0.12, arg ? 1560 : 1320);
      case 'gem': t(988, 0.08, 'square', 0.05); return t(1319, 0.16, 'square', 0.05, null, 0.07);
      case 'hit': t(180, 0.35, 'sawtooth', 0.16, 50); return this.noise(0.3, 0.3);
      case 'streak': return [660, 880, 1100].forEach((f, k) => t(f, 0.1, 'triangle', 0.08, null, k * 0.05));
      case 'level': return [523, 659, 784, 1047].forEach((f, k) => t(f, 0.18, 'triangle', 0.12, null, k * 0.09));
      case 'count': return t(arg ? 880 : 440, arg ? 0.45 : 0.15, 'sine', 0.18);
      case 'over': return [392, 330, 262].forEach((f, k) => t(f, 0.3, 'triangle', 0.14, null, k * 0.18));
    }
  }

  // =========================================================================
  // Particles, obstacles, gems
  // =========================================================================
  partMat(c) {
    if (!this.partMats.has(c)) this.partMats.set(c, new THREE.MeshBasicMaterial({ color: c }));
    return this.partMats.get(c);
  }

  burst(pos, color, count = 24, spd = 6, up = 4, size = 1, vz = 0) {
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(this.partGeo, this.partMat(color));
      m.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
        .normalize().multiplyScalar(spd * (0.4 + Math.random() * 0.8));
      v.y += up * Math.random();
      v.z += vz;
      const s = size * (0.6 + Math.random() * 0.9);
      m.scale.setScalar(s);
      this.ownScene.add(m);
      this.particles.push({ mesh: m, v, life: 0.6 + Math.random() * 0.5, s });
    }
  }

  updateParticles(dt) {
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        this.ownScene.remove(p.mesh);
        this.particles.splice(k, 1);
        continue;
      }
      p.v.y += GRAVITY * 0.5 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.v.y *= -0.4;
        p.v.x *= 0.7;
        p.v.z *= 0.7;
      }
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      p.mesh.scale.setScalar(p.s * Math.min(1, p.life * 2.5));
    }
  }

  createObstacle(lane, tall) {
    const h = tall ? TALL_H : LOW_H;
    const g = new THREE.Group();
    const m = new THREE.Mesh(tall ? this.tallGeo : this.lowGeo, tall ? this.tallMat : this.obsMats[lane]);
    m.position.y = h / 2;
    m.castShadow = m.receiveShadow = true;
    const band = new THREE.Mesh(this.bandGeo, this.bandMat);
    band.position.y = h - 0.18;
    g.add(m, band);
    if (tall) {
      const band2 = band.clone();
      band2.position.y = h * 0.45;
      g.add(band2);
    }
    g.position.set(this.laneX[lane], 0, SPAWN_Z);
    g.scale.y = 0.01;
    this.ownScene.add(g);
    this.obstacles.push({ group: g, lane, h, tall, passed: false });
  }

  createGem(lane, high) {
    const m = new THREE.Mesh(this.gemGeo, this.gemMat);
    const baseY = high ? 2.2 : 0.9;
    m.position.set(this.laneX[lane], baseY, SPAWN_Z);
    m.castShadow = true;
    this.ownScene.add(m);
    this.gems.push({ mesh: m, lane, baseY, t: Math.random() * 6 });
  }

  // =========================================================================
  // Game flow
  // =========================================================================
  /** 1 Player shows a single centred road; 2 Players shows both lanes. */
  applyLayout() {
    const one = this.numPlayers === 1;
    this.laneX = one ? [0, LANES[1]] : [...LANES];

    this.roads[0].position.x = this.laneX[0];
    this.roads[1].visible = !one;

    this.rails.forEach((r) => {
      const x = one ? r.x1 : r.x2;
      r.mesh.visible = x !== null;
      if (x !== null) r.mesh.position.x = x;
      const c = one && r.c1 !== undefined ? r.c1 : r.c;
      r.mat.color.setHex(c);
      r.mat.emissive.setHex(c);
    });

    this.pylons.forEach((g) => {
      g.position.x = g.userData.side * (one ? 2.4 : 3.8);
      g.userData.cap.material = this.capMats[one ? 0 : g.userData.si];
    });

    const p = this.runners[0];
    p.laneX = this.laneX[0];
    p.root.position.x = p.laneX;
    p.halo.position.x = p.laneX;
  }

  resetGame() {
    this.applyLayout();
    this.obstacles.forEach((o) => this.ownScene.remove(o.group));
    this.obstacles.length = 0;
    this.gems.forEach((g) => this.ownScene.remove(g.mesh));
    this.gems.length = 0;
    this.level = 1;
    this.distance = 0;
    this.spawnTimer = 1.2;
    this.gemTimer = -1;

    this.runners.forEach((p, idx) => {
      if (this.numPlayers === 1 && idx === 1) {
        p.out = true;
        p.root.visible = false;
        p.halo.visible = false;
        p.els.card.style.display = 'none';
        return;
      }
      Object.assign(p, { lives: MAX_LIVES, score: 0, streak: 0, out: false, invuln: 0, vy: 0, grounded: true, jumps: 0, squashAmt: 0, air: 0, flipT: -1 });
      p.root.position.y = BALL_R;
      p.root.visible = true;
      p.halo.visible = true;
      p.rig.figure.visible = true;
      p.rig.hips.rotation.x = 0;
      p.els.score.textContent = '0';
      p.els.card.style.display = 'flex';
      p.els.card.classList.remove('out');
      this.renderHearts(p);
      this.updateStreak(p);
    });
    this.setLevelUI();
    this.updateProgress();
  }

  startCountdown() {
    if (this.state === 'over' && performance.now() - this.overAt < 700) return; // avoid accidental instant rematch
    this.initAudio();
    this.showOverlay(null);
    this.resetGame();
    this.state = 'countdown';
    this.countdownT = 3;
    this.lastCount = 0;
    this.targetSpeed = 0;
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.showOverlay('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.showOverlay(null);
    }
  }

  jump(p) {
    if (this.state !== 'playing' || p.out) return;
    if (p.grounded) {
      p.vy = JUMP_V;
      p.grounded = false;
      p.jumps = 1;
      this.sfx('jump', p.i);
    } else if (p.jumps < 2) {
      p.vy = DOUBLE_JUMP_V;
      p.jumps = 2;
      p.flipT = 0; // front flip
      this.sfx('djump', p.i);
      this.burst(p.root.position.clone().setY(p.root.position.y - BALL_R), p.color, 10, 3, 0, 0.6, this.speed * 0.3);
    }
  }

  hit(p, o) {
    p.lives--;
    p.streak = 0;
    this.updateStreak(p);
    this.renderHearts(p);
    this.burst(o.group.position.clone().setY(o.h / 2), o.tall ? 0xf59e0b : LANE_COLORS[o.lane], 30, 7, 5, 1.3, this.speed * 0.4);
    this.ownScene.remove(o.group);
    this.shake = 0.5;
    this.sfx('hit');
    this.retrigger(p.els.flash, 'show');
    if (p.lives <= 0) {
      p.out = true;
      this.burst(p.root.position.clone(), p.color, 50, 9, 6, 1.4, 0);
      this.burst(p.root.position.clone(), 0xffffff, 30, 7, 5, 1.1, 0);
      p.root.visible = false;
      p.halo.visible = false;
      p.els.card.classList.add('out');
      this.shake = 0.9;
      if (this.state === 'playing') {
        this.state = 'ending';
        this.endTimer = 1.4;
        this.targetSpeed = 0;
      }
    } else {
      p.invuln = INVULN_TIME;
    }
  }

  endGame() {
    this.state = 'over';
    this.overAt = performance.now();
    const [a, b] = this.runners;
    const h = this.hud;

    let winner = -1;
    if (this.numPlayers === 2) {
      if (a.out && !b.out) winner = 1;
      else if (b.out && !a.out) winner = 0;
      else winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
      if (winner >= 0) this.session[winner]++;
    }

    if (this.numPlayers === 1) {
      h.gameOverTitle.textContent = 'Game Over!';
      h.gameOverTitle.style.color = '#0ea5e9';
      h.final2box.style.display = 'none';
    } else {
      h.final2box.style.display = '';
      h.gameOverTitle.textContent = winner < 0 ? "It's a Draw!" : `Player ${winner + 1} Wins!`;
      h.gameOverTitle.style.color = winner < 0 ? '#0f172a' : winner === 0 ? '#0ea5e9' : '#f43f5e';
    }
    h.gameOverText.textContent = `Reached Level ${this.level} (${levelConfig(this.level).name}) · ${Math.floor(this.distance)} m`;
    h.final1.textContent = a.score;
    h.final2.textContent = b.score;

    const top = this.numPlayers === 1 ? a.score : Math.max(a.score, b.score);
    const isBest = top > this.best;
    if (isBest) {
      this.best = top;
      localStorage.setItem('cyberRunnerBest', String(this.best));
    }
    h.newBest.style.display = isBest ? 'block' : 'none';
    this.updateStatsUI();
    this.showOverlay('over');
    this.sfx('over');
    this.targetSpeed = 4;
  }

  // =========================================================================
  // Per-frame updates
  // =========================================================================
  updateSpawner(dt) {
    const L = levelConfig(this.level);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      // Mirrored waves: both players face the exact same course
      const tall = Math.random() < L.tall;
      this.createObstacle(0, tall);
      if (this.numPlayers === 2) this.createObstacle(1, tall);
      const next = L.delay * (0.85 + Math.random() * 0.4) + (tall ? 0.35 : 0);
      this.spawnTimer = next;
      if (Math.random() < L.gem) {
        this.gemTimer = next / 2;
        this.gemHigh = Math.random() < 0.5;
      }
    }
    if (this.gemTimer >= 0) {
      this.gemTimer -= dt;
      if (this.gemTimer < 0) {
        this.createGem(0, this.gemHigh);
        if (this.numPlayers === 2) this.createGem(1, this.gemHigh);
      }
    }
  }

  checkLevel() {
    while (this.distance >= levelConfig(this.level + 1).at) {
      this.level++;
      const L = levelConfig(this.level);
      this.targetSpeed = L.speed;
      this.setLevelUI();
      this.hud.bannerTitle.textContent = `Level ${this.level} · ${L.name}`;
      this.retrigger(this.hud.banner, 'show');
      this.sfx('level');
    }
  }

  hitsBox(p, o) {
    const c = p.root.position;
    const bx = o.group.position.x;
    const bz = o.group.position.z;
    const dx = c.x - THREE.MathUtils.clamp(c.x, bx - OBS_W / 2, bx + OBS_W / 2);
    const dy = c.y - THREE.MathUtils.clamp(c.y, 0, o.h);
    const dz = c.z - THREE.MathUtils.clamp(c.z, bz - OBS_D / 2, bz + OBS_D / 2);
    const r = BALL_R * 0.85; // slightly forgiving hitbox
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  updateObstacles(dt, active) {
    for (let k = this.obstacles.length - 1; k >= 0; k--) {
      const o = this.obstacles[k];
      o.group.position.z += this.speed * dt;
      if (o.group.scale.y < 1) o.group.scale.y = Math.min(1, o.group.scale.y + dt * 4);
      const p = this.runners[o.lane];

      if (active && !p.out && p.invuln <= 0 && this.hitsBox(p, o)) {
        this.hit(p, o);
        this.obstacles.splice(k, 1);
        continue;
      }
      if (!o.passed && o.group.position.z - OBS_D / 2 > BALL_R) {
        o.passed = true;
        if (active && !p.out && p.invuln <= 0) {
          const before = this.mult(p);
          p.streak++;
          this.addScore(p, 10);
          this.updateStreak(p);
          if (this.mult(p) > before) this.sfx('streak');
        }
      }
      if (o.group.position.z > DESPAWN_Z) {
        this.ownScene.remove(o.group);
        this.obstacles.splice(k, 1);
      }
    }
  }

  updateGems(dt, active) {
    for (let k = this.gems.length - 1; k >= 0; k--) {
      const g = this.gems[k];
      g.t += dt;
      g.mesh.position.z += this.speed * dt;
      g.mesh.position.y = g.baseY + Math.sin(g.t * 4) * 0.12;
      g.mesh.rotation.y += dt * 3;
      const p = this.runners[g.lane];
      if (active && !p.out && p.root.position.distanceTo(g.mesh.position) < 0.95) {
        this.addScore(p, 25);
        this.burst(g.mesh.position.clone(), 0xfbbf24, 14, 4, 2, 0.7, this.speed * 0.3);
        this.sfx('gem');
        this.ownScene.remove(g.mesh);
        this.gems.splice(k, 1);
        continue;
      }
      if (g.mesh.position.z > DESPAWN_Z) {
        this.ownScene.remove(g.mesh);
        this.gems.splice(k, 1);
      }
    }
  }

  updatePlayer(p, dt) {
    if (p.out) return;
    const pos = p.root.position;
    if (!p.grounded) {
      p.vy += GRAVITY * dt;
      pos.y += p.vy * dt;
      if (pos.y <= BALL_R) {
        pos.y = BALL_R;
        p.vy = 0;
        p.grounded = true;
        p.jumps = 0;
        p.squashAmt = 1;
        p.flipT = -1;
        p.rig.hips.rotation.x = 0;
        this.burst(new THREE.Vector3(pos.x, 0.1, pos.z), 0xcbd5e1, 8, 2.5, 1.5, 0.6, this.speed * 0.3);
      }
    }

    // Run cycle (blends into a tucked pose while airborne)
    const r = p.rig;
    const amp = Math.min(1, this.speed / 8);
    p.phase += this.speed * 0.5 * dt;
    p.air += ((p.grounded ? 0 : 1) - p.air) * Math.min(1, dt * 12);
    const a = p.air;
    const g = 1 - a;
    const s = Math.sin(p.phase);
    const c = Math.cos(p.phase);
    const mix = (run, air) => run * g + air * a;
    r.legL.hp.rotation.x = mix(s * 0.9 * amp, 0.9);
    r.legR.hp.rotation.x = mix(-s * 0.9 * amp, -0.3);
    r.legL.kn.rotation.x = mix(-amp * (0.15 + 1.2 * Math.max(0, c)), -1.4);
    r.legR.kn.rotation.x = mix(-amp * (0.15 + 1.2 * Math.max(0, -c)), -0.7);
    r.armL.sh.rotation.x = mix(-s * 0.8 * amp, 2.6);
    r.armR.sh.rotation.x = mix(s * 0.8 * amp, 2.6);
    r.armL.el.rotation.x = r.armR.el.rotation.x = mix(0.4 + 0.9 * amp, 0.3);
    r.torso.rotation.x = mix(-0.18 * amp, -0.1);
    r.hips.position.y = HIP_Y + g * Math.abs(c) * 0.06 * amp;

    // Front flip on double jump
    if (p.flipT >= 0) {
      p.flipT += dt / 0.5;
      const t = Math.min(1, p.flipT);
      r.hips.rotation.x = -Math.PI * 2 * (1 - Math.pow(1 - t, 3));
      if (t >= 1) {
        p.flipT = -1;
        r.hips.rotation.x = 0;
      }
    }

    // Squash on landing, stretch while airborne
    p.squashAmt = Math.max(0, p.squashAmt - dt * 6);
    let sy = 1 - 0.16 * p.squashAmt;
    let sxz = 1 + 0.1 * p.squashAmt;
    if (!p.grounded) {
      const st = Math.min(Math.abs(p.vy) / 50, 0.08);
      sy *= 1 + st;
      sxz *= 1 - st * 0.5;
    }
    p.squash.scale.set(sxz, sy, sxz);

    // Blink while invulnerable
    if (p.invuln > 0) {
      p.invuln -= dt;
      r.figure.visible = Math.floor(p.invuln * 14) % 2 === 0;
    } else {
      r.figure.visible = true;
    }

    // Halo is a ground marker that shrinks and fades with height
    const h = pos.y - BALL_R;
    p.halo.scale.setScalar((1 / (1 + h * 0.35)) * (1 + Math.sin(this.elapsed * 3 + p.i) * 0.03));
    p.halo.material.opacity = 0.55 / (1 + h * 0.8);
  }

  updateCountdown(dt) {
    this.countdownT -= dt;
    const n = Math.ceil(this.countdownT);
    if (n > 0 && n !== this.lastCount) {
      this.lastCount = n;
      this.showCount(n);
      this.sfx('count', false);
    }
    if (this.countdownT <= 0) {
      this.showCount('<span style="color:#22c55e">GO!</span>');
      this.sfx('count', true);
      this.state = 'playing';
      this.targetSpeed = LEVELS[0].speed;
    }
  }

  scrollWorld(dt) {
    const d = this.speed * dt;
    this.roadTextures.forEach((t) => (t.offset.y = (t.offset.y + d / 4) % 1)); // 1 repeat = 4 world units
    this.grid.position.z = (this.grid.position.z + d) % 1;
    this.pylons.forEach((g) => {
      g.position.z += d;
      if (g.position.z > 20) g.position.z -= 120;
    });
  }

  // =========================================================================
  // Input
  // =========================================================================
  onPointer(e) {
    if (!this.isRunning) return;
    if (this.numPlayers === 1) return this.jump(this.runners[0]);
    const el = this.engine.renderer.domElement;
    const x = e.clientX - el.getBoundingClientRect().left;
    this.jump(this.runners[x < el.clientWidth / 2 ? 0 : 1]);
  }

  handleInput(input) {
    const one = this.numPlayers === 1;
    if (input.wasJustPressed('KeyW') || (one && (input.wasJustPressed('ArrowUp') || input.wasJustPressed('Space')))) {
      this.jump(this.runners[0]);
    }
    if (!one && input.wasJustPressed('ArrowUp')) this.jump(this.runners[1]);

    if (input.wasJustPressed('Space') || input.wasJustPressed('Enter')) {
      if (this.state === 'over') this.startCountdown();
    }
    if (input.wasJustPressed('KeyP')) this.togglePause();
    if (input.wasJustPressed('KeyM')) {
      this.muted = !this.muted;
      this.hud.muteLabel.textContent = this.muted ? 'sound off' : 'sound on';
    }
  }

  // =========================================================================
  // Main update
  // =========================================================================
  update(dt, input) {
    if (!this.ownScene || !this.hud) return;
    this.handleInput(input);
    if (this.state === 'paused') return;

    this.elapsed += dt;
    const active = this.state === 'playing';

    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 2);
    this.scrollWorld(dt);

    if (active) {
      this.distance += this.speed * dt;
      this.checkLevel();
      this.updateProgress();
      this.updateSpawner(dt);
    }
    this.updateObstacles(dt, active);
    this.updateGems(dt, active);
    this.runners.forEach((p) => this.updatePlayer(p, dt));
    this.updateParticles(dt);

    if (this.state === 'countdown') this.updateCountdown(dt);
    if (this.state === 'ending') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.endGame();
    }

    // Ambient motion
    const t = this.elapsed;
    this.cyanLight.position.set(Math.cos(t * 0.8) * 4.5, 2 + Math.sin(t * 1.5) * 0.8, Math.sin(t * 0.8) * 4.5 - 2);
    this.magentaLight.position.set(Math.cos(t * 0.6 + Math.PI) * 5, 2.5 + Math.cos(t * 1.2) * 0.8, Math.sin(t * 0.6 + Math.PI) * 5 - 2);
    this.dust.rotation.y = t * 0.02;

    // Camera shake
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.ownCamera.position.set(
      this.camBase.x + (Math.random() - 0.5) * this.shake,
      this.camBase.y + (Math.random() - 0.5) * this.shake,
      this.camBase.z
    );
    this.ownCamera.lookAt(this.camTarget);
  }

  getControlsGuide() {
    return [
      { label: 'Jump (P1)', keys: 'W / SPACE / Click' },
      { label: 'Jump (P2)', keys: '↑ / Tap right side' },
      { label: 'Double Jump', keys: 'Press again in air' },
      { label: 'Pause / Mute', keys: 'P / M' },
      { label: 'Return to Lobby', keys: 'Lobby Button' }
    ];
  }
}
