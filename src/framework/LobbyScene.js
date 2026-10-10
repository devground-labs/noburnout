import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * LobbyScene - the 3D backdrop of the landing page.
 *
 * A toy box of glossy plastic pieces (blocks, balls, rings, dice, gold coins) floating in the
 * NoBurnout brand-blue world. They drift on their own, lean away from the cursor, spin up when
 * you scroll, and rearrange themselves into a new composition for every section of the page.
 * The last section snaps the blocks into a tidy pattern grid, a nod to the puzzle games.
 *
 * It renders through the engine's shared renderer/scene/camera and puts back everything it
 * touched (tone mapping, background, fog, camera) in dispose(), so the games are unaffected.
 */

const SECTION_IDS = ['lp-top', 'lp-games', 'lp-features', 'lp-contribute'];
const CAM_Z = 12;

// Flat, saturated toy colours (no glow). The world behind them blends between the two brand blues.
const TOYS = [0xffd23f, 0xff6b5b, 0xffffff, 0x5ee0a0, 0xff9f1c, 0x1b2150, 0xff8fb8, 0xcdeeff];
const WORLD = [0x38bdf8, 0x6366f1, 0x2fa8e6, 0x5558e8]; // sky blue -> indigo -> sky -> indigo
const SUN = [0xffd23f, 0xff8fb8, 0xffe066, 0xffb454]; // the big disc behind, per section

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Small seeded RNG so the layout is identical on every visit and every resize.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class LobbyScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.renderer = engine.renderer;
    this.landing = document.getElementById('landing-page');
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.small = window.matchMedia('(max-width: 760px)').matches;

    // Remember what we change so the games get it back untouched.
    this.saved = {
      toneMapping: this.renderer.toneMapping,
      exposure: this.renderer.toneMappingExposure,
      background: this.scene.background,
      fog: this.scene.fog,
      camPos: this.camera.position.clone(),
      camQuat: this.camera.quaternion.clone()
    };

    this.group = new THREE.Group();
    this.objects = [];
    this.geoms = [];
    this.mats = [];
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false };
    this.p = 0; // eased section progress, 0..3
    this.pTarget = 0;
    this.scrollVel = 0;
    this.time = 0;
    this.aspect = 0;
    this.sectionTops = [];

    this.setupStage();
    this.build();

    this._onPointer = e => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      this.pointer.active = e.pointerType !== 'touch';
    };
    this._onLeave = () => (this.pointer.active = false);
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    document.addEventListener('pointerleave', this._onLeave);
  }

  // -------------------------------------------------------------------------
  // Stage: lights, environment, backdrop
  // -------------------------------------------------------------------------
  setupStage() {
    const { renderer, scene, camera } = this;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    this.worldColors = WORLD.map(c => new THREE.Color(c));
    scene.background = this.worldColors[0].clone();
    scene.fog = new THREE.Fog(this.worldColors[0].clone(), 18, 44);

    // Soft studio light for the glazed look.
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    this.savedEnv = { env: scene.environment, intensity: scene.environmentIntensity };
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = 0.75;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, 7);
    const fill = new THREE.DirectionalLight(0xa5b4ff, 0.7);
    fill.position.set(-7, 2, 4);
    this.lights = [new THREE.HemisphereLight(0xffffff, 0x9fb4ff, 0.6), key, fill];
    this.lights.forEach(l => scene.add(l));

    // A big flat sun disc far behind everything; it changes mood per section.
    const sunGeo = new THREE.CircleGeometry(1, 96);
    const sunMat = new THREE.MeshBasicMaterial({ color: SUN[0], fog: false, toneMapped: false });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.z = -22;
    this.geoms.push(sunGeo);
    this.mats.push(sunMat);
    this.scene.add(this.sun);
    this.sunColors = SUN.map(c => new THREE.Color(c));

    scene.add(this.group);
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Toys
  // -------------------------------------------------------------------------
  build() {
    const rand = rng(7);
    const counts = this.small
      ? { cube: 7, ball: 3, ring: 2, coin: 2, die: 1 }
      : { cube: 10, ball: 4, ring: 3, coin: 4, die: 2 };
    const box = new RoundedBoxGeometry(1, 1, 1, 4, 0.16);
    const ball = new THREE.SphereGeometry(0.62, 40, 28);
    const ring = new THREE.TorusGeometry(0.62, 0.24, 24, 56);
    const coin = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 48).rotateX(Math.PI / 2);
    const pip = new THREE.SphereGeometry(0.085, 14, 10);
    this.geoms.push(box, ball, ring, coin, pip);
    const geoFor = { cube: box, ball, ring, coin };

    // Glossy toy plastic, and metallic gold for the coins
    const plastic = color => {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.22 });
      this.mats.push(m);
      return m;
    };
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc83d, roughness: 0.28, metalness: 0.75, clearcoat: 0.4 });
    const pipMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, roughness: 0.5 });
    this.mats.push(gold, pipMat);

    // d6 pip layouts for the +z, -z, +x, -x, +y, -y faces (1, 6, 3, 4, 2, 5)
    const spots = {
      1: [[0, 0]],
      2: [[-0.22, -0.22], [0.22, 0.22]],
      3: [[-0.24, -0.24], [0, 0], [0.24, 0.24]],
      4: [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]],
      5: [[-0.24, -0.24], [0.24, -0.24], [0, 0], [-0.24, 0.24], [0.24, 0.24]],
      6: [[-0.22, -0.26], [0.22, -0.26], [-0.22, 0], [0.22, 0], [-0.22, 0.26], [0.22, 0.26]]
    };
    const faces = [
      [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 1],
      [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 6],
      [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 3],
      [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), 4],
      [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 2],
      [new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 5]
    ];
    const makeDie = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box, plastic(0xffffff)));
      for (const [n, u, v, count] of faces) {
        for (const [a, b] of spots[count]) {
          const p = new THREE.Mesh(pip, pipMat);
          p.position.copy(n).multiplyScalar(0.5).addScaledVector(u, a).addScaledVector(v, b);
          g.add(p);
        }
      }
      return g;
    };

    let ci = 0;
    for (const [kind, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) {
        let mesh;
        if (kind === 'die') mesh = makeDie();
        else mesh = new THREE.Mesh(geoFor[kind], kind === 'coin' ? gold : plastic(TOYS[ci++ % TOYS.length]));
        this.group.add(mesh);
        this.objects.push({
          kind,
          mesh,
          size: kind === 'cube' ? 0.8 + rand() * 0.7 : kind === 'die' ? 1.2 + rand() * 0.3 : kind === 'ball' ? 0.8 + rand() * 0.6 : 0.9 + rand() * 0.4,
          spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(kind === 'coin' ? 1.6 : 0.7),
          angle: new THREE.Vector3(rand() * 6, rand() * 6, rand() * 6),
          phase: rand() * Math.PI * 2,
          push: new THREE.Vector3(),
          poses: []
        });
      }
    }
    this.layoutPoses();
  }

  // One pose (position, rotation, scale) per page section for every toy. Recomputed when the
  // window's aspect ratio changes, since "the right side of the screen" moves with it.
  layoutPoses() {
    const { camera } = this;
    const aspect = camera.aspect || 1.6;
    this.aspect = aspect;
    const H = CAM_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); // half-height at z=0
    const W = H * aspect;
    const portrait = aspect < 0.95;
    const rand = rng(21);
    const n = this.objects.length;
    const cubes = this.objects.filter(o => o.kind === 'cube');
    const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    const pose = (x, y, z, q, s) => ({ pos: new THREE.Vector3(x, y, z), quat: q, scale: s });

    this.objects.forEach((o, i) => {
      const r = () => rand() * 2 - 1;
      const q = () => euler(rand() * 6, rand() * 6, rand() * 6);
      const s = o.size;

      // 0 Hero: a cluster on the right, or above and below the headline on portrait screens
      let p0;
      if (portrait) {
        const top = i % 2 === 0;
        // peek in from the top and bottom edges, clear of the headline
        p0 = pose(r() * W * 0.9, (top ? 1 : -1) * (0.95 + rand() * 0.5) * H, -1 - rand() * 3, q(), s * 0.85);
      } else {
        // keep clear of the headline column: start further right on narrower windows
        const from = aspect < 1.5 ? 0.5 : 0.3;
        p0 = pose(W * (from + rand() * (0.96 - from)), r() * H * 0.82, -3 + rand() * 6, q(), s * (aspect < 1.5 ? 0.8 : 0.9 + rand() * 0.5));
      }

      // 1 Games: pushed out to the margins, behind the cards
      const side = i % 2 === 0 ? -1 : 1;
      const p1 = pose(
        side * W * (0.86 + rand() * 0.3),
        r() * H * 0.95,
        (portrait ? -11 : -7) - rand() * 5,
        q(),
        s * 0.85
      );

      // 2 Features: a slow ring around the middle
      const th = (i / n) * Math.PI * 2;
      const R = Math.min(W * 0.8, H * 1.7);
      const p2 = pose(Math.cos(th) * R, Math.sin(th) * R * 0.5 + H * 0.05, -11 + Math.sin(th) * 3, q(), s * 1.05);

      // 3 Contribute: cubes lock into a pattern wall, the rest settle at the edges
      let p3;
      const ci = cubes.indexOf(o);
      if (ci >= 0) {
        const cols = 4;
        const sp = 1.45;
        const gx = (ci % cols) - (cols - 1) / 2;
        const gy = (Math.floor(ci / cols) - 1) * -1;
        p3 = pose(gx * sp, gy * sp + H * (portrait ? 0.62 : 0.5), -6.5, euler(0, 0, 0), 1.1);
      } else {
        p3 = pose(side * W * (0.7 + rand() * 0.25), r() * H * 0.8, -5 - rand() * 3, q(), s * 0.9);
      }
      o.poses = [p0, p1, p2, p3];
    });

    // Sun disc per section
    this.sunPoses = [
      { x: W * 0.4, y: H * 0.05, s: Math.max(H, W * 0.5) * 1.6 },
      { x: -W * 0.5, y: -H * 0.2, s: H * 1.5 },
      { x: 0, y: H * 0.05, s: H * 2.1 },
      { x: W * 0.45, y: H * 0.25, s: H * 1.6 }
    ];
  }

  // -------------------------------------------------------------------------
  // Scroll
  // -------------------------------------------------------------------------
  // Where the page is, as a fraction through its four sections (0 = hero ... 3 = contribute).
  readProgress() {
    const land = this.landing;
    if (!land) return 0;
    const sy = land.scrollTop + land.clientHeight * 0.4;
    const tops = SECTION_IDS.map(id => document.getElementById(id)?.offsetTop ?? 0);
    let i = 0;
    while (i < tops.length - 1 && sy >= tops[i + 1]) i++;
    if (i >= tops.length - 1) return tops.length - 1;
    return i + Math.min(1, Math.max(0, (sy - tops[i]) / Math.max(1, tops[i + 1] - tops[i])));
  }

  // -------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------
  update(dt) {
    if (this.camera.aspect !== this.aspect) this.layoutPoses();
    this.time += dt;
    const reduced = this.reduced;

    // Ease toward the scroll position (snap when the user prefers reduced motion).
    const target = this.readProgress();
    const prev = this.p;
    this.p = reduced ? target : lerp(this.p, target, 1 - Math.exp(-dt * 4.5));
    this.scrollVel = lerp(this.scrollVel, Math.abs(this.p - prev) / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 6));
    const i = Math.min(2, Math.floor(this.p));
    const f = smooth(Math.min(1, this.p - i));
    const settle = Math.min(1, Math.max(0, this.p - 2)); // 1 = locked into the pattern grid
    const boost = reduced ? 0 : Math.min(this.scrollVel * 1.4, 5);

    // Cursor parallax on the whole group
    const ptr = this.pointer;
    ptr.sx = lerp(ptr.sx, reduced ? 0 : ptr.x, 1 - Math.exp(-dt * 3));
    ptr.sy = lerp(ptr.sy, reduced ? 0 : ptr.y, 1 - Math.exp(-dt * 3));
    this.group.rotation.y = ptr.sx * 0.1;
    this.group.rotation.x = -ptr.sy * 0.06;
    this.camera.position.x = ptr.sx * 0.5;
    this.camera.position.y = ptr.sy * 0.3;
    this.camera.lookAt(0, 0, 0);

    const tmpQ = new THREE.Quaternion();
    const tmpE = new THREE.Euler();
    const proj = new THREE.Vector3();

    for (const o of this.objects) {
      const a = o.poses[i];
      const b = o.poses[i + 1];
      const m = o.mesh;

      m.position.lerpVectors(a.pos, b.pos, f);
      const bob = reduced ? 0 : Math.sin(this.time * 0.9 + o.phase) * 0.18 * (1 - settle);
      m.position.y += bob;
      m.scale.setScalar(lerp(a.scale, b.scale, f));

      // Keep clear of the cursor: lean away from it.
      if (!reduced && ptr.active) {
        proj.copy(m.position).applyMatrix4(this.group.matrixWorld).project(this.camera);
        const dx = proj.x - ptr.x;
        const dy = proj.y - ptr.y;
        const d = Math.hypot(dx, dy);
        const reach = 0.3;
        const k = d < reach ? (1 - d / reach) ** 2 : 0;
        o.push.x = lerp(o.push.x, (dx / (d || 1)) * k * 1.3, 1 - Math.exp(-dt * 8));
        o.push.y = lerp(o.push.y, (dy / (d || 1)) * k * 1.3, 1 - Math.exp(-dt * 8));
      } else {
        o.push.multiplyScalar(Math.exp(-dt * 8));
      }
      m.position.x += o.push.x;
      m.position.y += o.push.y;

      // Orientation: blend between the section poses, then add the idle spin (fades out on the grid).
      m.quaternion.slerpQuaternions(a.quat, b.quat, f);
      if (!reduced) {
        o.angle.addScaledVector(o.spin, dt * (1 + boost));
        const w = 1 - settle;
        tmpE.set(o.angle.x * w, o.angle.y * w, o.angle.z * w);
        tmpQ.setFromEuler(tmpE);
        m.quaternion.multiply(tmpQ);
      }
    }

    // Sun disc: slide and recolour for the current section.
    const sa = this.sunPoses[i];
    const sb = this.sunPoses[i + 1];
    this.sun.position.x = lerp(sa.x, sb.x, f);
    this.sun.position.y = lerp(sa.y, sb.y, f);
    this.sun.scale.setScalar(lerp(sa.s, sb.s, f));
    this.sun.material.color.copy(this.sunColors[i]).lerp(this.sunColors[i + 1], f);
    this.scene.background.copy(this.worldColors[i]).lerp(this.worldColors[i + 1], f);
    this.scene.fog.color.copy(this.scene.background);
  }

  // -------------------------------------------------------------------------
  // Cleanup: put back everything the games expect
  // -------------------------------------------------------------------------
  dispose() {
    window.removeEventListener('pointermove', this._onPointer);
    document.removeEventListener('pointerleave', this._onLeave);

    const { scene, renderer, camera } = this;
    this.lights.forEach(l => scene.remove(l));
    scene.remove(this.group);
    scene.remove(this.sun);
    this.geoms.forEach(g => g.dispose());
    this.mats.forEach(m => m.dispose());
    this.envTarget?.dispose();

    scene.environment = this.savedEnv.env;
    scene.environmentIntensity = this.savedEnv.intensity ?? 1;
    renderer.toneMapping = this.saved.toneMapping;
    renderer.toneMappingExposure = this.saved.exposure;
    scene.background = this.saved.background;
    scene.fog = this.saved.fog;
    camera.position.copy(this.saved.camPos);
    camera.quaternion.copy(this.saved.camQuat);
  }
}
