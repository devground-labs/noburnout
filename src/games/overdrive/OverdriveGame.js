import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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

const TRAFFIC_COLORS = [0xff6b5b, 0x4aa8ff, 0x5ee0a0, 0xff8fb8, 0xffffff, 0xff9f1c, 0xa78bfa];
const CANDY = [0xff6b5b, 0xffd23f, 0x5ee0a0, 0xff8fb8, 0x8ad8ff, 0xa78bfa, 0xff9f1c];

/** Flat, unlit colour for lights, stripes and other solid details. */
function glow(color, _intensity = 1, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
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

export class OverdriveGame extends BaseGame {
  constructor() {
    super({
      id: 'overdrive',
      name: 'Overdrive',
      subtitle: 'Endless Toy-Track Racer',
      description: 'Dodge traffic and barricades on an endless, sunny toy-track highway. Squeeze past cars for near-miss bonuses and see how long you can last at top speed.',
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
    // Falls back to the key used before the rename so existing bests carry over.
    this.highScore = parseInt(localStorage.getItem('overdrive_highscore') || localStorage.getItem('neon_highscore') || '0', 10);

    this.hud = null;
    this._toastTimer = 0;
    this._size = { w: 0, h: 0 };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  async init(engine) {
    await super.init(engine);

    // Bright, true-to-colour rendering for the toy world (the lobby's setting comes back in destroy())
    const r = this.engine.renderer;
    this._prevTone = { mapping: r.toneMapping, exposure: r.toneMappingExposure };
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;

    this.ownScene = new THREE.Scene();
    this.ownScene.background = this.makeSkyTexture();
    this.ownScene.fog = new THREE.Fog(0xcdeeff, 110, 420);

    this.ownCamera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.ownCamera.position.set(0, 5.4, 11);

    this.ownScene.add(new THREE.HemisphereLight(0xffffff, 0x8fd6a0, 1.1));
    const key = new THREE.DirectionalLight(0xfff4dc, 2.2);
    key.position.set(-14, 26, 16);
    this.ownScene.add(key);
    const fill = new THREE.DirectionalLight(0xbfe0ff, 0.6);
    fill.position.set(16, 12, -20);
    this.ownScene.add(fill);

    this.buildSky();
    this.buildRoad();
    this.buildScenery();
    this.car = this.buildCar({ body: 0xffd23f, accent: 0xff6b5b, player: true });
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
    if (this._prevTone && this.engine) {
      this.engine.renderer.toneMapping = this._prevTone.mapping;
      this.engine.renderer.toneMappingExposure = this._prevTone.exposure;
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  setupPostProcessing() {
    const r = this.engine.renderer;
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.ownScene, this.ownCamera));
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
      g.addColorStop(0, '#2b8de8');
      g.addColorStop(0.5, '#6cc4ff');
      g.addColorStop(0.85, '#c9ecff');
      g.addColorStop(1, '#f2fbff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  buildSky() {
    const scene = this.ownScene;

    // A flat yellow sun with a soft halo
    const sunTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      const halo = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w / 2);
      halo.addColorStop(0, 'rgba(255, 240, 150, 0.95)');
      halo.addColorStop(1, 'rgba(255, 240, 150, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.17, 0, Math.PI * 2);
      ctx.fill();
    });
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, toneMapped: false, depthWrite: false })
    );
    sun.position.set(70, 80, -430);
    scene.add(sun);

    // Puffy clouds that drift sideways
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const puff = new THREE.SphereGeometry(1, 20, 14);
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const s = 14 + Math.random() * 14;
      [[0, 0, 1], [1.1, -0.15, 0.8], [-1.1, -0.2, 0.75], [0.4, 0.55, 0.7]].forEach(([x, y, k]) => {
        const m = new THREE.Mesh(puff, cloudMat);
        m.scale.setScalar(s * k);
        m.position.set(x * s, y * s, 0);
        c.add(m);
      });
      c.scale.y = 0.7;
      c.position.set(-440 + i * 110 + Math.random() * 40, 70 + Math.random() * 80, -360 - Math.random() * 60);
      scene.add(c);
      this.clouds.push(c);
    }

    // Rolling hills along the horizon
    const hillColors = [0x6fd08c, 0x58c47a, 0x8be0a4, 0x4fb8a0];
    const hillGeo = new THREE.SphereGeometry(1, 32, 16);
    for (let i = -8; i <= 8; i++) {
      const r = 60 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * 40;
      const hill = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ color: hillColors[Math.abs(i) % hillColors.length] }));
      hill.scale.set(r, r * 0.5, r * 0.8);
      hill.position.set(i * 66, -6, -380 - Math.abs(i % 2) * 22);
      scene.add(hill);
    }
  }

  buildRoad() {
    const scene = this.ownScene;

    // Tarmac with lane dashes and solid white edge lines. One tile = DASH_PERIOD units.
    const roadTex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#323a63';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      const laneW = w / 5;
      ctx.fillStyle = '#ffffff';
      for (let i = 1; i < 5; i++) {
        ctx.fillRect(i * laneW - 4, h * 0.08, 8, h * 0.4);
      }
      ctx.fillRect(4, 0, 9, h);
      ctx.fillRect(w - 13, 0, 9, h);
    });
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, ROAD_LENGTH / DASH_PERIOD);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -ROAD_LENGTH / 2 + 40);
    scene.add(road);
    this.scrollers.push({ tex: roadTex, period: DASH_PERIOD });

    // Striped grass either side of the road
    const grassTex = makeCanvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = '#86dc6e';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#74cf5f';
      ctx.fillRect(0, h / 2, w, h / 2);
    });
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    const gridSize = 700;
    grassTex.repeat.set(1, gridSize / GRID_PERIOD);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshBasicMaterial({ map: grassTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, -gridSize / 2 + 80);
    scene.add(ground);
    this.scrollers.push({ tex: grassTex, period: GRID_PERIOD });

    // Red and white rumble strips + low white barriers
    const RUMBLE = 8;
    const rumbleTex = makeCanvasTexture(32, 64, (ctx, w, h) => {
      ctx.fillStyle = '#ff4d5e';
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, h / 2, w, h / 2);
    });
    rumbleTex.wrapS = rumbleTex.wrapT = THREE.RepeatWrapping;
    rumbleTex.repeat.set(1, ROAD_LENGTH / RUMBLE);
    this.scrollers.push({ tex: rumbleTex, period: RUMBLE });
    const edgeZ = -ROAD_LENGTH / 2 + 40;
    [-1, 1].forEach(side => {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.3, ROAD_LENGTH),
        new THREE.MeshStandardMaterial({ map: rumbleTex, roughness: 0.7 })
      );
      curb.position.set(side * (ROAD_WIDTH / 2 + 0.45), 0.15, edgeZ);
      scene.add(curb);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.9, ROAD_LENGTH),
        new THREE.MeshStandardMaterial({ color: 0xf3f7ff, roughness: 0.5 })
      );
      rail.position.set(side * (ROAD_WIDTH / 2 + 1.5), 0.45, edgeZ);
      scene.add(rail);
    });
  }

  /** Recycled toy trees, candy houses and flag posts that stream past the player. */
  buildScenery() {
    const scene = this.ownScene;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9b6b43, roughness: 0.8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const leafColors = [0x4ecb71, 0x7ddc6a, 0xffd23f, 0xff8fb8];
    const count = 12;
    const step = SCENERY_SPAN / count;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 10);
    const leafGeo = new THREE.SphereGeometry(1, 20, 14);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 8, 8);
    const flagGeo = new THREE.BoxGeometry(2, 1.1, 0.08);

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < count; i++) {
        const g = new THREE.Group();
        const color = CANDY[(i + (side > 0 ? 3 : 0)) % CANDY.length];

        if (i % 3 === 1) {
          // A candy house: a rounded block with a pointy roof and a door
          const w = 7 + Math.random() * 5;
          const h = 8 + Math.random() * 8;
          const x = side * (28 + w / 2 + Math.random() * 18);
          const wall = new THREE.Mesh(new RoundedBoxGeometry(w, h, w, 3, 0.7), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
          wall.position.set(x, h / 2, 0);
          g.add(wall);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, w * 0.7, 4), new THREE.MeshStandardMaterial({ color: 0xff6b5b, roughness: 0.5 }));
          roof.position.set(x, h + w * 0.3, 0);
          roof.rotation.y = Math.PI / 4;
          g.add(roof);
          const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, h * 0.35, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
          door.position.set(x - side * 0, h * 0.18, w / 2 + 0.05);
          g.add(door);
        } else {
          // A lollipop tree
          const k = 0.8 + Math.random() * 0.8;
          const x = side * (26 + Math.random() * 30);
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.scale.set(k, k, k);
          trunk.position.set(x, 2 * k, 0);
          g.add(trunk);
          const leaves = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: leafColors[(i + (side > 0 ? 1 : 0)) % leafColors.length], roughness: 0.55 }));
          leaves.scale.setScalar(3.6 * k);
          leaves.position.set(x, 4 * k + 3.2 * k, 0);
          g.add(leaves);
        }

        // A flag post beside the road
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(side * (ROAD_WIDTH / 2 + 2.6), 4, 0);
        g.add(pole);
        const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
        flag.position.set(side * (ROAD_WIDTH / 2 + 2.6) - side * 1.0, 7.3, 0);
        g.add(flag);

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
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: body, metalness: 0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x24305e, metalness: 0.1, roughness: 0.2 });

    // Side-profile hull (shape X = length, nose at +X), extruded across the width, with soft bevelled edges.
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
    const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.9, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3 });
    hullGeo.translate(0, 0, -0.95);
    hullGeo.rotateY(Math.PI / 2); // nose (+X) -> -Z
    const hull = new THREE.Mesh(hullGeo, bodyMat);
    hull.position.y = 0.1;
    car.add(hull);

    // Window band, slightly proud of the hull sides
    const glass = new THREE.Mesh(new RoundedBoxGeometry(2.14, 0.3, 1.6, 2, 0.08), glassMat);
    glass.position.set(0, 1.2, 0.3);
    car.add(glass);

    // Racing stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 3.9), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
    stripe.position.set(0, 0.62, 0);
    car.add(stripe);

    // Chunky wheels with white hubs
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.44, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.47, 14);
    rimGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    [[-1.1, -1.45], [1.1, -1.45], [-1.1, 1.45], [1.1, 1.45]].forEach(([x, z]) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wheelGeo, tireMat), new THREE.Mesh(rimGeo, rimMat));
      w.position.set(x, 0.5, z);
      car.add(w);
      this.carWheels.push(w);
    });

    // Tail light bar and headlamps
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.08), glow(0xff4d5e));
    tail.position.set(0, 0.92, 2.42);
    car.add(tail);
    [-0.75, 0.75].forEach(x => {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.08), glow(0xfff3b0));
      head.position.set(x, 0.72, -2.42);
      car.add(head);
    });

    // Soft blob shadow on the road
    const shadowTex = makeCanvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(10, 14, 40, 0.5)');
      g.addColorStop(1, 'rgba(10, 14, 40, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 7.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    car.add(shadow);

    if (player) {
      // Spoiler
      [-0.8, 0.8].forEach(x => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.12), glassMat);
        post.position.set(x, 1.15, 2.0);
        car.add(post);
      });
      const wing = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.1, 0.6, 2, 0.04), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }));
      wing.position.set(0, 1.38, 2.05);
      car.add(wing);
      // Hood stripe
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 1.7), glow(0xffffff));
      hood.position.set(0, 1.0, -1.35);
      hood.rotation.x = 0.1;
      car.add(hood);
    }
    return car;
  }

  buildBarricade() {
    const g = new THREE.Group();
    const stripeTex = makeCanvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = '#ff9f1c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (let x = -h; x < w + h; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 32, h);
        ctx.lineTo(x + 32 + h, 0);
        ctx.lineTo(x + h, 0);
        ctx.fill();
      }
    });
    const face = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 });
    const block = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.9, 0.9, 3, 0.2), face);
    block.position.y = 0.7;
    g.add(block);
    [-1.6, 1.6].forEach(x => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b2150 }));
      leg.position.set(x, 0.25, 0);
      g.add(leg);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), glow(0xff4d5e));
      beacon.position.set(x, 1.38, 0);
      g.add(beacon);
    });
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
            accent: 0x1b2150,
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
      localStorage.setItem('overdrive_highscore', String(finalScore));
    }

    const colors = [0xffd23f, 0xff6b5b, 0xffffff, 0x5ee0a0, 0x4aa8ff];
    const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(geo, glow(colors[i % colors.length]));
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
    const dir =
      (keys['ArrowRight'] || keys['KeyD'] || this._touchRight ? 1 : 0) -
      (keys['ArrowLeft'] || keys['KeyA'] || this._touchLeft ? 1 : 0);
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
    this.clouds?.forEach(c => {
      c.position.x += dt * 3;
      if (c.position.x > 480) c.position.x = -480;
    });
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
        <div class="nd-touch">
          <button class="nd-steer" data-nd="left" aria-label="Steer left">◀</button>
          <button class="nd-steer" data-nd="right" aria-label="Steer right">▶</button>
        </div>
        <div class="nd-gameover" data-nd="over">
          <div class="nd-over-card">
            <h1>CRASH!</h1>
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
    const bindSteer = (el, prop) => {
      const set = v => (e) => { e.preventDefault(); this[prop] = v; };
      el.addEventListener('pointerdown', set(true));
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, set(false)));
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bindSteer(els.left, '_touchLeft');
    bindSteer(els.right, '_touchRight');
    this.hud = els;
    return true;
  }

  setHudState(over) {
    if (!this.hud && !this.bindHud()) return;
    const h = this.hud;
    h.over.classList.toggle('show', over);
    if (over) {
      h.final.textContent = Math.floor(this.score).toLocaleString();
      h.newbest.textContent = this.isNewBest ? '★ NEW BEST ★' : `BEST ${this.highScore.toLocaleString()}`;
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
