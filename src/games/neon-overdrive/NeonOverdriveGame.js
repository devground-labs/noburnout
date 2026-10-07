import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BaseGame } from '../../framework/BaseGame.js';

// ---------------------------------------------------------------------------
// Track layout (world units). Car travels toward -Z; the world scrolls to +Z.
// ---------------------------------------------------------------------------
const LANES = [-10, -5, 0, 5, 10];
const ROAD_WIDTH = 25;
const ROAD_LENGTH = 520;
const CAR_X_LIMIT = 11.2;
const SPAWN_Z = -260;
const DESPAWN_Z = 24;
const START_SPEED = 70;
const MAX_SPEED = 190;
const TRAFFIC_SPEED = 28;
const DASH_PERIOD = 20; // world units covered by one road-texture tile
const GRID_PERIOD = 20;
const SCENERY_SPAN = 480;

const TRAFFIC_COLORS = [0xff2a6d, 0xff9f1c, 0xa855f7, 0x2dff8a, 0xe2e8f0];

/** Unlit, tone-map-exempt colour that the bloom pass will pick up. */
function glow(color, intensity = 1.6, opts = {}) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...opts });
}

function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class NeonOverdriveGame extends BaseGame {
  constructor() {
    super({
      id: 'neon-overdrive',
      name: 'Neon Overdrive',
      subtitle: 'Infinite Synthwave Highway',
      description: 'Dodge traffic and barricades on an endless cyberpunk highway. How long can you survive at terminal velocity?',
      icon: '🏎️',
      badge: 'Infinite Runner',
      genre: 'Racing',
      players: '1 Player',
      modes: ['Endless']
    });

    // This game owns its scene, camera and render pipeline instead of using
    // the engine's shared ones.
    this.hasCustomRender = true;

    this.ownScene = null;
    this.ownCamera = null;
    this.composer = null;
    this.bloom = null;

    this.car = null;
    this.carWheels = [];
    this.carVel = 0;
    this.obstacles = [];
    this.particles = [];
    this.scenery = [];
    this.scrollers = [];
    this.disposables = [];

    this.speed = START_SPEED;
    this.score = 0;
    this.distanceSinceSpawn = 0;
    this.nearMisses = 0;
    this.combo = 0;
    this.shake = 0;
    this.isGameOver = false;
    this.highScore = parseInt(localStorage.getItem('neon_highscore') || '0', 10);

    this.hud = null;
    this._toastTimer = 0;
    this._size = { w: 0, h: 0 };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async init(engine) {
    await super.init(engine);

    this.ownScene = new THREE.Scene();
    this.ownScene.background = this.makeSkyTexture();
    this.ownScene.fog = new THREE.Fog(0x1a0838, 90, 400);

    this.ownCamera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.ownCamera.position.set(0, 5.4, 11);

    const hemi = new THREE.HemisphereLight(0xb06bff, 0x120628, 0.9);
    this.ownScene.add(hemi);
    const key = new THREE.DirectionalLight(0x7fe9ff, 1.1);
    key.position.set(-14, 26, 16);
    this.ownScene.add(key);
    const rim = new THREE.DirectionalLight(0xff3df2, 0.9);
    rim.position.set(16, 12, -20);
    this.ownScene.add(rim);

    this.buildSky();
    this.buildRoad();
    this.buildScenery();
    this.car = this.buildCar({ body: 0x00d9ff, accent: 0xff2bd6, player: true });
    this.car.position.set(0, 0, 0);
    this.ownScene.add(this.car);

    this.setupPostProcessing();
    this.resize(true);
  }

  start(mode) {
    super.start(mode);
    this.resetGame();
  }

  destroy() {
    super.destroy();
    this.composer?.dispose();
    this.ownScene?.traverse(o => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach(m => {
        m.map?.dispose();
        m.dispose();
      });
    });
    if (this.ownScene?.background?.dispose) this.ownScene.background.dispose();
    this.ownScene = null;
    // Hand the shared renderer back in the state the lobby expects.
    this.engine?.renderer.setRenderTarget(null);
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  setupPostProcessing() {
    const r = this.engine.renderer;
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.ownScene, this.ownCamera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(force = false) {
    const el = this.engine.renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    if (!force && w === this._size.w && h === this._size.h) return;
    this._size = { w, h };
    this.ownCamera.aspect = w / h;
    // Keep the road fully in view on narrow / portrait windows.
    this.baseFov = w / h < 1 ? 78 : 62;
    this.ownCamera.fov = this.baseFov;
    this.ownCamera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.engine.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render() {
    if (!this.ownScene) return;
    this.resize();
    this.composer.render();
  }

  // -------------------------------------------------------------------------
  // Environment
  // -------------------------------------------------------------------------
  makeSkyTexture() {
    return makeCanvasTexture(8, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05010f');
      g.addColorStop(0.45, '#1a0638');
      g.addColorStop(0.72, '#5a0f6e');
      g.addColorStop(0.88, '#c2185b');
      g.addColorStop(1, '#ff6a3d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  buildSky() {
    const scene = this.ownScene;

    // Striped retro sun
    const sunTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fff176');
      g.addColorStop(0.5, '#ff4d8d');
      g.addColorStop(1, '#a100ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) {
        const y = h * 0.45 + i * h * 0.062;
        ctx.fillRect(0, y, w, 3 + i * 2.2);
      }
    });
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(70, 64),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, toneMapped: false })
    );
    sun.position.set(0, 52, -430);
    scene.add(sun);

    // Mountain ridge silhouettes
    const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x0c0420, fog: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xff2bd6).multiplyScalar(1.4), fog: false, toneMapped: false });
    for (let i = -7; i <= 7; i++) {
      const h = 28 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 42;
      const w = 46 + (i % 3) * 8;
      const geo = new THREE.ConeGeometry(w, h, 4);
      const m = new THREE.Mesh(geo, ridgeMat);
      m.position.set(i * 52, h / 2 - 2, -400 - Math.abs(i % 2) * 18);
      m.rotation.y = Math.PI / 4;
      scene.add(m);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      lines.position.copy(m.position);
      lines.rotation.copy(m.rotation);
      scene.add(lines);
    }

    // Stars
    const n = 320;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 900;
      pos[i * 3 + 1] = 60 + Math.random() * 220;
      pos[i * 3 + 2] = -300 - Math.random() * 120;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, color: 0xffffff, fog: false, sizeAttenuation: false })));
  }

  buildRoad() {
    const scene = this.ownScene;

    // Asphalt with lane dashes + solid edge lines. One tile = DASH_PERIOD units.
    const roadTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0b0b18';
      ctx.fillRect(0, 0, w, h);
      // subtle asphalt noise
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      const laneW = w / 5;
      ctx.fillStyle = '#e8f9ff';
      for (let i = 1; i < 5; i++) {
        ctx.fillRect(i * laneW - 3, h * 0.08, 6, h * 0.4);
      }
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(2, 0, 7, h);
      ctx.fillRect(w - 9, 0, 7, h);
    });
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, ROAD_LENGTH / DASH_PERIOD);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.55, metalness: 0.35 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -ROAD_LENGTH / 2 + 40);
    scene.add(road);
    this.scrollers.push({ tex: roadTex, period: DASH_PERIOD });

    // Synthwave grid either side of the road
    const gridTex = makeCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#07021a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ff2bd6';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, w, h);
    });
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    const gridSize = 700;
    gridTex.repeat.set(gridSize / GRID_PERIOD, gridSize / GRID_PERIOD);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshBasicMaterial({ map: gridTex, toneMapped: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, -gridSize / 2 + 80);
    scene.add(ground);
    this.scrollers.push({ tex: gridTex, period: GRID_PERIOD });

    // Glowing curbs + low guard rails
    const edgeZ = -ROAD_LENGTH / 2 + 40;
    [[-1, 0x00e5ff], [1, 0xff2bd6]].forEach(([side, color]) => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, ROAD_LENGTH), glow(color, 0.95));
      curb.position.set(side * (ROAD_WIDTH / 2 + 0.25), 0.18, edgeZ);
      scene.add(curb);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 1.0, ROAD_LENGTH),
        new THREE.MeshStandardMaterial({ color: 0x14102b, roughness: 0.6, metalness: 0.5 })
      );
      rail.position.set(side * (ROAD_WIDTH / 2 + 1.1), 0.5, edgeZ);
      scene.add(rail);
    });
  }

  /** Recycled pylons, towers and lamp posts that streak past the player. */
  buildScenery() {
    const scene = this.ownScene;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0720, roughness: 0.7, metalness: 0.4 });
    const palette = [0x00e5ff, 0xff2bd6, 0x8a5cff];
    const count = 12;
    const step = SCENERY_SPAN / count;

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < count; i++) {
        const g = new THREE.Group();
        const color = palette[(i + (side > 0 ? 1 : 0)) % palette.length];
        const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), toneMapped: false });

        // Tower
        const h = 14 + Math.random() * 34;
        const w = 6 + Math.random() * 6;
        const geo = new THREE.BoxGeometry(w, h, w);
        const tower = new THREE.Mesh(geo, bodyMat);
        tower.position.set(side * (26 + w / 2 + Math.random() * 22), h / 2, 0);
        g.add(tower);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
        edges.position.copy(tower.position);
        g.add(edges);

        // Lamp post leaning over the road
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 6), bodyMat);
        pole.position.set(side * (ROAD_WIDTH / 2 + 1.6), 4, 0);
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.14, 0.14), bodyMat);
        arm.position.set(side * (ROAD_WIDTH / 2 - 0.1), 8, 0);
        g.add(arm);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.5), glow(color, 2.2));
        lamp.position.set(side * (ROAD_WIDTH / 2 - 1.6), 7.9, 0);
        g.add(lamp);

        g.position.z = DESPAWN_Z - i * step - (side > 0 ? step / 2 : 0);
        scene.add(g);
        this.scenery.push(g);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Vehicles (front of car points toward -Z)
  // -------------------------------------------------------------------------
  buildCar({ body, accent, player }) {
    const car = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: body, emissive: body, emissiveIntensity: 0.28, metalness: 0.55, roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x07070f, metalness: 0.9, roughness: 0.15 });

    // Side-profile hull (shape X = length, nose at +X), extruded across the width.
    const s = new THREE.Shape();
    s.moveTo(-2.3, 0.3);
    s.lineTo(-2.3, 0.85);
    s.lineTo(-1.7, 0.95);
    s.lineTo(-0.95, 1.38);
    s.lineTo(0.65, 1.38);
    s.lineTo(1.5, 0.95);
    s.lineTo(2.3, 0.78);
    s.lineTo(2.3, 0.3);
    s.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 2.1, bevelEnabled: false });
    hullGeo.translate(0, 0, -1.05);
    hullGeo.rotateY(Math.PI / 2); // nose (+X) -> -Z
    const hull = new THREE.Mesh(hullGeo, bodyMat);
    hull.position.y = 0.1;
    car.add(hull);

    // Window band, slightly proud of the hull sides
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.28, 1.6), darkMat);
    glass.position.set(0, 1.2, 0.3);
    car.add(glass);

    // Side accent stripes
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.07, 3.9), glow(accent, 1.8));
    stripe.position.set(0, 0.62, 0);
    car.add(stripe);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 20);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.42, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.9 });
    const rimMat = glow(accent, 1.3);
    [[-1.1, -1.45], [1.1, -1.45], [-1.1, 1.45], [1.1, 1.45]].forEach(([x, z]) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wheelGeo, tireMat), new THREE.Mesh(rimGeo, rimMat));
      w.position.set(x, 0.46, z);
      car.add(w);
      this.carWheels.push(w);
    });

    // Rear lights + roof-to-tail neon, front headlamps
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.08), glow(0xff1744, 2.4));
    tail.position.set(0, 0.92, 2.4);
    car.add(tail);
    [-0.75, 0.75].forEach(x => {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.08), glow(0xfff7d6, 2.6));
      head.position.set(x, 0.72, -2.4);
      car.add(head);
    });

    // Underglow
    const glowTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 7.4),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: accent, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = 0.06;
    car.add(under);

    if (player) {
      // Spoiler
      [-0.8, 0.8].forEach(x => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.12), darkMat);
        post.position.set(x, 1.15, 2.0);
        car.add(post);
      });
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.6), bodyMat);
      wing.position.set(0, 1.38, 2.05);
      car.add(wing);
      const wingGlow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 0.05), glow(accent, 2));
      wingGlow.position.set(0, 1.38, 2.37);
      car.add(wingGlow);
      // Hood stripe
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 1.7), glow(accent, 1.8));
      hood.position.set(0, 1.0, -1.35);
      hood.rotation.x = 0.1;
      car.add(hood);
    }
    return car;
  }

  buildBarricade() {
    const g = new THREE.Group();
    const stripeTex = makeCanvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#ffb300';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#12091f';
      for (let x = -h; x < w + h; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 32, h);
        ctx.lineTo(x + 32 + h, 0);
        ctx.lineTo(x + h, 0);
        ctx.fill();
      }
    });
    const face = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.9), face);
    block.position.y = 0.7;
    g.add(block);
    [-1.6, 1.6].forEach(x => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a24 }));
      leg.position.set(x, 0.25, 0);
      g.add(leg);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glow(0xff1744, 2.6));
      beacon.position.set(x, 1.35, 0);
      g.add(beacon);
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.06), glow(0xff1744, 2));
    bar.position.set(0, 1.18, 0.46);
    g.add(bar);
    return g;
  }

  // -------------------------------------------------------------------------
  // Game flow
  // -------------------------------------------------------------------------
  spawnRow() {
    // Never block more than 3 of the 5 lanes, so a gap always exists.
    const maxBlocked = this.speed > 130 ? 3 : 2;
    const blocked = 1 + Math.floor(Math.random() * maxBlocked);
    const lanes = [...LANES.keys()].sort(() => Math.random() - 0.5).slice(0, blocked);
    const rowTraffic = TRAFFIC_SPEED * (0.7 + Math.random() * 0.6);

    lanes.forEach(laneIdx => {
      const isBarricade = Math.random() < 0.28;
      const mesh = isBarricade
        ? this.buildBarricade()
        : this.buildCar({
            body: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
            accent: 0x1b1033,
            player: false
          });
      mesh.position.set(LANES[laneIdx], 0, SPAWN_Z);
      this.ownScene.add(mesh);
      this.obstacles.push({
        mesh,
        v: isBarricade ? 0 : rowTraffic,
        halfW: isBarricade ? 2.1 : 1.05,
        halfL: isBarricade ? 0.45 : 2.3,
        passed: false
      });
    });
  }

  resetGame() {
    this.isGameOver = false;
    this.speed = START_SPEED;
    this.score = 0;
    this.nearMisses = 0;
    this.combo = 0;
    this.carVel = 0;
    this.shake = 0;
    this.distanceSinceSpawn = 0;
    this.car.position.set(0, 0, 0);
    this.car.rotation.set(0, 0, 0);
    this.car.visible = true;

    this.obstacles.forEach(o => this.disposeObject(o.mesh));
    this.obstacles = [];
    this.particles.forEach(p => this.disposeObject(p.mesh));
    this.particles = [];

    this.setHudState(false);
    this.updateHUD();
  }

  disposeObject(obj) {
    this.ownScene.remove(obj);
    obj.traverse(o => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
    });
  }

  crash() {
    this.isGameOver = true;
    this.car.visible = false;
    this.shake = 1;
    this.combo = 0;

    const finalScore = Math.floor(this.score);
    this.isNewBest = finalScore > this.highScore;
    if (this.isNewBest) {
      this.highScore = finalScore;
      localStorage.setItem('neon_highscore', String(finalScore));
    }

    const colors = [0x00d9ff, 0xff2bd6, 0xffb300, 0xffffff];
    const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(geo, glow(colors[i % colors.length], 2));
      m.position.set(this.car.position.x, 1, 0);
      this.ownScene.add(m);
      this.particles.push({
        mesh: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 34, 6 + Math.random() * 22, (Math.random() - 0.7) * 34),
        life: 1.2 + Math.random() * 0.6
      });
    }
    this.setHudState(true);
  }

  update(dt, input) {
    if (!this.ownScene) return;

    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    if (this.isGameOver) {
      this.scrollWorld(dt * 8, dt); // world drifts to a halt
      this.placeCamera(dt);
      if (input.wasJustPressed('Enter') || input.wasJustPressed('Space')) this.resetGame();
      return;
    }

    // --- Steering -------------------------------------------------------
    const keys = input.keys;
    const dir = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
    const maxLateral = 20 + (this.speed / MAX_SPEED) * 6;
    this.carVel += (dir * maxLateral - this.carVel) * Math.min(1, dt * 9);
    this.car.position.x = THREE.MathUtils.clamp(this.car.position.x + this.carVel * dt, -CAR_X_LIMIT, CAR_X_LIMIT);
    if (Math.abs(this.car.position.x) >= CAR_X_LIMIT) this.carVel *= 0.3;
    this.car.rotation.z = -this.carVel * 0.012;
    this.car.rotation.y = -this.carVel * 0.02;
    this.carWheels.forEach(w => (w.rotation.x -= this.speed * dt * 0.4));

    // --- Progress ---------------------------------------------------------
    this.speed = Math.min(MAX_SPEED, this.speed + dt * 1.8);
    this.score += this.speed * dt * 0.1;
    this.scrollWorld(this.speed, dt);

    // --- Spawning (by distance, so density stays fair as speed rises) -----
    this.distanceSinceSpawn += this.speed * dt;
    const gap = Math.max(46, 92 - this.speed * 0.3);
    if (this.distanceSinceSpawn >= gap) {
      this.distanceSinceSpawn = 0;
      this.spawnRow();
    }

    // --- Obstacles & collisions ------------------------------------------
    const px = this.car.position.x;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.mesh.position.z += (this.speed - o.v) * dt;

      if (o.mesh.position.z > DESPAWN_Z) {
        this.disposeObject(o.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }

      const dx = Math.abs(o.mesh.position.x - px);
      const dz = Math.abs(o.mesh.position.z);
      if (dx < o.halfW + 0.95 - 0.12 && dz < o.halfL + 2.1 - 0.2) {
        this.crash();
        break;
      }

      // Near-miss bonus when squeezing past traffic
      if (!o.passed && o.mesh.position.z > 3.2) {
        o.passed = true;
        if (dx < o.halfW + 2.6) {
          this.combo++;
          this.nearMisses++;
          const bonus = 25 * Math.min(this.combo, 8);
          this.score += bonus;
          this.showToast(`NEAR MISS +${bonus}`);
        } else {
          this.combo = 0;
        }
      }
    }

    this.placeCamera(dt);
  }

  scrollWorld(speed, dt) {
    const d = speed * dt;
    this.scrollers.forEach(s => (s.tex.offset.y += d / s.period));
    this.scenery.forEach(g => {
      g.position.z += d;
      if (g.position.z > DESPAWN_Z + 10) g.position.z -= SCENERY_SPAN;
    });
  }

  placeCamera(dt) {
    const cam = this.ownCamera;
    const speedT = this.isGameOver ? 0 : (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
    const targetX = this.car.position.x * 0.55;
    cam.position.x += (targetX - cam.position.x) * Math.min(1, dt * 6);
    cam.position.y = 5.2 - speedT * 0.5;
    cam.position.z = 11.5 + speedT * 1.5;
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 1.4;
      cam.position.y += (Math.random() - 0.5) * this.shake * 1.0;
    }
    cam.lookAt(this.car.position.x * 0.7, 1.3, -16);
    const fov = (this.baseFov || 62) + speedT * 12;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
    this.bloom.strength = 0.6 + speedT * 0.3;
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.v.y -= 40 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.position.z += (this.isGameOver ? 0 : this.speed) * dt;
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 6;
      p.life -= dt;
      if (p.life <= 0 || p.mesh.position.y < -2) {
        this.ownScene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // HUD (static markup built once, then patched; styles live in style.css)
  // -------------------------------------------------------------------------
  getHUDHtml() {
    this.hud = null;
    return `
      <div class="nd-hud">
        <div class="nd-panel nd-score">
          <span class="nd-label">SCORE</span>
          <span class="nd-value" data-nd="score">0</span>
          <span class="nd-sub">BEST <b data-nd="best">0</b></span>
        </div>
        <div class="nd-toast" data-nd="toast"></div>
        <div class="nd-speedo">
          <div class="nd-speed-num"><span data-nd="speed">0</span><small>KPH</small></div>
          <div class="nd-speed-bar"><i data-nd="bar"></i></div>
        </div>
        <div class="nd-gameover" data-nd="over">
          <div class="nd-over-card">
            <h1>SYSTEM CRASH</h1>
            <div class="nd-over-score" data-nd="final">0</div>
            <p class="nd-over-best" data-nd="newbest"></p>
            <p class="nd-over-stat" data-nd="stats"></p>
            <button class="nd-restart" data-nd="restart">RACE AGAIN <kbd>ENTER</kbd></button>
          </div>
        </div>
      </div>`;
  }

  bindHud() {
    const root = this.engine.ui.hudContainer;
    if (!root) return false;
    const els = {};
    root.querySelectorAll('[data-nd]').forEach(el => (els[el.dataset.nd] = el));
    if (!els.score) return false;
    els.restart.addEventListener('click', () => this.isGameOver && this.resetGame());
    this.hud = els;
    return true;
  }

  setHudState(over) {
    if (!this.hud && !this.bindHud()) return;
    const h = this.hud;
    h.over.classList.toggle('show', over);
    if (over) {
      h.final.textContent = Math.floor(this.score).toLocaleString();
      h.newbest.textContent = this.isNewBest ? '★ NEW PERSONAL BEST ★' : `BEST ${this.highScore.toLocaleString()}`;
      h.newbest.classList.toggle('record', !!this.isNewBest);
      h.stats.textContent = `${this.nearMisses} near miss${this.nearMisses === 1 ? '' : 'es'}`;
    }
  }

  showToast(text) {
    if (!this.hud) return;
    const t = this.hud.toast;
    t.textContent = text;
    t.classList.remove('pop');
    void t.offsetWidth; // restart the CSS animation
    t.classList.add('pop');
  }

  updateHUD() {
    if (!this.hud && !this.bindHud()) return;
    const h = this.hud;
    const score = Math.floor(this.score);
    if (h.score.textContent !== String(score)) h.score.textContent = score.toLocaleString();
    h.best.textContent = Math.max(this.highScore, score).toLocaleString();
    const kph = Math.round(this.isGameOver ? 0 : this.speed * 1.6);
    h.speed.textContent = kph;
    h.bar.style.width = `${Math.min(100, (this.speed / MAX_SPEED) * 100)}%`;
  }

  getControlsGuide() {
    return [
      { label: 'Steer Left/Right', keys: 'A / D or Arrows' },
      { label: 'Restart (on crash)', keys: 'ENTER / SPACE' },
      { label: 'Return to Lobby', keys: 'ESC or Lobby Button' }
    ];
  }
}
