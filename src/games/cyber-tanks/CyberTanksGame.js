import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { buildTankMesh } from './TankModel.js';

export class CyberTanksGame extends BaseGame {
  constructor() {
    super({
      id: 'cyber-tanks',
      name: 'Cyber Tanks 3D',
      subtitle: '3D Missile Combat Duel',
      description: 'Fast-paced 3D tank arena duel. Maneuver armored tanks, destroy obstacles, and fire explosive rockets in local 2-player, solo vs AI battle, or practice target range.',
      icon: '🚀',
      badge: 'Championship 3-Rounds',
      genre: '3D Vehicular Duel',
      players: '1 - 2 Players',
      modes: ['1P (vs AI)', '2P Duel', 'Practice']
    });

    // Audio Synth (Web Audio API matching tanks.html exactly)
    this.audioCtx = null;
    this.soundEnabled = true;

    // Entities & VFX
    this.p1 = null;
    this.p2 = null;
    this.activeMissiles = [];
    this.particles = [];
    this.obstacles = [];
    this.practiceTargets = [];

    // Decals
    this.treadMarksGroup = null;
    this.craterGroup = null;

    // Environment & Arena
    this.ARENA_SIZE = 58;
    this.halfArena = 29;
    this.obstacleGroup = null;
    this.practiceGroup = null;
    this.particleGroup = null;
    this.animatedForcefieldMat = null;

    // Series Tournament Scoring (Strictly 3 rounds in Battle modes)
    this.gameMode = '2P'; // '2P', '1P', or 'PRACTICE'
    this.currentRound = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.matchOver = false;

    // AI state
    this.aiFireTimer = 0.8;

    // Practice Telemetry
    this.pracHits = 0;
    this.pracShots = 0;
    this.pracStreak = 0;

    // Camera Mode (0: Tactical Isometric, 1: High Top-Down, 2: Action Chase)
    this.cameraMode = 0;

    // Keyboard state
    this.keys = {};
    this._keyDownHandler = null;
    this._keyUpHandler = null;

    // Toast timer
    this._toastTimer = null;
  }

  // =========================================================================
  // Sound FX Synth (Web Audio API)
  // =========================================================================
  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSfxFire() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    // Heavy punch
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.22);

    // Rocket whoosh noise
    const bSize = this.audioCtx.sampleRate * 0.25;
    const buf = this.audioCtx.createBuffer(1, bSize, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bSize * 0.4));
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buf;
    const nFilter = this.audioCtx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(800, now);
    nFilter.frequency.exponentialRampToValueAtTime(300, now + 0.25);
    const nGain = this.audioCtx.createGain();
    nGain.gain.setValueAtTime(0.35, now);
    nGain.gain.linearRampToValueAtTime(0.01, now + 0.25);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.audioCtx.destination);
    noise.start(now);
  }

  playSfxExplode() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    // Low rumble boom
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.55);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Deep noise blast
    const bSize = this.audioCtx.sampleRate * 0.55;
    const buf = this.audioCtx.createBuffer(1, bSize, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buf;
    const nFilter = this.audioCtx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.setValueAtTime(700, now);
    nFilter.frequency.exponentialRampToValueAtTime(60, now + 0.5);
    const nGain = this.audioCtx.createGain();
    nGain.gain.setValueAtTime(0.65, now);
    nGain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.audioCtx.destination);
    noise.start(now);
  }

  playSfxHit() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playSfxWin() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((f, i) => {
      const now = this.audioCtx.currentTime + i * 0.12;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  // =========================================================================
  // Initialization & Arena Construction
  // =========================================================================
  async init(engine) {
    await super.init(engine);

    this.scene.background = new THREE.Color(0x0a1128);
    this.scene.fog = new THREE.FogExp2(0x0a1128, 0.0035);

    // Setup Lighting - Enhanced Arena Visibility
    const ambientLight = new THREE.AmbientLight(0x64748b, 1.4);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 1.0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(28, 48, 22);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;
    const shadowD = 35;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    this.scene.add(sunLight);

    // Secondary fill directional light to prevent harsh unlit shadows
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    fillLight.position.set(-25, 32, -22);
    this.scene.add(fillLight);

    // Accent Cyber Rim Lights covering 4 arena sectors
    const rimP1 = new THREE.PointLight(0x06b6d4, 2.5, 50);
    rimP1.position.set(-22, 12, -22);
    this.scene.add(rimP1);

    const rimP2 = new THREE.PointLight(0xf97316, 2.5, 50);
    rimP2.position.set(22, 12, 22);
    this.scene.add(rimP2);

    const rimP3 = new THREE.PointLight(0x38bdf8, 2.2, 50);
    rimP3.position.set(-22, 12, 22);
    this.scene.add(rimP3);

    const rimP4 = new THREE.PointLight(0xa855f7, 2.2, 50);
    rimP4.position.set(22, 12, -22);
    this.scene.add(rimP4);

    // Create Groups
    this.treadMarksGroup = new THREE.Group();
    this.scene.add(this.treadMarksGroup);

    this.craterGroup = new THREE.Group();
    this.scene.add(this.craterGroup);

    this.obstacleGroup = new THREE.Group();
    this.scene.add(this.obstacleGroup);

    this.practiceGroup = new THREE.Group();
    this.scene.add(this.practiceGroup);

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    // Build Arena Environment
    this.buildFloor();
    this.buildPerimeterArena();
    this.buildCyberCitySkyline();

    // Create Tanks
    this.p1 = this.createTankController(1, 0x0284c7, 0x06b6d4, { x: -16, z: 0 }, Math.PI / 2);
    this.p2 = this.createTankController(2, 0xea580c, 0xf97316, { x: 16, z: 0 }, -Math.PI / 2);

    // Camera initial position
    this.camera.position.set(0, 32, 28);
    this.camera.lookAt(0, 1.2, 0);

    // Setup Keyboard Listeners
    this.setupKeyboardListeners();
  }

  // =========================================================================
  // Procedural Floor, Decals & Skyline
  // =========================================================================
  buildFloor() {
    const drawHex = (ctx, x, y, r) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    };

    const drawHazardStripe = (ctx, x, y, w, h) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f59e0b';
      const stripeW = 20;
      for (let i = -1024; i < 2048; i += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(i, y);
        ctx.lineTo(i + stripeW, y);
        ctx.lineTo(i + stripeW + h, y + h);
        ctx.lineTo(i + h, y + h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');

    // 1. High-tensile carbon composite arena base with subtle center combat radial gradient
    ctx.fillStyle = '#141d33';
    ctx.fillRect(0, 0, 1024, 1024);

    const centerGlow = ctx.createRadialGradient(512, 512, 40, 512, 512, 580);
    centerGlow.addColorStop(0, 'rgba(30, 58, 95, 0.45)');
    centerGlow.addColorStop(0.6, 'rgba(15, 23, 42, 0.2)');
    centerGlow.addColorStop(1, 'rgba(10, 17, 32, 0)');
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, 1024, 1024);

    // 2. Hexagonal reinforced armor plate tiling
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.65)';
    ctx.lineWidth = 1.8;
    const hexR = 26;
    const hexH = hexR * Math.sqrt(3);
    for (let y = 0; y < 1024 + hexH; y += hexH) {
      for (let x = 0; x < 1024 + hexR * 3; x += hexR * 3) {
        drawHex(ctx, x, y, hexR);
        drawHex(ctx, x + hexR * 1.5, y + hexH / 2, hexR);
      }
    }

    // 3. Tactical boundary grid frames
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, 912, 912);
    ctx.strokeRect(180, 180, 664, 664);

    // 4. Center Combat Radar Rings & Crosshair
    ctx.beginPath();
    ctx.arc(512, 512, 170, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(512, 512, 85, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Crosshair dashes
    ctx.beginPath();
    ctx.moveTo(512, 280); ctx.lineTo(512, 744);
    ctx.moveTo(280, 512); ctx.lineTo(744, 512);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center Arena Insignia
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.font = '900 24px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ CYBER ARENA ⚡', 512, 512);

    // 5. Player 1 Deployment Pad
    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.beginPath();
    ctx.arc(228, 512, 88, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = '800 16px "Orbitron", sans-serif';
    ctx.fillText('P1 DEPLOYMENT', 228, 512);

    // 6. Player 2 Deployment Pad
    ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
    ctx.beginPath();
    ctx.arc(796, 512, 88, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#f97316';
    ctx.font = '800 16px "Orbitron", sans-serif';
    ctx.fillText('P2 DEPLOYMENT', 796, 512);

    // 7. Perimeter Hazard Stripes
    drawHazardStripe(ctx, 0, 0, 1024, 30);
    drawHazardStripe(ctx, 0, 994, 1024, 30);
    drawHazardStripe(ctx, 0, 0, 30, 1024);
    drawHazardStripe(ctx, 994, 0, 30, 1024);

    const floorTex = new THREE.CanvasTexture(c);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.35,
      metalness: 0.45
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.ARENA_SIZE, this.ARENA_SIZE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  addTreadMark(x, z, angle) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x070b14, transparent: true, opacity: 0.45, depthWrite: false })
    );
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = angle;
    mark.position.set(x, 0.015, z);
    this.treadMarksGroup.add(mark);

    if (this.treadMarksGroup.children.length > 120) {
      this.treadMarksGroup.remove(this.treadMarksGroup.children[0]);
    }
  }

  spawnScorchCrater(pos) {
    const radius = 1.6 + Math.random() * 0.9;
    const crater = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 16),
      new THREE.MeshBasicMaterial({ color: 0x050811, transparent: true, opacity: 0.85, depthWrite: false })
    );
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(pos.x, 0.02, pos.z);
    this.craterGroup.add(crater);

    if (this.craterGroup.children.length > 40) {
      this.craterGroup.remove(this.craterGroup.children[0]);
    }
  }

  buildPerimeterArena() {
    const arenaGroup = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.25 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const hazardNeonMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    // Energy Forcefield grid texture
    const shieldCanvas = document.createElement('canvas');
    shieldCanvas.width = 256; shieldCanvas.height = 256;
    const sCtx = shieldCanvas.getContext('2d');
    sCtx.fillStyle = '#0284c7';
    sCtx.fillRect(0, 0, 256, 256);
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = 3;
    for (let y = 0; y < 256; y += 32) {
      sCtx.beginPath(); sCtx.moveTo(0, y); sCtx.lineTo(256, y); sCtx.stroke();
    }
    for (let x = 0; x < 256; x += 32) {
      sCtx.beginPath(); sCtx.moveTo(x, 0); sCtx.lineTo(x, 256); sCtx.stroke();
    }
    const shieldTex = new THREE.CanvasTexture(shieldCanvas);
    shieldTex.wrapS = THREE.RepeatWrapping;
    shieldTex.wrapT = THREE.RepeatWrapping;
    shieldTex.repeat.set(16, 2);

    this.animatedForcefieldMat = new THREE.MeshBasicMaterial({
      map: shieldTex,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });

    const wallH = 2.2;
    const wallT = 1.6;
    const shieldH = 5.5;

    const walls = [
      { x: 0, z: -this.halfArena, w: this.ARENA_SIZE + wallT, d: wallT, rot: 0 },
      { x: 0, z: this.halfArena, w: this.ARENA_SIZE + wallT, d: wallT, rot: 0 },
      { x: -this.halfArena, z: 0, w: wallT, d: this.ARENA_SIZE + wallT, rot: Math.PI / 2 },
      { x: this.halfArena, z: 0, w: wallT, d: this.ARENA_SIZE + wallT, rot: Math.PI / 2 }
    ];

    walls.forEach(b => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(b.w, wallH, b.d), wallMat);
      base.position.set(b.x, wallH / 2, b.z);
      base.castShadow = true;
      base.receiveShadow = true;
      arenaGroup.add(base);

      // Angled Buttresses along wall
      const count = 7;
      const span = b.w > b.d ? b.w : b.d;
      for (let i = 0; i < count; i++) {
        const offset = -span / 2 + (span / (count - 1)) * i;
        const buttress = new THREE.Mesh(
          new THREE.BoxGeometry(b.w > b.d ? 1.0 : wallT * 1.5, wallH * 1.15, b.w > b.d ? wallT * 1.5 : 1.0),
          capMat
        );
        if (b.w > b.d) buttress.position.set(offset, (wallH * 1.15) / 2, b.z);
        else buttress.position.set(b.x, (wallH * 1.15) / 2, offset);
        buttress.castShadow = true;
        arenaGroup.add(buttress);
      }

      // Top Neon Glow Rail
      const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.15, b.d * 0.7), neonMat);
      rim.position.set(b.x, wallH + 0.08, b.z);
      arenaGroup.add(rim);

      // Holographic Forcefield Plane
      const fieldGeo = new THREE.PlaneGeometry(b.w > b.d ? b.w : b.d, shieldH);
      const field = new THREE.Mesh(fieldGeo, this.animatedForcefieldMat);
      field.position.set(b.x, wallH + shieldH / 2, b.z);
      if (b.rot !== 0) field.rotation.y = b.rot;
      arenaGroup.add(field);
    });

    // 4 Corner Stadium Floodlight Watchtowers
    const createCornerWatchtower = (x, z, angleY) => {
      const tower = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 5.0, 8), capMat);
      base.position.y = 2.5;
      base.castShadow = true;
      tower.add(base);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 14, 8), wallMat);
      mast.position.y = 12;
      mast.castShadow = true;
      tower.add(mast);

      const head = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 2.2), capMat);
      head.position.set(0, 19, 0);
      head.rotation.x = 0.45;
      tower.add(head);

      const lens = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lens.position.set(0, 19, 1.15);
      lens.rotation.x = 0.45;
      tower.add(lens);

      const spot = new THREE.SpotLight(0xf1f5f9, 3.8, 95, Math.PI / 3, 0.45, 1.0);
      spot.position.set(0, 19, 1.2);
      spot.target.position.set(0, 0, 20);
      tower.add(spot);
      tower.add(spot.target);

      const floodGlow = new THREE.PointLight(0xe2e8f0, 2.2, 35);
      floodGlow.position.set(0, 19, 1.5);
      tower.add(floodGlow);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), hazardNeonMat);
      beacon.position.y = 20.6;
      tower.add(beacon);

      tower.position.set(x, 0, z);
      tower.rotation.y = angleY;
      return tower;
    };

    arenaGroup.add(createCornerWatchtower(-this.halfArena - 1, -this.halfArena - 1, Math.PI / 4));
    arenaGroup.add(createCornerWatchtower(this.halfArena + 1, -this.halfArena - 1, -Math.PI / 4));
    arenaGroup.add(createCornerWatchtower(-this.halfArena - 1, this.halfArena + 1, (3 * Math.PI) / 4));
    arenaGroup.add(createCornerWatchtower(this.halfArena + 1, this.halfArena + 1, -(3 * Math.PI) / 4));

    this.scene.add(arenaGroup);
  }

  buildCyberCitySkyline() {
    const cityGroup = new THREE.Group();
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.35 });

    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 512);

    for (let y = 8; y < 512; y += 18) {
      for (let x = 8; x < 256; x += 14) {
        if (Math.random() < 0.38) {
          ctx.fillStyle = Math.random() < 0.6 ? '#38bdf8' : (Math.random() < 0.5 ? '#f59e0b' : '#a855f7');
          ctx.fillRect(x, y, 9, 11);
        }
      }
    }
    const winTex = new THREE.CanvasTexture(c);
    winTex.wrapS = THREE.RepeatWrapping;
    winTex.wrapT = THREE.RepeatWrapping;

    const litBuildingMat = new THREE.MeshBasicMaterial({ map: winTex, transparent: true, opacity: 0.95 });

    const radius = 75;
    for (let i = 0; i < 28; i++) {
      const theta = (i / 28) * Math.PI * 2;
      const dist = radius + (Math.random() * 25);
      const bx = Math.cos(theta) * dist;
      const bz = Math.sin(theta) * dist;

      const bw = 12 + Math.random() * 14;
      const bd = 12 + Math.random() * 14;
      const bh = 35 + Math.random() * 55;

      const bGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
      base.position.y = bh / 2;
      bGroup.add(base);

      const facade = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, bh * 0.85), litBuildingMat);
      facade.position.set(0, bh * 0.45, bd * 0.51);
      bGroup.add(facade);

      const antH = 8 + Math.random() * 12;
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, antH, 6), buildingMat);
      ant.position.y = bh + antH / 2;
      bGroup.add(ant);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      beacon.position.y = bh + antH;
      bGroup.add(beacon);

      bGroup.position.set(bx, 0, bz);
      bGroup.lookAt(0, bh / 2, 0);
      cityGroup.add(bGroup);
    }

    this.scene.add(cityGroup);
  }

  // =========================================================================
  // Destructible Tactical Obstacles
  // =========================================================================
  spawnObstacles() {
    while (this.obstacleGroup.children.length > 0) {
      this.obstacleGroup.remove(this.obstacleGroup.children[0]);
    }
    this.obstacles.length = 0;

    const bunkerConcreteMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65, metalness: 0.25 });
    const bunkerArmorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.75 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.55, metalness: 0.35 });
    const barrelMetalMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.65 });
    const barrelHazardMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const steelIBeamMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.25 });

    const createFortifiedBunker = (w, h, d) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bunkerConcreteMat);
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.4, d * 0.95), bunkerArmorMat);
      cap.position.y = h / 2 + 0.2;
      cap.castShadow = true;
      g.add(cap);

      [[-w/2, -d/2], [w/2, -d/2], [-w/2, d/2], [w/2, d/2]].forEach(([cx, cz]) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, h + 0.4, 0.4), bunkerArmorMat);
        col.position.set(cx, 0.1, cz);
        col.castShadow = true;
        g.add(col);
      });

      const slit = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 0.22, d + 0.05), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      slit.position.y = 0.2;
      g.add(slit);
      return g;
    };

    const createIndustrialCrate = (w, h, d) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const bracketA = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.2, d + 0.05), bunkerArmorMat);
      bracketA.position.y = h * 0.35;
      g.add(bracketA);

      const bracketB = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.2, d + 0.05), bunkerArmorMat);
      bracketB.position.y = -h * 0.35;
      g.add(bracketB);
      return g;
    };

    const createExplosiveSilo = (w, h) => {
      const g = new THREE.Group();
      const r = w / 2;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), barrelMetalMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const ringA = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.18, 16), barrelHazardMat);
      ringA.position.y = h * 0.25;
      g.add(ringA);

      const ringB = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.18, 16), barrelHazardMat);
      ringB.position.y = -h * 0.25;
      g.add(ringB);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.5, 0.25, 12), bunkerArmorMat);
      cap.position.y = h / 2 + 0.12;
      g.add(cap);
      return g;
    };

    const createAntiTankHedgehog = (size = 2.4) => {
      const g = new THREE.Group();
      const beamGeo = new THREE.BoxGeometry(0.3, size, 0.3);

      const b1 = new THREE.Mesh(beamGeo, steelIBeamMat);
      b1.rotation.z = Math.PI / 4;
      b1.castShadow = true;
      g.add(b1);

      const b2 = new THREE.Mesh(beamGeo, steelIBeamMat);
      b2.rotation.z = -Math.PI / 4;
      b2.castShadow = true;
      g.add(b2);

      const b3 = new THREE.Mesh(beamGeo, steelIBeamMat);
      b3.rotation.x = Math.PI / 4;
      b3.castShadow = true;
      g.add(b3);
      return g;
    };

    const layout = [
      // Center Bunker Complex
      { x: 0, z: 0, w: 4.8, h: 2.2, d: 4.8, type: 'bunker', hp: 6 },
      { x: -8.5, z: 0, w: 2.8, h: 2.0, d: 2.8, type: 'crate', hp: 3 },
      { x: 8.5, z: 0, w: 2.8, h: 2.0, d: 2.8, type: 'crate', hp: 3 },

      // Quadrant Concrete Defense Pillars
      { x: -13, z: -11, w: 3.2, h: 2.4, d: 3.2, type: 'bunker', hp: 4 },
      { x: 13, z: -11, w: 3.2, h: 2.4, d: 3.2, type: 'bunker', hp: 4 },
      { x: -13, z: 11, w: 3.2, h: 2.4, d: 3.2, type: 'bunker', hp: 4 },
      { x: 13, z: 11, w: 3.2, h: 2.4, d: 3.2, type: 'bunker', hp: 4 },

      // Tactical Czech Hedgehogs
      { x: 0, z: -8.5, w: 2.2, h: 2.2, d: 2.2, type: 'hedgehog', hp: 5 },
      { x: 0, z: 8.5, w: 2.2, h: 2.2, d: 2.2, type: 'hedgehog', hp: 5 },

      // Flank Volatile Fuel Silos
      { x: -20, z: 6.5, w: 2.0, h: 2.4, d: 2.0, type: 'barrel', hp: 2 },
      { x: -20, z: -6.5, w: 2.0, h: 2.4, d: 2.0, type: 'barrel', hp: 2 },
      { x: 20, z: 6.5, w: 2.0, h: 2.4, d: 2.0, type: 'barrel', hp: 2 },
      { x: 20, z: -6.5, w: 2.0, h: 2.4, d: 2.0, type: 'barrel', hp: 2 },
      { x: -6, z: -16, w: 1.8, h: 2.2, d: 1.8, type: 'barrel', hp: 2 },
      { x: 6, z: -16, w: 1.8, h: 2.2, d: 1.8, type: 'barrel', hp: 2 },
      { x: -6, z: 16, w: 1.8, h: 2.2, d: 1.8, type: 'barrel', hp: 2 },
      { x: 6, z: 16, w: 1.8, h: 2.2, d: 1.8, type: 'barrel', hp: 2 }
    ];

    layout.forEach(item => {
      let mesh;
      if (item.type === 'bunker') mesh = createFortifiedBunker(item.w, item.h, item.d);
      else if (item.type === 'crate') mesh = createIndustrialCrate(item.w, item.h, item.d);
      else if (item.type === 'barrel') mesh = createExplosiveSilo(item.w, item.h);
      else mesh = createAntiTankHedgehog(item.w);

      mesh.position.set(item.x, item.h / 2, item.z);
      this.obstacleGroup.add(mesh);

      this.obstacles.push({
        mesh,
        x: item.x,
        z: item.z,
        w: item.w,
        d: item.d,
        type: item.type,
        hp: item.hp,
        maxHp: item.hp,
        radius: Math.max(item.w, item.d) * 0.55
      });
    });
  }

  // =========================================================================
  // Target Practice Range System
  // =========================================================================
  spawnPracticeTargets() {
    while (this.practiceGroup.children.length > 0) {
      this.practiceGroup.remove(this.practiceGroup.children[0]);
    }
    this.practiceTargets.length = 0;

    // Create Bullseye Texture
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const rings = [
      { r: 124, color: '#ef4444' },
      { r: 96, color: '#ffffff' },
      { r: 70, color: '#ef4444' },
      { r: 44, color: '#ffffff' },
      { r: 22, color: '#f59e0b' }
    ];
    rings.forEach(ring => {
      ctx.beginPath();
      ctx.arc(128, 128, ring.r, 0, Math.PI * 2);
      ctx.fillStyle = ring.color;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
    });
    const bullseyeTex = new THREE.CanvasTexture(c);

    // 1. Hovering Patrol Drones
    const droneConfigs = [
      { x: -14, z: -10, minX: -18, maxX: -8, speed: 4.5, phase: 0 },
      { x: 14, z: -10, minX: 8, maxX: 18, speed: 4.0, phase: 1.2 },
      { x: 0, z: -18, minX: -10, maxX: 10, speed: 5.5, phase: 2.5 },
      { x: 12, z: 12, minX: 6, maxX: 18, speed: 4.2, phase: 3.8 }
    ];

    droneConfigs.forEach(cfg => {
      const drone = new THREE.Group();
      const coreGeo = new THREE.SphereGeometry(0.65, 16, 16);
      const coreMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.6, roughness: 0.2 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.castShadow = true;
      drone.add(core);

      const ringGeo = new THREE.TorusGeometry(1.05, 0.12, 12, 24);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2, emissiveIntensity: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      drone.add(ring);

      const light = new THREE.PointLight(0x38bdf8, 1.5, 8);
      light.position.y = -0.5;
      drone.add(light);

      drone.position.set(cfg.x, 2.4, cfg.z);
      this.practiceGroup.add(drone);

      this.practiceTargets.push({
        type: 'drone',
        mesh: drone,
        ring,
        x: cfg.x,
        baseY: 2.4,
        z: cfg.z,
        minX: cfg.minX,
        maxX: cfg.maxX,
        dir: 1,
        speed: cfg.speed,
        phase: cfg.phase,
        radius: 1.1,
        active: true,
        respawnTimer: 0
      });
    });

    // 2. Stationary & Pop-Up Bullseye Targets
    const bullseyePositions = [
      { x: -8, z: 14, rotY: 0 },
      { x: 0, z: 16, rotY: 0 },
      { x: 8, z: 14, rotY: 0 },
      { x: -18, z: 4, rotY: Math.PI / 4 },
      { x: 18, z: 4, rotY: -Math.PI / 4 },
      { x: 0, z: -6, rotY: Math.PI }
    ];

    bullseyePositions.forEach(pos => {
      const stand = new THREE.Group();
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 12), poleMat);
      pole.position.y = 0.9;
      pole.castShadow = true;
      stand.add(pole);

      const faceMat = new THREE.MeshStandardMaterial({ map: bullseyeTex, roughness: 0.4, side: THREE.DoubleSide });
      const targetFace = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 24), faceMat);
      targetFace.rotation.x = Math.PI / 2;
      targetFace.position.y = 1.8;
      targetFace.castShadow = true;
      stand.add(targetFace);

      stand.position.set(pos.x, 0, pos.z);
      stand.rotation.y = pos.rotY;
      this.practiceGroup.add(stand);

      this.practiceTargets.push({
        type: 'bullseye',
        mesh: stand,
        targetFace,
        x: pos.x,
        z: pos.z,
        radius: 0.95,
        active: true,
        respawnTimer: 0
      });
    });
  }

  updatePracticeTargets(dt) {
    if (this.gameMode !== 'PRACTICE') return;
    const time = performance.now() * 0.001;

    for (let i = 0; i < this.practiceTargets.length; i++) {
      const t = this.practiceTargets[i];
      if (!t.active) {
        t.respawnTimer -= dt;
        if (t.respawnTimer <= 0) {
          t.active = true;
          t.mesh.visible = true;
        }
        continue;
      }

      if (t.type === 'drone') {
        t.x += t.dir * t.speed * dt;
        if (t.x >= t.maxX) { t.x = t.maxX; t.dir = -1; }
        else if (t.x <= t.minX) { t.x = t.minX; t.dir = 1; }

        const hoverY = t.baseY + Math.sin(time * 2.5 + t.phase) * 0.45;
        t.mesh.position.set(t.x, hoverY, t.z);
        t.ring.rotation.z += dt * 3.5;
      }
    }
  }

  // =========================================================================
  // Tank Controller Construction & Management
  // =========================================================================
  createTankController(id, color, glow, startPos, startRot) {
    const mesh = buildTankMesh(color, glow);
    this.scene.add(mesh);

    const controller = {
      id,
      color,
      glow,
      mesh,
      x: startPos.x,
      z: startPos.z,
      rotation: startRot,
      turretRotation: 0,
      hp: 100,
      maxHp: 100,
      ammo: 3,
      maxAmmo: 3,
      reloadTimer: 0,
      RELOAD_TIME: 1.35,
      speed: 0,
      MAX_SPEED: 9.2,
      ACCEL: 18.0,
      DECEL: 22.0,
      TURN_SPEED: 2.7,
      recoil: 0,
      radius: 1.4,
      isDead: false,
      treadTimer: 0,

      reset: (pos, rot) => {
        controller.x = pos.x;
        controller.z = pos.z;
        controller.rotation = rot;
        controller.turretRotation = 0;
        controller.speed = 0;
        controller.hp = controller.maxHp;
        controller.ammo = controller.maxAmmo;
        controller.reloadTimer = 0;
        controller.isDead = false;
        controller.mesh.visible = true;
        controller.updateTransform();
      },

      updateTransform: () => {
        controller.mesh.position.set(controller.x, 0, controller.z);
        controller.mesh.rotation.y = controller.rotation;
        if (controller.mesh.userData.turret) {
          controller.mesh.userData.turret.rotation.y = controller.turretRotation;
          controller.mesh.userData.turret.position.z = -0.1 - controller.recoil * 0.25;
        }
      },

      takeDamage: (amount) => {
        if (controller.isDead) return;
        controller.hp = Math.max(0, controller.hp - amount);
        this.playSfxHit();
        this.spawnSparkBurst(new THREE.Vector3(controller.x, 1.0, controller.z), 18);
        if (controller.hp <= 0) {
          controller.destroy();
        }
      },

      destroy: () => {
        controller.isDead = true;
        controller.mesh.visible = false;
        this.playSfxExplode();
        this.spawnMegaExplosion(new THREE.Vector3(controller.x, 1.0, controller.z));
      },

      canFire: () => {
        return !controller.isDead && controller.ammo > 0;
      },

      fireMissile: () => {
        if (!controller.canFire()) return null;
        controller.ammo--;
        controller.recoil = 1.0;
        this.playSfxFire();

        if (this.gameMode === 'PRACTICE' && controller.id === 1) {
          this.pracShots++;
        }

        const worldAngle = controller.rotation + controller.turretRotation;
        const launchX = controller.x + Math.sin(worldAngle) * 2.8;
        const launchZ = controller.z + Math.cos(worldAngle) * 2.8;
        const launchY = 1.25;

        this.spawnMuzzleFlash(new THREE.Vector3(launchX, launchY, launchZ), worldAngle, controller.glow);

        return this.createMissile(
          controller.id,
          new THREE.Vector3(launchX, launchY, launchZ),
          worldAngle,
          controller.glow
        );
      },

      update: (dt) => {
        if (controller.isDead) return;

        if (controller.ammo < controller.maxAmmo) {
          controller.reloadTimer += dt;
          if (controller.reloadTimer >= controller.RELOAD_TIME) {
            controller.ammo++;
            controller.reloadTimer = 0;
          }
        }

        controller.recoil = Math.max(0, controller.recoil - dt * 5.0);

        const nextX = controller.x + Math.sin(controller.rotation) * controller.speed * dt;
        const nextZ = controller.z + Math.cos(controller.rotation) * controller.speed * dt;

        const boundLimit = this.halfArena - 1.8;
        const clampedX = THREE.MathUtils.clamp(nextX, -boundLimit, boundLimit);
        const clampedZ = THREE.MathUtils.clamp(nextZ, -boundLimit, boundLimit);

        let collides = false;
        for (let i = 0; i < this.obstacles.length; i++) {
          const obs = this.obstacles[i];
          const dist = Math.hypot(clampedX - obs.x, clampedZ - obs.z);
          if (dist < (controller.radius + obs.radius)) {
            collides = true;
            const angle = Math.atan2(clampedZ - obs.z, clampedX - obs.x);
            controller.x = obs.x + Math.cos(angle) * (controller.radius + obs.radius + 0.05);
            controller.z = obs.z + Math.sin(angle) * (controller.radius + obs.radius + 0.05);
            controller.speed *= -0.2;
            break;
          }
        }

        if (!collides) {
          controller.x = clampedX;
          controller.z = clampedZ;

          controller.treadTimer += dt;
          if (Math.abs(controller.speed) > 0.6 && controller.treadTimer > 0.12) {
            controller.treadTimer = 0;
            const cosR = Math.cos(controller.rotation);
            const sinR = Math.sin(controller.rotation);
            this.addTreadMark(controller.x - cosR * 1.1, controller.z + sinR * 1.1, controller.rotation);
            this.addTreadMark(controller.x + cosR * 1.1, controller.z - sinR * 1.1, controller.rotation);
          }
        }

        controller.updateTransform();
      }
    };

    controller.updateTransform();
    return controller;
  }

  // =========================================================================
  // Missile & Ballistics System
  // =========================================================================
  createMissile(ownerId, pos, headingAngle, glowColor) {
    const mesh = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.85, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    mesh.add(body);

    const noseGeo = new THREE.ConeGeometry(0.1, 0.35, 12);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.3 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.6;
    mesh.add(nose);

    const finMat = new THREE.MeshBasicMaterial({ color: glowColor });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.25), finMat);
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.z = -0.35;
      mesh.add(fin);
    }

    const thrustLight = new THREE.PointLight(glowColor, 1.8, 8);
    thrustLight.position.set(0, 0, -0.45);
    mesh.add(thrustLight);

    mesh.position.copy(pos);
    mesh.rotation.y = headingAngle;
    this.scene.add(mesh);

    const missile = {
      ownerId,
      pos: pos.clone(),
      heading: headingAngle,
      speed: 28.0,
      life: 3.5,
      dead: false,
      mesh,

      update: (dt) => {
        missile.life -= dt;
        if (missile.life <= 0) {
          missile.detonate();
          return;
        }

        missile.pos.x += Math.sin(missile.heading) * missile.speed * dt;
        missile.pos.z += Math.cos(missile.heading) * missile.speed * dt;
        missile.mesh.position.copy(missile.pos);

        this.spawnThrusterParticle(
          new THREE.Vector3(
            missile.pos.x - Math.sin(missile.heading) * 0.5,
            missile.pos.y,
            missile.pos.z - Math.cos(missile.heading) * 0.5
          )
        );

        // Arena boundary collision
        if (Math.abs(missile.pos.x) >= this.halfArena - 0.5 || Math.abs(missile.pos.z) >= this.halfArena - 0.5) {
          missile.detonate();
          return;
        }

        // Obstacle collision
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
          const obs = this.obstacles[i];
          const dist = Math.hypot(missile.pos.x - obs.x, missile.pos.z - obs.z);
          if (dist <= obs.radius + 0.3) {
            obs.hp--;
            this.spawnSparkBurst(missile.pos, 15);
            if (obs.hp <= 0) {
              this.spawnMegaExplosion(new THREE.Vector3(obs.x, 1.0, obs.z));
              if (obs.type === 'barrel') {
                this.checkSplashDamage(new THREE.Vector3(obs.x, 0, obs.z), 6.5, 45);
              }
              this.obstacleGroup.remove(obs.mesh);
              this.obstacles.splice(i, 1);
            }
            missile.detonate();
            return;
          }
        }

        // Practice Targets Collision
        if (this.gameMode === 'PRACTICE') {
          for (let i = 0; i < this.practiceTargets.length; i++) {
            const target = this.practiceTargets[i];
            if (!target.active) continue;

            const targetY = target.type === 'drone' ? target.mesh.position.y : 1.8;
            const dist = Math.hypot(missile.pos.x - target.x, missile.pos.z - target.z);
            if (dist <= target.radius + 0.4) {
              target.active = false;
              target.respawnTimer = 2.8;

              this.pracHits++;
              this.pracStreak++;

              this.playSfxExplode();
              this.spawnMegaExplosion(new THREE.Vector3(target.x, targetY, target.z));

              if (target.type === 'drone') {
                target.mesh.visible = false;
                this.showToast("DRONE DESTROYED!", `Streak x${this.pracStreak}! +150 Points`, '#10b981');
              } else {
                target.mesh.visible = false;
                this.showToast("BULLSEYE HIT!", `Direct center hit! Streak x${this.pracStreak}!`, '#f59e0b');
              }

              missile.detonate();
              return;
            }
          }
        }

        // Tank Direct Hit
        const targetTank = missile.ownerId === 1 ? this.p2 : this.p1;
        if (!targetTank.isDead) {
          const distToTarget = Math.hypot(missile.pos.x - targetTank.x, missile.pos.z - targetTank.z);
          if (distToTarget <= targetTank.radius + 0.35) {
            targetTank.takeDamage(34);
            this.showToast(
              "DIRECT HIT!",
              `Player ${missile.ownerId} scored a heavy missile impact!`,
              missile.ownerId === 1 ? '#06b6d4' : '#f97316'
            );
            missile.detonate();
            return;
          }
        }
      },

      detonate: () => {
        missile.dead = true;
        this.scene.remove(missile.mesh);
        this.playSfxExplode();
        this.spawnMegaExplosion(missile.pos);
        this.checkSplashDamage(missile.pos, 4.5, 20);
      }
    };

    return missile;
  }

  checkSplashDamage(epicenter, radius, maxDmg) {
    [this.p1, this.p2].forEach(tank => {
      if (tank.isDead) return;
      const d = Math.hypot(epicenter.x - tank.x, epicenter.z - tank.z);
      if (d <= radius) {
        const falloff = 1.0 - (d / radius);
        const dmg = Math.round(maxDmg * falloff);
        if (dmg > 5) tank.takeDamage(dmg);
      }
    });
  }

  // =========================================================================
  // VFX & Particle System
  // =========================================================================
  spawnMuzzleFlash(pos, heading, glowColor) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    flash.position.copy(pos);
    this.particleGroup.add(flash);

    this.particles.push({
      mesh: flash,
      life: 0.12,
      maxLife: 0.12,
      update: (dt) => {
        flash.scale.multiplyScalar(0.85);
        if (flash.scale.x <= 0.05) this.particleGroup.remove(flash);
      }
    });
  }

  spawnThrusterParticle(pos) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 6, 6),
      new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xf97316 : 0x64748b, transparent: true, opacity: 0.85 })
    );
    p.position.copy(pos);
    this.particleGroup.add(p);

    const particleObj = {
      mesh: p,
      life: 0.35,
      maxLife: 0.35,
      update: (dt) => {
        particleObj.life -= dt;
        p.position.y += dt * 0.8;
        p.scale.multiplyScalar(1.08);
        p.material.opacity = (particleObj.life / particleObj.maxLife) * 0.85;
        if (particleObj.life <= 0) this.particleGroup.remove(p);
      }
    };
    this.particles.push(particleObj);
  }

  spawnSparkBurst(pos, count = 20) {
    for (let i = 0; i < count; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.6 ? 0xfef08a : 0xf97316 })
      );
      spark.position.copy(pos);
      this.particleGroup.add(spark);

      const theta = Math.random() * Math.PI * 2;
      const spd = 3.0 + Math.random() * 8.0;
      const vx = Math.cos(theta) * spd;
      let vy = 2.0 + Math.random() * 6.0;
      const vz = Math.sin(theta) * spd;

      const sparkObj = {
        mesh: spark,
        vx, vy, vz,
        life: 0.4 + Math.random() * 0.3,
        update: (dt) => {
          sparkObj.life -= dt;
          sparkObj.vy -= 14 * dt;
          spark.position.x += sparkObj.vx * dt;
          spark.position.y += sparkObj.vy * dt;
          spark.position.z += sparkObj.vz * dt;
          if (spark.position.y <= 0.05) {
            spark.position.y = 0.05;
            sparkObj.vy *= -0.3;
          }
          if (sparkObj.life <= 0) this.particleGroup.remove(spark);
        }
      };
      this.particles.push(sparkObj);
    }
  }

  spawnMegaExplosion(pos) {
    this.spawnScorchCrater(pos);

    const blastLight = new THREE.PointLight(0xf97316, 4.0, 28);
    blastLight.position.set(pos.x, pos.y + 1.2, pos.z);
    this.scene.add(blastLight);
    setTimeout(() => this.scene.remove(blastLight), 180);

    // 1. Central Fireball
    const fireGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.95 });
    const fire = new THREE.Mesh(fireGeo, fireMat);
    fire.position.copy(pos);
    this.particleGroup.add(fire);

    const fireObj = {
      mesh: fire,
      life: 0.45,
      maxLife: 0.45,
      update: (dt) => {
        fireObj.life -= dt;
        const prog = 1 - (fireObj.life / fireObj.maxLife);
        fire.scale.setScalar(1.0 + prog * 2.5);
        fire.material.opacity = (fireObj.life / fireObj.maxLife) * 0.95;
        if (fireObj.life <= 0) this.particleGroup.remove(fire);
      }
    };
    this.particles.push(fireObj);

    // 2. Shockwave Ring
    const ringGeo = new THREE.RingGeometry(0.5, 1.2, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.1, pos.z);
    this.particleGroup.add(ring);

    const ringObj = {
      mesh: ring,
      life: 0.4,
      maxLife: 0.4,
      update: (dt) => {
        ringObj.life -= dt;
        const prog = 1 - (ringObj.life / ringObj.maxLife);
        ring.scale.setScalar(1.0 + prog * 7.0);
        ring.material.opacity = (ringObj.life / ringObj.maxLife) * 0.8;
        if (ringObj.life <= 0) this.particleGroup.remove(ring);
      }
    };
    this.particles.push(ringObj);

    // 3. Smoke debris plume
    this.spawnSparkBurst(pos, 35);
    for (let i = 0; i < 15; i++) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.6 + Math.random() * 0.5, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.7 })
      );
      smoke.position.set(
        pos.x + (Math.random() - 0.5) * 1.5,
        pos.y + Math.random() * 0.8,
        pos.z + (Math.random() - 0.5) * 1.5
      );
      this.particleGroup.add(smoke);

      const upSpeed = 2.0 + Math.random() * 4.0;
      const smokeObj = {
        mesh: smoke,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.2,
        update: (dt) => {
          smokeObj.life -= dt;
          smoke.position.y += upSpeed * dt;
          smoke.scale.multiplyScalar(1.02);
          smoke.material.opacity = (smokeObj.life / smokeObj.maxLife) * 0.7;
          if (smokeObj.life <= 0) this.particleGroup.remove(smoke);
        }
      };
      this.particles.push(smokeObj);
    }
  }

  // =========================================================================
  // Game Mode Transitions & Series Scoring
  // =========================================================================
  start(mode = '1P (vs AI)') {
    super.start(mode);
    this.initAudio();

    if (mode === 'Practice') {
      this.enterPracticeMode();
    } else if (mode.includes('1P')) {
      this.enterBattleMode('1P');
    } else {
      this.enterBattleMode('2P');
    }
  }

  enterPracticeMode() {
    this.gameMode = 'PRACTICE';
    this.currentMode = 'Practice';

    const bHud = document.getElementById('battleHud');
    const pHud = document.getElementById('practiceHud');
    const toggleBtn = document.getElementById('btnTogglePractice');
    if (bHud) bHud.style.display = 'none';
    if (pHud) pHud.style.display = 'flex';
    if (toggleBtn) toggleBtn.textContent = 'Battle Mode';

    // Hide Player 2 tank
    this.p2.isDead = true;
    this.p2.mesh.visible = false;

    // Reset Player 1 tank at center-back of arena
    this.p1.reset({ x: 0, z: -16 }, 0);
    this.p1.RELOAD_TIME = 0.45; // Rapid reload for target practice

    this.spawnPracticeTargets();
    this.spawnObstacles();

    for (let m of this.activeMissiles) this.scene.remove(m.mesh);
    this.activeMissiles.length = 0;

    this.pracHits = 0;
    this.pracShots = 0;
    this.pracStreak = 0;

    this.showToast("PRACTICE RANGE", "Freely fire missiles at moving drones & bullseyes! No opponent.", "#38bdf8");
  }

  enterBattleMode(mode = '2P') {
    this.gameMode = mode;
    this.currentMode = mode === '1P' ? '1P (vs AI)' : '2P Duel';

    const bHud = document.getElementById('battleHud');
    const pHud = document.getElementById('practiceHud');
    const toggleBtn = document.getElementById('btnTogglePractice');
    if (bHud) bHud.style.display = 'flex';
    if (pHud) pHud.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'Practice';

    this.p1.RELOAD_TIME = 1.35;
    while (this.practiceGroup.children.length > 0) {
      this.practiceGroup.remove(this.practiceGroup.children[0]);
    }
    this.practiceTargets.length = 0;

    this.currentRound = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.resetRound(true);
  }

  resetRound(isNewMatch = false) {
    const modal = document.getElementById('roundModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }

    if (isNewMatch || this.currentRound >= 3) {
      this.currentRound = 1;
      this.p1Wins = 0;
      this.p2Wins = 0;
    } else {
      this.currentRound++;
    }

    this.matchOver = false;
    this.spawnObstacles();

    // Reset tanks
    this.p1.reset({ x: -16, z: 0 }, Math.PI / 2);
    this.p2.reset({ x: 16, z: 0 }, -Math.PI / 2);
    this.aiReverseTimer = 0;
    this.aiWaypoint = null;
    this.aiStuckTimer = 0;
    this.aiLastX = undefined;
    this.aiLastZ = undefined;

    for (let m of this.activeMissiles) this.scene.remove(m.mesh);
    this.activeMissiles.length = 0;

    this.showToast(`ROUND ${this.currentRound} OF 3!`, "Engage and destroy enemy tank!", "#38bdf8");
  }

  checkRoundEnd() {
    if (this.matchOver || this.gameMode === 'PRACTICE') return;

    if (this.p1.isDead || this.p2.isDead) {
      this.matchOver = true;

      let roundWinner = "";
      let roundSub = "";
      let roundEmoji = "";

      if (!this.p1.isDead && this.p2.isDead) {
        this.p1Wins++;
        roundWinner = `PLAYER 1 WINS ROUND ${this.currentRound}!`;
        roundSub = "Enemy armor obliterated by missile strike!";
        roundEmoji = "";
        this.playSfxWin();
      } else if (!this.p2.isDead && this.p1.isDead) {
        this.p2Wins++;
        roundWinner = (this.gameMode === '1P' ? "AI BOT" : "PLAYER 2") + ` WINS ROUND ${this.currentRound}!`;
        roundSub = "Devastating missile barrage scored round victory!";
        roundEmoji = "";
        this.playSfxWin();
      } else {
        roundWinner = `MUTUAL DESTRUCTION (ROUND ${this.currentRound})!`;
        roundSub = "Both tanks eliminated each other!";
      }

      const isMatchComplete = (this.currentRound >= 3);

      setTimeout(() => {
        const modal = document.getElementById('roundModal');
        const titleEl = document.getElementById('winnerTitle');
        const subEl = document.getElementById('winnerSubtitle');
        const emojiEl = document.getElementById('winnerEmoji');
        const scoreEl = document.getElementById('finalScoreDisplay');
        const playBtn = document.getElementById('btnPlayAgain');
        if (!modal) return;

        const rivalName = this.gameMode === '1P' ? 'AI' : 'P2';
        if (scoreEl) scoreEl.textContent = `P1 [ ${this.p1Wins} ]  —  [ ${this.p2Wins} ] ${rivalName}`;

        if (isMatchComplete) {
          if (this.p1Wins > this.p2Wins) {
            if (titleEl) titleEl.textContent = "PLAYER 1 IS THE CHAMPION!";
            if (subEl) subEl.textContent = `3-Round Championship Won! Series Score: ${this.p1Wins} - ${this.p2Wins}`;
            if (emojiEl) emojiEl.textContent = "";
          } else if (this.p2Wins > this.p1Wins) {
            if (titleEl) titleEl.textContent = (this.gameMode === '1P' ? "AI BOT" : "PLAYER 2") + " IS THE CHAMPION!";
            if (subEl) subEl.textContent = `3-Round Championship Won! Series Score: ${this.p2Wins} - ${this.p1Wins}`;
            if (emojiEl) emojiEl.textContent = "";
          } else {
            if (titleEl) titleEl.textContent = "MATCH DRAW (3 ROUNDS)!";
            if (subEl) subEl.textContent = `Both combatants tied at ${this.p1Wins} - ${this.p2Wins}!`;
            if (emojiEl) emojiEl.textContent = "";
          }
          if (playBtn) playBtn.textContent = "Play New Match (3 Rounds)";
        } else {
          if (titleEl) titleEl.textContent = roundWinner;
          if (subEl) subEl.textContent = `${roundSub} · Round ${this.currentRound} of 3 complete.`;
          if (emojiEl) emojiEl.textContent = roundEmoji;
          if (playBtn) playBtn.textContent = `Next Round (Round ${this.currentRound + 1} of 3) →`;
        }

        modal.style.display = 'flex';
        modal.classList.add('active');
      }, 1200);
    }
  }

  // =========================================================================
  // Autonomous AI (in 1P mode)
  // =========================================================================
  /** Finds an obstacle in the AI's path by probing points ahead of the tank. */
  findBlockingObstacle(tank) {
    const fx = Math.sin(tank.rotation);
    const fz = Math.cos(tank.rotation);
    for (const d of [3, 5.5, 8]) {
      const px = tank.x + fx * d;
      const pz = tank.z + fz * d;
      for (const obs of this.obstacles) {
        if (Math.hypot(px - obs.x, pz - obs.z) < obs.radius + tank.radius * 0.9) return obs;
      }
    }
    return null;
  }

  updateAI(dt) {
    if (this.gameMode !== '1P' || this.p2.isDead || this.p1.isDead) return;
    const ai = this.p2;
    const wrap = (a) => {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    };

    const dx = this.p1.x - ai.x;
    const dz = this.p1.z - ai.z;
    const dist = Math.hypot(dx, dz);
    const playerDiff = wrap(Math.atan2(dx, dz) - ai.rotation);

    // --- Unstick: if barely moving while trying to drive, back out and turn ---
    this.aiStuckTimer = (this.aiStuckTimer || 0) + dt;
    if (this.aiStuckTimer >= 1.0) {
      const moved = Math.hypot(ai.x - (this.aiLastX ?? ai.x), ai.z - (this.aiLastZ ?? ai.z));
      this.aiLastX = ai.x;
      this.aiLastZ = ai.z;
      this.aiStuckTimer = 0;
      if (moved < 0.6 && dist > 8) {
        this.aiReverseTimer = 0.9;
        this.aiReverseTurn = Math.random() < 0.5 ? -1 : 1;
        this.aiWaypoint = null;
      }
    }
    if (this.aiReverseTimer > 0) {
      this.aiReverseTimer -= dt;
      ai.speed = Math.max(-ai.MAX_SPEED * 0.5, ai.speed - ai.DECEL * dt);
      ai.rotation += this.aiReverseTurn * ai.TURN_SPEED * dt;
      return;
    }

    // --- Detour: when an obstacle blocks the way, head for a waypoint beside it ---
    if (this.aiWaypoint) {
      this.aiWaypointTimer -= dt;
      if (this.aiWaypointTimer <= 0 || Math.hypot(this.aiWaypoint.x - ai.x, this.aiWaypoint.z - ai.z) < 2.5) {
        this.aiWaypoint = null;
      }
    }
    if (!this.aiWaypoint) {
      const blocker = this.findBlockingObstacle(ai);
      if (blocker) {
        const bx = blocker.x - ai.x;
        const bz = blocker.z - ai.z;
        const bl = Math.hypot(bx, bz) || 1;
        const off = blocker.radius + ai.radius + 1.6;
        // The two tangent points either side of the obstacle; pick the one nearer the player
        const cands = [
          { x: blocker.x + (bz / bl) * off, z: blocker.z - (bx / bl) * off },
          { x: blocker.x - (bz / bl) * off, z: blocker.z + (bx / bl) * off }
        ];
        const dToPlayer = (c) => Math.hypot(this.p1.x - c.x, this.p1.z - c.z);
        this.aiWaypoint = dToPlayer(cands[0]) <= dToPlayer(cands[1]) ? cands[0] : cands[1];
        this.aiWaypointTimer = 3.0;
      }
    }

    // --- Movement toward the waypoint (if any) or the player ---
    const aim = this.aiWaypoint || this.p1;
    const aimDiff = wrap(Math.atan2(aim.x - ai.x, aim.z - ai.z) - ai.rotation);
    if (Math.abs(aimDiff) > 0.1) {
      ai.rotation += Math.sign(aimDiff) * ai.TURN_SPEED * dt;
    }

    if (this.aiWaypoint) {
      // Slow down while still turning toward the waypoint
      const target = Math.abs(aimDiff) > 1.0 ? 2.0 : 7.0;
      ai.speed = THREE.MathUtils.lerp(ai.speed, target, dt * 3.0);
    } else if (dist > 18) {
      ai.speed = Math.min(ai.MAX_SPEED, ai.speed + ai.ACCEL * dt);
    } else if (dist < 8) {
      ai.speed = Math.max(-ai.MAX_SPEED * 0.5, ai.speed - ai.DECEL * dt);
    } else {
      ai.speed = THREE.MathUtils.lerp(ai.speed, 3.5, dt * 2.0);
    }

    // --- Fire whenever the barrel is roughly on the player ---
    if (Math.abs(playerDiff) < 0.28 && dist < 35) {
      this.aiFireTimer -= dt;
      if (this.aiFireTimer <= 0 && ai.canFire()) {
        const m = ai.fireMissile();
        if (m) this.activeMissiles.push(m);
        this.aiFireTimer = 1.2 + Math.random() * 0.8;
      }
    }
  }

  // =========================================================================
  // Input Handling (Keyboard & Touch)
  // =========================================================================
  setupKeyboardListeners() {
    this._keyDownHandler = (e) => {
      this.initAudio();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;

      // Camera perspective cycle shortcut [C]
      if (e.code === 'KeyC') {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Tactical Isometric', 'Overhead Arena', 'Dynamic Follow'];
        this.showToast("CAMERA MODE", modes[this.cameraMode], '#94a3b8');
      }

      // P1 Shoot Trigger
      if ((e.code === 'Space' || e.code === 'KeyF') && !this.matchOver) {
        const m = this.p1.fireMissile();
        if (m) this.activeMissiles.push(m);
      }

      // P2 Shoot Trigger (in 2P mode)
      if (this.gameMode === '2P' && (e.code === 'Enter' || e.code === 'KeyM' || e.code === 'Numpad0') && !this.matchOver) {
        const m = this.p2.fireMissile();
        if (m) this.activeMissiles.push(m);
      }
    };

    this._keyUpHandler = (e) => {
      this.keys[e.code] = false;
    };

    this._blurHandler = () => { this.keys = {}; };
    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);
    window.addEventListener('blur', this._blurHandler);
  }

  processInputs(dt) {
    if (this.matchOver) return;

    // Player 1: WASD
    if (this.keys['KeyW']) {
      this.p1.speed = Math.min(this.p1.MAX_SPEED, this.p1.speed + this.p1.ACCEL * dt);
    } else if (this.keys['KeyS']) {
      this.p1.speed = Math.max(-this.p1.MAX_SPEED * 0.6, this.p1.speed - this.p1.DECEL * dt);
    } else {
      this.p1.speed = THREE.MathUtils.lerp(this.p1.speed, 0, dt * 6.0);
    }

    if (this.keys['KeyA']) {
      this.p1.rotation += this.p1.TURN_SPEED * dt;
    }
    if (this.keys['KeyD']) {
      this.p1.rotation -= this.p1.TURN_SPEED * dt;
    }

    // Player 2: Arrows (only if 2P mode)
    if (this.gameMode === '2P') {
      if (this.keys['ArrowUp']) {
        this.p2.speed = Math.min(this.p2.MAX_SPEED, this.p2.speed + this.p2.ACCEL * dt);
      } else if (this.keys['ArrowDown']) {
        this.p2.speed = Math.max(-this.p2.MAX_SPEED * 0.6, this.p2.speed - this.p2.DECEL * dt);
      } else {
        this.p2.speed = THREE.MathUtils.lerp(this.p2.speed, 0, dt * 6.0);
      }

      if (this.keys['ArrowLeft']) {
        this.p2.rotation += this.p2.TURN_SPEED * dt;
      }
      if (this.keys['ArrowRight']) {
        this.p2.rotation -= this.p2.TURN_SPEED * dt;
      }
    }
  }

  /** Keeps the two tanks from driving through each other. */
  separateTanks() {
    const a = this.p1;
    const b = this.p2;
    if (a.isDead || b.isDead || this.gameMode === 'PRACTICE') return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const minDist = a.radius + b.radius;
    if (dist >= minDist) return;
    const nx = dist > 0.001 ? dx / dist : 1;
    const nz = dist > 0.001 ? dz / dist : 0;
    const push = (minDist - dist) / 2;
    a.x -= nx * push;
    a.z -= nz * push;
    b.x += nx * push;
    b.z += nz * push;
    a.speed *= 0.6;
    b.speed *= 0.6;
    a.updateTransform();
    b.updateTransform();
  }

  // =========================================================================
  // Per-Frame Update Loop
  // =========================================================================
  update(dt, input) {
    if (this.isPaused) return;

    this.processInputs(dt);
    this.updateAI(dt);
    this.updatePracticeTargets(dt);

    // Animate holographic forcefield barrier pulse
    if (this.animatedForcefieldMat) {
      const now = performance.now();
      this.animatedForcefieldMat.opacity = 0.20 + Math.sin(now * 0.003) * 0.08;
      if (this.animatedForcefieldMat.map) {
        this.animatedForcefieldMat.map.offset.y += dt * 0.08;
      }
    }

    // Tank simulation
    this.p1.update(dt);
    this.p2.update(dt);
    this.separateTanks();

    // Missile simulation
    for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
      const m = this.activeMissiles[i];
      m.update(dt);
      if (m.dead) this.activeMissiles.splice(i, 1);
    }

    // Particle simulation
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Round check
    this.checkRoundEnd();

    // Camera positioning modes
    if (this.cameraMode === 0) {
      // Tactical Isometric (smooth center tracking)
      const midX = this.gameMode === 'PRACTICE' ? this.p1.x * 0.5 : (this.p1.x + this.p2.x) / 2;
      const midZ = this.gameMode === 'PRACTICE' ? this.p1.z * 0.5 : (this.p1.z + this.p2.z) / 2;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, midX, 0.05);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 32, 0.05);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, midZ + 28, 0.05);
      this.camera.lookAt(midX, 1.2, midZ);
    } else if (this.cameraMode === 1) {
      // High Top-Down Arena
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0, 0.08);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 44, 0.08);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, 2, 0.08);
      this.camera.lookAt(0, 0, 0);
    } else {
      // Action Chase behind Player 1
      const camDist = 9.0;
      const targetCamX = this.p1.x - Math.sin(this.p1.rotation) * camDist;
      const targetCamZ = this.p1.z - Math.cos(this.p1.rotation) * camDist;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, 0.1);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 6.5, 0.1);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, 0.1);
      this.camera.lookAt(this.p1.x, 1.5, this.p1.z);
    }
  }

  // =========================================================================
  // HUD HTML & Realtime Binding (Exact matched with tanks.html)
  // =========================================================================
  getHUDHtml() {
    return `
      <div class="tank-ui-layer">
        <!-- Top Status & Health Bar -->
        <header class="tank-top-bar">
          <!-- Health & Match Scoreboard (Battle Modes) -->
          <div class="tank-battle-hud tank-glass interactive" id="battleHud">
            <!-- Player 1 Status -->
            <div class="tank-status p1">
              <div class="tank-header p1">
                <span>PLAYER 1</span>
                <span class="tank-score-badge" id="p1Score">${this.p1Wins} WINS</span>
              </div>
              <div class="tank-hp-bar-outer">
                <div class="tank-hp-bar-inner p1" id="p1HpBar" style="width: 100%;"></div>
              </div>
              <div class="tank-ammo-dots" id="p1Ammo">
                <div class="tank-ammo-pip ready p1"></div>
                <div class="tank-ammo-pip ready p1"></div>
                <div class="tank-ammo-pip ready p1"></div>
              </div>
            </div>

            <!-- VS & Round -->
            <div class="tank-vs-divider">
              <div>VS</div>
              <div class="tank-round-indicator" id="roundText">ROUND ${this.currentRound} / 3</div>
            </div>

            <!-- Player 2 / AI Status -->
            <div class="tank-status p2">
              <div class="tank-header p2">
                <span class="tank-score-badge" id="p2Score">${this.p2Wins} WINS</span>
                <span id="p2Label">${this.gameMode === '1P' ? 'AI TANK' : 'PLAYER 2'}</span>
              </div>
              <div class="tank-hp-bar-outer">
                <div class="tank-hp-bar-inner p2" id="p2HpBar" style="width: 100%;"></div>
              </div>
              <div class="tank-ammo-dots" id="p2Ammo" style="justify-content: flex-end;">
                <div class="tank-ammo-pip ready p2"></div>
                <div class="tank-ammo-pip ready p2"></div>
                <div class="tank-ammo-pip ready p2"></div>
              </div>
            </div>
          </div>

          <!-- Practice Range Telemetry HUD (Practice Mode) -->
          <div class="tank-battle-hud tank-glass interactive" id="practiceHud" style="display: ${this.gameMode === 'PRACTICE' ? 'flex' : 'none'}; gap:20px; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div>
                <div style="font-family:'Orbitron', sans-serif; font-size:0.85rem; font-weight:800; color:#38bdf8;">TARGET RANGE</div>
                <div style="font-size:0.7rem; color:#94a3b8;">NO OPPONENT · SOLO DRILL</div>
              </div>
            </div>

            <div style="width:1px; height:26px; background:rgba(255,255,255,0.12);"></div>

            <div style="display:flex; gap:16px; align-items:center;">
              <div style="text-align:center;">
                <div style="font-size:0.65rem; color:#94a3b8; font-weight:700;">HITS</div>
                <div id="pracHits" style="font-family:'JetBrains Mono', monospace; font-size:1.15rem; font-weight:900; color:#10b981;">0</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.65rem; color:#94a3b8; font-weight:700;">ACCURACY</div>
                <div id="pracAccuracy" style="font-family:'JetBrains Mono', monospace; font-size:1.15rem; font-weight:900; color:#38bdf8;">100%</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.65rem; color:#94a3b8; font-weight:700;">STREAK</div>
                <div id="pracStreak" style="font-family:'JetBrains Mono', monospace; font-size:1.15rem; font-weight:900; color:#f59e0b;">0</div>
              </div>
            </div>

            <div style="width:1px; height:26px; background:rgba(255,255,255,0.12);"></div>

            <button id="btnRespawnTargets" class="tank-nav-link-btn" style="cursor:pointer; border-radius:10px; padding:6px 12px; background:rgba(56,189,248,0.15); border-color:#38bdf8; color:#38bdf8;">
              Respawn Targets
            </button>
          </div>

          <!-- Quick Actions & Camera Controls -->
          <div class="tank-top-actions interactive">
            <button class="tank-nav-link-btn" id="btnTogglePractice" title="Toggle Practice Range / Battle" style="cursor:pointer; color:#38bdf8; border-color:rgba(56,189,248,0.3);">
              ${this.gameMode === 'PRACTICE' ? 'Battle Mode' : 'Practice'}
            </button>
            <button class="tank-btn-icon" id="btnCamView" title="Toggle Camera View (Tactical / Overhead / Action)"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg></button>
            <button class="tank-btn-icon" id="btnSoundTank" title="Toggle Sound"><svg class="ic ic-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg><svg class="ic ic-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/></svg></button>
          </div>
        </header>

        <!-- Center Announcement Toast -->
        <div class="tank-toast-center tank-glass" id="tankToast">
          <div class="tank-toast-title" id="tankToastTitle">DIRECT HIT!</div>
          <div class="tank-toast-sub" id="tankToastSub">Missile detonation took out armor!</div>
        </div>

        <!-- Bottom Controls & Keycaps -->
        <footer class="tank-bottom-bar">
          <!-- Player 1 Controls Card -->
          <div class="tank-control-guide-card tank-glass interactive">
            <div class="tank-guide-col">
              <div class="tank-guide-title p1">PLAYER 1</div>
              <div class="tank-key-caps">
                <span>Drive:</span> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
              </div>
              <div class="tank-key-caps">
                <span>Fire Missile:</span> <kbd>Space</kbd> or <kbd>F</kbd>
              </div>
            </div>
          </div>

          <!-- Mobile On-Screen Controls -->
          <div class="tank-mobile-controls interactive">
            <div class="tank-touch-pad">
              <div></div>
              <button class="tank-touch-btn" id="mP1Up">▲</button>
              <div></div>
              <button class="tank-touch-btn" id="mP1Left">◀</button>
              <button class="tank-touch-btn" id="mP1Down">▼</button>
              <button class="tank-touch-btn" id="mP1Right">▶</button>
            </div>
            <button class="tank-touch-btn fire-btn" id="mP1Fire" style="width: 80px; height: 80px; border-radius: 50%;">FIRE</button>
          </div>

          <!-- Player 2 Controls Card -->
          <div class="tank-control-guide-card tank-glass interactive">
            <div class="tank-guide-col" style="align-items: flex-end; text-align: right;">
              <div class="tank-guide-title p2" id="p2GuideTitle">${this.gameMode === '1P' ? 'AI BOT (AUTONOMOUS)' : 'PLAYER 2'}</div>
              <div class="tank-key-caps">
                <span>Drive:</span> <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
              </div>
              <div class="tank-key-caps">
                <span>Fire Missile:</span> <kbd>Enter</kbd> or <kbd>M</kbd>
              </div>
            </div>
          </div>
        </footer>

        <!-- Round / Match Over Modal -->
        <div class="tank-modal-overlay" id="roundModal" style="display: none;">
          <div class="tank-modal-box tank-glass interactive">
            <div id="winnerEmoji" style="font-size: 3.5rem;"></div>
            <h2 class="tank-modal-title" id="winnerTitle">PLAYER 1 WINS!</h2>
            <p class="tank-modal-sub" id="winnerSubtitle">Dominant missile strikes eliminated the enemy tank!</p>

            <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.2rem; font-weight: 800; color: #38bdf8;" id="finalScoreDisplay">
              P1 [ 0 ]  —  [ 0 ] P2
            </div>

            <button class="primary-btn" id="btnPlayAgain">Next Round →</button>
          </div>
        </div>
      </div>
    `;
  }

  showToast(title, sub, color = '#38bdf8') {
    const toast = document.getElementById('tankToast');
    const tTitle = document.getElementById('tankToastTitle');
    const tSub = document.getElementById('tankToastSub');
    if (!toast || !tTitle || !tSub) return;

    tTitle.textContent = title;
    tTitle.style.color = color;
    tSub.textContent = sub;
    toast.classList.add('show');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  updateHUD() {
    // 1. Health Bars
    const p1Pct = (this.p1.hp / this.p1.maxHp) * 100;
    const p1El = document.getElementById('p1HpBar');
    if (p1El) {
      p1El.style.width = `${p1Pct}%`;
      if (p1Pct > 50) p1El.style.background = 'linear-gradient(90deg, #0284c7, #38bdf8)';
      else if (p1Pct > 25) p1El.style.background = 'linear-gradient(90deg, #ca8a04, #facc15)';
      else p1El.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
    }

    const p2Pct = (this.p2.hp / this.p2.maxHp) * 100;
    const p2El = document.getElementById('p2HpBar');
    if (p2El) {
      p2El.style.width = `${p2Pct}%`;
      if (p2Pct > 50) p2El.style.background = 'linear-gradient(90deg, #ea580c, #fb923c)';
      else if (p2Pct > 25) p2El.style.background = 'linear-gradient(90deg, #ca8a04, #facc15)';
      else p2El.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
    }

    // 2. Ammo Pips
    const p1AmmoEl = document.getElementById('p1Ammo');
    if (p1AmmoEl) {
      const p1Pips = p1AmmoEl.children;
      for (let i = 0; i < 3; i++) {
        if (p1Pips[i]) {
          if (i < this.p1.ammo) p1Pips[i].classList.add('ready');
          else p1Pips[i].classList.remove('ready');
        }
      }
    }

    const p2AmmoEl = document.getElementById('p2Ammo');
    if (p2AmmoEl) {
      const p2Pips = p2AmmoEl.children;
      for (let i = 0; i < 3; i++) {
        if (p2Pips[i]) {
          if (i < this.p2.ammo) p2Pips[i].classList.add('ready');
          else p2Pips[i].classList.remove('ready');
        }
      }
    }

    // 3. Scoreboard & Round Indicator
    const p1ScoreEl = document.getElementById('p1Score');
    const p2ScoreEl = document.getElementById('p2Score');
    const roundEl = document.getElementById('roundText');
    const p2Label = document.getElementById('p2Label');
    const p2GuideTitle = document.getElementById('p2GuideTitle');

    if (p1ScoreEl) p1ScoreEl.textContent = `${this.p1Wins} WINS`;
    if (p2ScoreEl) p2ScoreEl.textContent = `${this.p2Wins} WINS`;
    if (roundEl) roundEl.textContent = this.gameMode === 'PRACTICE' ? 'FREE PRACTICE' : `ROUND ${this.currentRound} / 3`;
    if (p2Label) p2Label.textContent = this.gameMode === '1P' ? 'AI TANK' : 'PLAYER 2';
    if (p2GuideTitle) p2GuideTitle.textContent = this.gameMode === '1P' ? 'AI BOT (AUTONOMOUS)' : 'PLAYER 2';

    // 4. Practice Telemetry
    if (this.gameMode === 'PRACTICE') {
      const hitsEl = document.getElementById('pracHits');
      const accEl = document.getElementById('pracAccuracy');
      const streakEl = document.getElementById('pracStreak');
      if (hitsEl) hitsEl.textContent = this.pracHits;
      if (streakEl) streakEl.textContent = `x${this.pracStreak}`;
      if (accEl) {
        const pct = this.pracShots > 0 ? Math.round((this.pracHits / this.pracShots) * 100) : 100;
        accEl.textContent = `${pct}%`;
      }
    }

    // Bind In-Game Event Listeners Once
    this.bindHUDListeners();
  }

  bindHUDListeners() {
    const btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain && !btnPlayAgain._bound) {
      btnPlayAgain._bound = true;
      btnPlayAgain.addEventListener('click', () => {
        this.initAudio();
        if (this.gameMode === 'PRACTICE') {
          this.enterPracticeMode();
        } else {
          this.resetRound();
        }
      });
    }

    const btnTogglePractice = document.getElementById('btnTogglePractice');
    if (btnTogglePractice && !btnTogglePractice._bound) {
      btnTogglePractice._bound = true;
      btnTogglePractice.addEventListener('click', () => {
        this.initAudio();
        if (this.gameMode === 'PRACTICE') {
          this.enterBattleMode('2P');
        } else {
          this.enterPracticeMode();
        }
      });
    }

    const btnRespawnTargets = document.getElementById('btnRespawnTargets');
    if (btnRespawnTargets && !btnRespawnTargets._bound) {
      btnRespawnTargets._bound = true;
      btnRespawnTargets.addEventListener('click', () => {
        this.initAudio();
        this.spawnPracticeTargets();
        this.spawnObstacles();
        this.showToast("TARGETS RESET!", "New wave of hovering drones and bullseyes ready!", "#10b981");
      });
    }

    const btnCamView = document.getElementById('btnCamView');
    if (btnCamView && !btnCamView._bound) {
      btnCamView._bound = true;
      btnCamView.addEventListener('click', () => {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Tactical Isometric', 'Overhead Arena', 'Dynamic Follow'];
        this.showToast("CAMERA MODE", modes[this.cameraMode], '#94a3b8');
      });
    }

    const btnSound = document.getElementById('btnSoundTank');
    if (btnSound && !btnSound._bound) {
      btnSound._bound = true;
      btnSound.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        btnSound.classList.toggle('is-muted', !this.soundEnabled);
        this.showToast("AUDIO", this.soundEnabled ? "Sound Effects ON" : "Sound Muted", this.soundEnabled ? '#10b981' : '#ef4444');
      });
    }

    // Touch controls
    const bindTouch = (id, code) => {
      const btn = document.getElementById(id);
      if (btn && !btn._bound) {
        btn._bound = true;
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.initAudio();
          this.keys[code] = true;
        });
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          this.keys[code] = false;
        });
      }
    };

    bindTouch('mP1Up', 'KeyW');
    bindTouch('mP1Down', 'KeyS');
    bindTouch('mP1Left', 'KeyA');
    bindTouch('mP1Right', 'KeyD');

    const mFire = document.getElementById('mP1Fire');
    if (mFire && !mFire._bound) {
      mFire._bound = true;
      mFire.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.initAudio();
        if (!this.matchOver) {
          const m = this.p1.fireMissile();
          if (m) this.activeMissiles.push(m);
        }
      });
    }
  }

  getControlsGuide() {
    return [
      { label: 'Player 1 Drive & Steer', keys: 'W A S D' },
      { label: 'Player 1 Fire Missiles', keys: 'Space or F' },
      { label: 'Player 2 Drive & Steer', keys: 'Arrow Keys (↑ ← ↓ →)' },
      { label: 'Player 2 Fire Missiles', keys: 'Enter or M or Numpad 0' },
      { label: 'Cycle Camera Perspective', keys: 'Button in Top Bar or [C]' },
      { label: 'Tournament Rule', keys: 'Strictly 3 Rounds per Championship Match' },
      { label: 'Solo Practice Range', keys: 'Freely practice against drones & targets' }
    ];
  }

  destroy() {
    super.destroy();

    if (this._keyDownHandler) window.removeEventListener('keydown', this._keyDownHandler);
    if (this._keyUpHandler) window.removeEventListener('keyup', this._keyUpHandler);
    if (this._blurHandler) window.removeEventListener('blur', this._blurHandler);

    // Remove meshes
    if (this.p1 && this.p1.mesh) this.scene.remove(this.p1.mesh);
    if (this.p2 && this.p2.mesh) this.scene.remove(this.p2.mesh);

    for (let m of this.activeMissiles) this.scene.remove(m.mesh);
    this.activeMissiles.length = 0;

    for (let p of this.particles) {
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    }
    this.particles.length = 0;

    if (this.obstacleGroup) {
      while (this.obstacleGroup.children.length > 0) {
        this.obstacleGroup.remove(this.obstacleGroup.children[0]);
      }
    }
    if (this.practiceGroup) {
      while (this.practiceGroup.children.length > 0) {
        this.practiceGroup.remove(this.practiceGroup.children[0]);
      }
    }
    if (this.treadMarksGroup) {
      while (this.treadMarksGroup.children.length > 0) {
        this.treadMarksGroup.remove(this.treadMarksGroup.children[0]);
      }
    }
    if (this.craterGroup) {
      while (this.craterGroup.children.length > 0) {
        this.craterGroup.remove(this.craterGroup.children[0]);
      }
    }

    if (this._toastTimer) clearTimeout(this._toastTimer);
  }
}
