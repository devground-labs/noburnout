import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import {
  buildOperativeMesh,
  buildEnforcerMesh,
  buildSecurityCameraMesh,
  buildTerminalMesh
} from './CharacterModel.js';

export class ShadowOperativeGame extends BaseGame {
  constructor() {
    super({
      id: 'shadow-operative',
      name: 'Shadow Operative',
      subtitle: 'Megacorp Cyber Heist',
      description: 'Infiltrate high-security corporate vault labs. Evade laser tripwires, hack security sub-nodes, distract patrol enforcers, and extract the Quantum Core without triggering lockdown.',
      icon: '🕵️',
      badge: 'Tactical Stealth 3D',
      genre: 'Stealth / Tactical',
      players: '1 Player',
      modes: ['Infiltration (Normal)', 'Ghost Protocol (Hard)', 'Speedrun Heist']
    });

    // Operative State
    this.player = null;
    this.playerPos = new THREE.Vector3(-22, 0, -22);
    this.playerVelocity = new THREE.Vector3();
    this.playerRot = 0;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isHacking = false;
    this.hackProgress = 0;
    this.targetTerminal = null;

    // Movement speeds
    this.WALK_SPEED = 6.8;
    this.SNEAK_SPEED = 3.6;
    this.SPRINT_SPEED = 9.8;

    // Stealth & Alert Mechanics
    this.suspicion = 0; // 0 to 100
    this.isAlarmActive = false;
    this.alarmTimer = 0;
    this.lockdownCooldown = 0;
    this.takedowns = 0;
    this.nodesHacked = 0;
    this.totalNodes = 3;
    this.vaultUnlocked = false;
    this.vaultSecured = false;
    this.missionWon = false;
    this.missionFailed = false;
    this.missionTime = 0;

    // Camera Mode (0: Tactical Isometric, 1: Over-Shoulder, 2: Top-Down Security)
    this.cameraMode = 0;

    // World Entities
    this.guards = [];
    this.cameras = [];
    this.terminals = [];
    this.lasers = [];
    this.walls = [];
    this.noiseRipples = [];
    this.decoys = [];
    this.particles = [];

    // Synthesizer Web Audio
    this.audioCtx = null;
    this.soundEnabled = true;
    this.ambientGain = null;
    this.alarmGain = null;

    // Input tracker
    this.keys = {};
  }

  // =========================================================================
  // Audio Synthesizer (Atmospheric Stealth & Dynamic Alarm)
  // =========================================================================
  initAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      // Master Ambient Bus
      this.ambientGain = this.audioCtx.createGain();
      this.ambientGain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
      this.ambientGain.connect(this.audioCtx.destination);

      // Start atmospheric drone
      this.startAmbientDrone();
    } catch (e) {
      console.warn('Web Audio not supported:', e);
    }
  }

  startAmbientDrone() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;

    const osc1 = this.audioCtx.createOscillator();
    const osc2 = this.audioCtx.createOscillator();
    const filter = this.audioCtx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55, now); // A1 bass drone

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(55.5, now); // Subtle beating

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, now);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(this.ambientGain);

    osc1.start(now);
    osc2.start(now);
    this._droneOsc1 = osc1;
    this._droneOsc2 = osc2;
  }

  playSfxTakedown() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playSfxDecoy() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playSfxHackBeep() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(580 + Math.random() * 400, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playSfxSuccess() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.22, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.35);
    });
  }

  playSfxAlarmStinger() {
    if (!this.audioCtx || !this.soundEnabled) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(350, now + 0.3);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // =========================================================================
  // Game Initialization & Facility World Construction
  // =========================================================================
  async init(engine) {
    await super.init(engine);

    // Dark sleek cyberpunk facility background & gentle atmospheric fog
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.006);

    // Setup High-Tech Facility Lighting
    const ambientLight = new THREE.AmbientLight(0x475569, 1.2);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.9);
    this.scene.add(hemiLight);

    // Main Overhead Skylight Key Light
    const mainSun = new THREE.DirectionalLight(0xf8fafc, 2.0);
    mainSun.position.set(20, 36, 15);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 100;
    const shadowSize = 35;
    mainSun.shadow.camera.left = -shadowSize;
    mainSun.shadow.camera.right = shadowSize;
    mainSun.shadow.camera.top = shadowSize;
    mainSun.shadow.camera.bottom = -shadowSize;
    this.scene.add(mainSun);

    // Accent Cyber Rim Lights (Sector identification)
    const redAlarmLight = new THREE.PointLight(0xf43f5e, 1.5, 30);
    redAlarmLight.position.set(0, 10, 0);
    this.scene.add(redAlarmLight);
    this.centerAlarmLight = redAlarmLight;

    // Build Modular High-Tech Facility
    this.buildFacilityFloor();
    this.buildFacilityWallsAndCover();
    this.buildLaserGrids();
    this.setupTerminalsAndVault();
    this.setupCameras();
    this.setupGuards();

    // Spawn Operative Player Character
    this.player = buildOperativeMesh(0x0f172a, 0xf43f5e);
    this.player.position.copy(this.playerPos);
    this.scene.add(this.player);

    // Camera initial position
    this.camera.position.set(this.playerPos.x, 26, this.playerPos.z + 20);
    this.camera.lookAt(this.playerPos.x, 1.2, this.playerPos.z);

    // Setup Keyboard Listeners
    this.setupKeyboardListeners();
  }

  buildFacilityFloor() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    const ctx = c.getContext('2d');

    // Dark titanium metallic tile base
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Tactical square floor grid with reflective borders
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 2;
    const tileSize = 64;
    for (let y = 0; y < 1024; y += tileSize) {
      for (let x = 0; x < 1024; x += tileSize) {
        ctx.strokeRect(x, y, tileSize, tileSize);
      }
    }

    // High-Security Sector Markings & Cyber Circuit Trails
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(128, 128, 768, 768);
    ctx.strokeRect(384, 384, 256, 256); // Central vault chamber

    // Caution Hazard Border
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(380, 380, 264, 264);

    // Center Vault Inscription
    ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.font = '800 22px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QUANTUM VAULT CORE', 512, 512);

    const floorTex = new THREE.CanvasTexture(c);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.25,
      metalness: 0.55
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  buildFacilityWallsAndCover() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.35
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.25
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      metalness: 0.2,
      roughness: 0.1
    });

    const wallH = 4.2;

    const addWall = (x, z, w, d) => {
      const g = new THREE.Group();
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      wallMesh.position.y = wallH / 2;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      g.add(wallMesh);

      // Top neon status rail
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(w > d ? w : 0.2, 0.12, d > w ? d : 0.2),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
      );
      rail.position.y = wallH + 0.06;
      g.add(rail);

      g.position.set(x, 0, z);
      this.scene.add(g);

      this.walls.push({
        box: new THREE.Box2(
          new THREE.Vector2(x - w / 2, z - d / 2),
          new THREE.Vector2(x + w / 2, z + d / 2)
        )
      });
    };

    const addPillar = (x, z, r = 1.0) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(r * 2, wallH, r * 2), capMat);
      col.position.set(x, wallH / 2, z);
      col.castShadow = true;
      col.receiveShadow = true;
      this.scene.add(col);

      this.walls.push({
        box: new THREE.Box2(
          new THREE.Vector2(x - r, z - r),
          new THREE.Vector2(x + r, z + r)
        )
      });
    };

    // 1. Perimeter Arena Boundaries (64x64)
    addWall(0, -32, 64, 1.8);
    addWall(0, 32, 64, 1.8);
    addWall(-32, 0, 1.8, 64);
    addWall(32, 0, 1.8, 64);

    // 2. Central Vault Room Walls (with entrances)
    addWall(-7.5, -8, 7, 1.2);
    addWall(7.5, -8, 7, 1.2);
    addWall(-7.5, 8, 7, 1.2);
    addWall(7.5, 8, 7, 1.2);
    addWall(-8, 0, 1.2, 8);
    addWall(8, 0, 1.2, 8);

    // 3. Sector Corridors & Tactical Cover
    // Server Room Alpha (Top-Left)
    addWall(-18, -16, 12, 1.2);
    addPillar(-12, -22, 0.9);
    addPillar(-22, -12, 0.9);

    // Laser Corridor Beta (Top-Right)
    addWall(16, -16, 14, 1.2);
    addPillar(20, -8, 0.9);
    addPillar(20, -24, 0.9);

    // Cyber Archive Gamma (Bottom-Left)
    addWall(-16, 16, 12, 1.2);
    addPillar(-8, 20, 0.9);
    addPillar(-24, 20, 0.9);

    // Extraction Landing Pad (Bottom-Right)
    addWall(18, 16, 12, 1.2);
    addPillar(14, 24, 0.9);
    addPillar(24, 14, 0.9);

    // Glowing Server Racks for Cover
    const createServerRack = (x, z) => {
      const rack = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.9), capMat);
      body.position.y = 1.4;
      body.castShadow = true;
      rack.add(body);

      // Blinking status LED rows
      for (let y = 0.6; y < 2.5; y += 0.4) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.08, 0.1),
          new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x10b981 : 0x06b6d4 })
        );
        led.position.set(0, y, 0.46);
        rack.add(led);
      }
      rack.position.set(x, 0, z);
      this.scene.add(rack);

      this.walls.push({
        box: new THREE.Box2(
          new THREE.Vector2(x - 0.8, z - 0.45),
          new THREE.Vector2(x + 0.8, z + 0.45)
        )
      });
    };

    createServerRack(-20, -18);
    createServerRack(-16, -24);
    createServerRack(22, -18);
    createServerRack(-18, 22);
    createServerRack(16, 22);
  }

  buildLaserGrids() {
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85
    });

    const createLaserGrid = (start, end, axis = 'x') => {
      const g = new THREE.Group();
      const length = start.distanceTo(end);
      const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, length, 8);

      for (let y = 0.5; y <= 2.2; y += 0.6) {
        const beam = new THREE.Mesh(beamGeo, laserMat);
        beam.position.y = y;
        if (axis === 'x') beam.rotation.z = Math.PI / 2;
        else beam.rotation.x = Math.PI / 2;
        g.add(beam);
      }

      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      g.position.copy(mid);
      this.scene.add(g);

      this.lasers.push({
        mesh: g,
        mat: laserMat,
        start,
        end,
        axis,
        active: true,
        timer: Math.random() * 3.0,
        cycle: 4.5 // 3s active, 1.5s down
      });
    };

    createLaserGrid(new THREE.Vector3(12, 0, -8), new THREE.Vector3(18, 0, -8), 'x');
    createLaserGrid(new THREE.Vector3(-8, 0, 10), new THREE.Vector3(-8, 0, 16), 'z');
  }

  setupTerminalsAndVault() {
    // 1. Central Quantum Vault Core
    const vault = buildTerminalMesh('VAULT_CORE', true);
    vault.position.set(0, 0, 0);
    this.scene.add(vault);
    this.vaultMesh = vault;

    // 2. Three Security Terminals
    const tAlpha = buildTerminalMesh('NODE_ALPHA', false);
    tAlpha.position.set(-24, 0, -24);
    this.scene.add(tAlpha);
    this.terminals.push({ id: 'alpha', name: 'Server Node Alpha', mesh: tAlpha, pos: tAlpha.position, hacked: false });

    const tBeta = buildTerminalMesh('NODE_BETA', false);
    tBeta.position.set(24, 0, -22);
    this.scene.add(tBeta);
    this.terminals.push({ id: 'beta', name: 'Laser Grid Node Beta', mesh: tBeta, pos: tBeta.position, hacked: false });

    const tGamma = buildTerminalMesh('NODE_GAMMA', false);
    tGamma.position.set(-22, 0, 24);
    this.scene.add(tGamma);
    this.terminals.push({ id: 'gamma', name: 'Archive Node Gamma', mesh: tGamma, pos: tGamma.position, hacked: false });
  }

  setupCameras() {
    const addCam = (x, y, z, angle, rotRange = Math.PI / 3) => {
      const cam = buildSecurityCameraMesh();
      cam.position.set(x, y, z);
      cam.rotation.y = angle;
      this.scene.add(cam);

      this.cameras.push({
        mesh: cam,
        baseAngle: angle,
        rotRange,
        speed: 0.9,
        timer: Math.random() * 5,
        pos: new THREE.Vector3(x, 0, z),
        alertTimer: 0
      });
    };

    addCam(-8, 4.0, -12, Math.PI / 2);
    addCam(12, 4.0, -14, -Math.PI / 2);
    addCam(-14, 4.0, 12, 0);
    addCam(0, 4.0, 8, Math.PI);
  }

  setupGuards() {
    const addGuard = (waypoints) => {
      const mesh = buildEnforcerMesh(0xf59e0b);
      const start = waypoints[0];
      mesh.position.set(start.x, 0, start.z);
      this.scene.add(mesh);

      this.guards.push({
        mesh,
        waypoints,
        currentWp: 0,
        pos: new THREE.Vector3(start.x, 0, start.z),
        dir: new THREE.Vector3(1, 0, 0),
        state: 'PATROL', // PATROL, SUSPICIOUS, CHASE, SEARCH, DOWN
        alertLevel: 0, // 0 to 1
        speed: 3.2,
        fov: Math.PI / 2.8, // 65 deg
        viewDist: 14.0,
        investigateTarget: null,
        investigateTimer: 0,
        isDown: false
      });
    };

    // Patrol Guard 1: Patrols Sector Alpha (Server Room)
    addGuard([
      { x: -14, z: -14 },
      { x: -24, z: -14 },
      { x: -24, z: -26 },
      { x: -14, z: -26 }
    ]);

    // Patrol Guard 2: Patrols Sector Beta (Laser Corridor)
    addGuard([
      { x: 14, z: -12 },
      { x: 26, z: -12 },
      { x: 26, z: -24 },
      { x: 14, z: -24 }
    ]);

    // Patrol Guard 3: Central Perimeter Ring
    addGuard([
      { x: -11, z: 0 },
      { x: 0, z: -11 },
      { x: 11, z: 0 },
      { x: 0, z: 11 }
    ]);

    // Patrol Guard 4: Sector Gamma (Cyber Archives)
    addGuard([
      { x: -12, z: 14 },
      { x: -24, z: 14 },
      { x: -24, z: 26 },
      { x: -12, z: 26 }
    ]);
  }

  // =========================================================================
  // Game Loop & Mechanics Simulation
  // =========================================================================
  start(mode = 'Infiltration (Normal)') {
    super.start(mode);
    this.initAudio();

    this.suspicion = 0;
    this.isAlarmActive = false;
    this.alarmTimer = 0;
    this.lockdownCooldown = 0;
    this.takedowns = 0;
    this.nodesHacked = 0;
    this.vaultUnlocked = false;
    this.vaultSecured = false;
    this.missionWon = false;
    this.missionFailed = false;
    this.missionTime = 0;

    // Reset player position
    this.playerPos.set(-24, 0, 24);
    if (this.player) {
      this.player.position.copy(this.playerPos);
      this.player.visible = true;
    }

    this.showToast('GHOST INFILTRATION', 'Hack all 3 Security Nodes to open the Quantum Vault!', '#38bdf8');
  }

  update(dt, input) {
    if (this.isPaused || this.missionWon || this.missionFailed) return;

    this.missionTime += dt;

    // 1. Player Movement & Physics
    this.processPlayerMovement(dt);

    // 2. Laser Grids Toggle Simulation
    this.updateLasers(dt);

    // 3. Security Cameras Sweep & Vision Detection
    this.updateCameras(dt);

    // 4. Guard Patrol, AI Vision & Noise Investigation
    this.updateGuards(dt);

    // 5. Sound Ripples & Decoy Grenades
    this.updateNoiseAndDecoys(dt);

    // 6. Terminal Hacking & Vault Core Check
    this.updateHacking(dt);

    // 7. Global Alert / Alarm Cooldown
    this.updateAlarmState(dt);

    // 8. Camera Positioning
    this.updateCameraPosition();
  }

  processPlayerMovement(dt) {
    const moveX = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const moveZ = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);

    this.isSneaking = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'] || !!this.keys['KeyC_SNEAK'];
    this.isSprinting = !this.isSneaking && !!this.keys['Space_SPRINT'];

    const targetSpeed = this.isSneaking ? this.SNEAK_SPEED : (this.isSprinting ? this.SPRINT_SPEED : this.WALK_SPEED);

    const inputVec = new THREE.Vector2(moveX, moveZ);
    if (inputVec.lengthSq() > 0) {
      inputVec.normalize();

      // Smooth acceleration
      this.playerVelocity.x = THREE.MathUtils.lerp(this.playerVelocity.x, inputVec.x * targetSpeed, dt * 10);
      this.playerVelocity.z = THREE.MathUtils.lerp(this.playerVelocity.z, inputVec.y * targetSpeed, dt * 10);

      // Rotate player towards velocity direction
      const angle = Math.atan2(inputVec.x, inputVec.y);
      this.playerRot = THREE.MathUtils.lerp(this.playerRot, angle, dt * 12);
      this.player.rotation.y = this.playerRot;

      // Animate limb swings
      if (this.player.userData.leftLeg) {
        const t = performance.now() * 0.012 * (targetSpeed / this.WALK_SPEED);
        this.player.userData.leftLeg.rotation.x = Math.sin(t) * 0.5;
        this.player.userData.rightLeg.rotation.x = -Math.sin(t) * 0.5;
        this.player.userData.leftArm.rotation.x = -Math.sin(t) * 0.4;
      }

      // Footstep Sound Propagation (Running alerts guards!)
      if (!this.isSneaking && Math.random() < (this.isSprinting ? 0.35 : 0.15)) {
        this.spawnNoiseRipple(this.playerPos.clone(), this.isSprinting ? 12 : 6);
      }
    } else {
      this.playerVelocity.x = THREE.MathUtils.lerp(this.playerVelocity.x, 0, dt * 14);
      this.playerVelocity.z = THREE.MathUtils.lerp(this.playerVelocity.z, 0, dt * 14);

      if (this.player.userData.leftLeg) {
        this.player.userData.leftLeg.rotation.x = 0;
        this.player.userData.rightLeg.rotation.x = 0;
        this.player.userData.leftArm.rotation.x = 0;
      }
    }

    // Apply movement with wall collision bounds
    const nextX = this.playerPos.x + this.playerVelocity.x * dt;
    const nextZ = this.playerPos.z + this.playerVelocity.z * dt;

    if (!this.checkWallCollision(nextX, this.playerPos.z, 0.55)) {
      this.playerPos.x = nextX;
    }
    if (!this.checkWallCollision(this.playerPos.x, nextZ, 0.55)) {
      this.playerPos.z = nextZ;
    }

    this.player.position.copy(this.playerPos);

    // Dynamic stealth ring opacity (tighter and dimmer when sneaking)
    if (this.player.userData.stealthRing) {
      this.player.userData.stealthRing.scale.setScalar(this.isSneaking ? 0.75 : (this.isSprinting ? 1.4 : 1.0));
    }
  }

  checkWallCollision(x, z, radius = 0.55) {
    const pBox = new THREE.Box2(
      new THREE.Vector2(x - radius, z - radius),
      new THREE.Vector2(x + radius, z + radius)
    );

    for (const w of this.walls) {
      if (w.box.intersectsBox(pBox)) return true;
    }
    return false;
  }

  hasLineOfSight(fromPos, toPos) {
    // 2D raycast check against wall boxes
    const dir = new THREE.Vector2(toPos.x - fromPos.x, toPos.z - fromPos.z);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.normalize();

    const steps = Math.ceil(dist / 0.8);
    for (let i = 1; i < steps; i++) {
      const testPoint = new THREE.Vector2(
        fromPos.x + dir.x * (i * 0.8),
        fromPos.z + dir.y * (i * 0.8)
      );
      for (const w of this.walls) {
        if (w.box.containsPoint(testPoint)) return false;
      }
    }
    return true;
  }

  updateLasers(dt) {
    for (const l of this.lasers) {
      l.timer += dt;
      if (l.timer >= l.cycle) l.timer = 0;

      // Active for 70% of cycle, off for 30%
      l.active = (l.timer < l.cycle * 0.7);
      l.mesh.visible = l.active;

      // Pulse glow
      if (l.active) {
        l.mat.opacity = 0.65 + Math.sin(performance.now() * 0.01) * 0.25;

        // Check if player walks through active laser beam
        const distToStart = new THREE.Vector2(this.playerPos.x, this.playerPos.z).distanceTo(new THREE.Vector2(l.start.x, l.start.z));
        const distToEnd = new THREE.Vector2(this.playerPos.x, this.playerPos.z).distanceTo(new THREE.Vector2(l.end.x, l.end.z));
        const lineLen = new THREE.Vector2(l.start.x, l.start.z).distanceTo(new THREE.Vector2(l.end.x, l.end.z));

        if (distToStart + distToEnd < lineLen + 0.65) {
          this.triggerAlarm('LASER TRIPWIRE TRIGGERED! 🚨');
        }
      }
    }
  }

  updateCameras(dt) {
    for (const cam of this.cameras) {
      cam.timer += dt * cam.speed;
      const angleOffset = Math.sin(cam.timer) * cam.rotRange;
      cam.mesh.userData.head.rotation.y = angleOffset;

      // Calculate camera look direction
      const totalAngle = cam.baseAngle + angleOffset;
      const forward = new THREE.Vector2(Math.sin(totalAngle), Math.cos(totalAngle));

      const toPlayer = new THREE.Vector2(this.playerPos.x - cam.pos.x, this.playerPos.z - cam.pos.z);
      const dist = toPlayer.length();

      if (dist < 14.0) {
        toPlayer.normalize();
        const dot = forward.dot(toPlayer);
        // Inside ~55 deg cone and has line of sight
        if (dot > 0.65 && this.hasLineOfSight(cam.pos, this.playerPos)) {
          cam.alertTimer += dt * 1.8;
          cam.mesh.userData.coneMat.color.setHex(0xef4444);
          cam.mesh.userData.ledMat.color.setHex(0xef4444);
          this.addSuspicion(dt * 35);
          if (cam.alertTimer > 2.0) {
            this.triggerAlarm('SURVEILLANCE CAMERA DETECTED OPERATIVE! 🚨');
          }
        } else {
          cam.alertTimer = Math.max(0, cam.alertTimer - dt);
          cam.mesh.userData.coneMat.color.setHex(0x38bdf8);
          cam.mesh.userData.ledMat.color.setHex(0x38bdf8);
        }
      }
    }
  }

  updateGuards(dt) {
    for (const g of this.guards) {
      if (g.isDown) continue;

      // 1. Guard Vision Detection
      const toPlayer = new THREE.Vector3().subVectors(this.playerPos, g.pos);
      const distToPlayer = toPlayer.length();

      // Guard Forward Vector
      const fwd = new THREE.Vector3(Math.sin(g.mesh.rotation.y), 0, Math.cos(g.mesh.rotation.y));
      toPlayer.normalize();
      const dot = fwd.dot(toPlayer);

      let canSeePlayer = false;
      if (distToPlayer < g.viewDist && dot > Math.cos(g.fov / 2)) {
        if (this.hasLineOfSight(g.pos, this.playerPos)) {
          canSeePlayer = true;
        }
      }

      if (canSeePlayer) {
        const rate = (this.isSprinting ? 60 : (this.isSneaking ? 22 : 38)) * (1 - distToPlayer / g.viewDist);
        this.addSuspicion(dt * rate);

        g.state = 'CHASE';
        g.alertLevel = 1.0;
        g.mesh.userData.coneMat.color.setHex(0xef4444);
        g.mesh.userData.eyeVisorMat.color.setHex(0xef4444);
        g.mesh.userData.alertBadge.visible = true;

        if (this.suspicion >= 100) {
          this.triggerAlarm('PATROL ENFORCER SPOTTED OPERATIVE! 🚨');
        }
      } else if (g.state !== 'CHASE') {
        g.mesh.userData.coneMat.color.setHex(0xf59e0b);
        g.mesh.userData.eyeVisorMat.color.setHex(0xf59e0b);
        g.mesh.userData.alertBadge.visible = false;
      }

      // 2. Guard State Machine Movement
      if (g.state === 'CHASE' || this.isAlarmActive) {
        // Sprint directly towards player
        const dir = new THREE.Vector3().subVectors(this.playerPos, g.pos).normalize();
        g.pos.x += dir.x * (g.speed * 1.4) * dt;
        g.pos.z += dir.z * (g.speed * 1.4) * dt;
        g.mesh.rotation.y = Math.atan2(dir.x, dir.z);

        // Caught by guard!
        if (distToPlayer < 1.4) {
          this.failMission('CAPTURED BY CORPORATE ENFORCER!');
          return;
        }
      } else if (g.state === 'INVESTIGATE') {
        // Walk towards distraction / noise ripple
        if (g.investigateTarget) {
          const dir = new THREE.Vector3().subVectors(g.investigateTarget, g.pos);
          if (dir.length() > 0.8) {
            dir.normalize();
            g.pos.x += dir.x * g.speed * dt;
            g.pos.z += dir.z * g.speed * dt;
            g.mesh.rotation.y = Math.atan2(dir.x, dir.z);
          } else {
            g.investigateTimer -= dt;
            if (g.investigateTimer <= 0) {
              g.state = 'PATROL';
            }
          }
        }
      } else {
        // Standard Waypoint Patrol
        const targetWp = g.waypoints[g.currentWp];
        const dir = new THREE.Vector3(targetWp.x - g.pos.x, 0, targetWp.z - g.pos.z);
        const dist = dir.length();

        if (dist > 0.5) {
          dir.normalize();
          g.pos.x += dir.x * g.speed * dt;
          g.pos.z += dir.z * g.speed * dt;
          g.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        } else {
          g.currentWp = (g.currentWp + 1) % g.waypoints.length;
        }
      }

      g.mesh.position.copy(g.pos);

      // Animate guard legs
      if (g.mesh.userData.leftLeg) {
        const t = performance.now() * 0.008;
        g.mesh.userData.leftLeg.rotation.x = Math.sin(t) * 0.45;
        g.mesh.userData.rightLeg.rotation.x = -Math.sin(t) * 0.45;
      }
    }
  }

  // Stealth Takedown Mechanism
  attemptTakedown() {
    let nearestGuard = null;
    let minDist = 2.6;

    for (const g of this.guards) {
      if (g.isDown) continue;
      const dist = this.playerPos.distanceTo(g.pos);
      if (dist < minDist) {
        // Check if player is behind guard (tactical stealth condition)
        const gFwd = new THREE.Vector3(Math.sin(g.mesh.rotation.y), 0, Math.cos(g.mesh.rotation.y));
        const toPlayer = new THREE.Vector3().subVectors(this.playerPos, g.pos).normalize();
        const dot = gFwd.dot(toPlayer);

        // Dot < 0.2 means behind or flanking the guard!
        if (dot < 0.25 || this.isSneaking) {
          minDist = dist;
          nearestGuard = g;
        }
      }
    }

    if (nearestGuard) {
      nearestGuard.isDown = true;
      nearestGuard.state = 'DOWN';
      nearestGuard.mesh.rotation.x = Math.PI / 2; // Knocked out flat on back
      nearestGuard.mesh.position.y = 0.25;
      nearestGuard.mesh.userData.flashlight.intensity = 0.2;
      nearestGuard.mesh.userData.visionCone.visible = false;
      nearestGuard.mesh.userData.alertBadge.visible = false;

      this.takedowns++;
      this.playSfxTakedown();
      this.showToast('SILENT TAKEDOWN ⚡', 'Corporate enforcer neutralized without sound!', '#10b981');
      return true;
    }
    return false;
  }

  // EMP Distraction Grenade
  throwDecoy() {
    this.playSfxDecoy();
    const throwDir = new THREE.Vector3(Math.sin(this.playerRot), 0, Math.cos(this.playerRot));
    const targetPos = this.playerPos.clone().add(throwDir.multiplyScalar(8.5));

    // Spawn decoy projectile
    const geo = new THREE.SphereGeometry(0.2, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this.playerPos);
    mesh.position.y = 1.0;
    this.scene.add(mesh);

    this.decoys.push({
      mesh,
      pos: this.playerPos.clone(),
      targetPos,
      timer: 0,
      life: 0.6
    });

    this.showToast('EMP DECOY DEPLOYED ⚡', 'Guards drawn to examine sonic noise emitter!', '#38bdf8');
  }

  spawnNoiseRipple(pos, radius = 8) {
    const ringGeo = new THREE.RingGeometry(0.2, 0.4, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.05, pos.z);
    this.scene.add(ring);

    this.noiseRipples.push({
      mesh: ring,
      mat: ringMat,
      scale: 1,
      maxScale: radius,
      pos: pos.clone()
    });

    // Alert nearby guards to investigate
    for (const g of this.guards) {
      if (g.isDown || g.state === 'CHASE') continue;
      const d = g.pos.distanceTo(pos);
      if (d < radius && this.hasLineOfSight(g.pos, pos)) {
        g.state = 'INVESTIGATE';
        g.investigateTarget = pos.clone();
        g.investigateTimer = 3.5;
      }
    }
  }

  updateNoiseAndDecoys(dt) {
    // Expand sound rings
    for (let i = this.noiseRipples.length - 1; i >= 0; i--) {
      const r = this.noiseRipples[i];
      r.scale += dt * 14;
      r.mesh.scale.setScalar(r.scale);
      r.mat.opacity = Math.max(0, 0.6 * (1 - r.scale / r.maxScale));

      if (r.scale >= r.maxScale) {
        this.scene.remove(r.mesh);
        this.noiseRipples.splice(i, 1);
      }
    }

    // Move decoys
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.timer += dt;
      const p = Math.min(1, d.timer / d.life);
      d.mesh.position.lerpVectors(d.pos, d.targetPos, p);
      d.mesh.position.y = 1.0 + Math.sin(p * Math.PI) * 2.0;

      if (p >= 1) {
        this.spawnNoiseRipple(d.targetPos, 14);
        this.scene.remove(d.mesh);
        this.decoys.splice(i, 1);
      }
    }
  }

  updateHacking(dt) {
    // Check if player is near any terminal or vault
    let nearTerm = null;
    for (const t of this.terminals) {
      if (t.hacked) continue;
      const dist = this.playerPos.distanceTo(t.pos);
      if (dist < 2.5) {
        nearTerm = t;
        break;
      }
    }

    // Check Vault Core
    let nearVault = false;
    if (this.vaultUnlocked && !this.vaultSecured) {
      if (this.playerPos.distanceTo(new THREE.Vector3(0, 0, 0)) < 3.2) {
        nearVault = true;
      }
    }

    const isHoldE = !!this.keys['KeyE'] || !!this.keys['KeyE_HACK'];

    if ((nearTerm || nearVault) && isHoldE) {
      this.isHacking = true;
      this.hackProgress += dt * 38; // ~2.6 seconds to hack

      if (Math.random() < 0.25) this.playSfxHackBeep();

      if (this.hackProgress >= 100) {
        this.hackProgress = 0;
        this.isHacking = false;

        if (nearTerm) {
          nearTerm.hacked = true;
          nearTerm.mesh.userData.screenMat.color.setHex(0x10b981);
          nearTerm.mesh.userData.groundRing.material.color.setHex(0x10b981);
          this.nodesHacked++;
          this.playSfxSuccess();
          this.showToast(`NODE DECRYPTED (${this.nodesHacked}/3) 💾`, `${nearTerm.name} bypassed!`, '#10b981');

          if (this.nodesHacked >= this.totalNodes) {
            this.vaultUnlocked = true;
            this.vaultMesh.userData.core.material.color.setHex(0x10b981);
            this.showToast('QUANTUM VAULT UNLOCKED! 🔓', 'Extract the Quantum Core from the central chamber!', '#f59e0b');
          }
        } else if (nearVault) {
          this.vaultSecured = true;
          this.winMission();
        }
      }
    } else {
      if (!isHoldE) this.hackProgress = 0;
      this.isHacking = false;
    }

    this.targetTerminal = nearTerm;
    this.nearVault = nearVault;

    // Vault core continuous floating rotation
    if (this.vaultMesh && this.vaultMesh.userData.core) {
      this.vaultMesh.userData.core.rotation.y += dt * 0.8;
      this.vaultMesh.userData.core.rotation.x += dt * 0.4;
    }
  }

  addSuspicion(amount) {
    this.suspicion = Math.min(100, this.suspicion + amount);
  }

  updateAlarmState(dt) {
    if (this.isAlarmActive) {
      this.alarmTimer += dt;
      // Strobe red alarm light in room center
      if (this.centerAlarmLight) {
        this.centerAlarmLight.intensity = 1.0 + Math.sin(this.alarmTimer * 12) * 2.2;
      }

      // Alarm cooldown if player broke line of sight for 8 seconds
      this.lockdownCooldown += dt;
      if (this.lockdownCooldown > 9.0) {
        this.isAlarmActive = false;
        this.suspicion = 40; // cool down to caution
        this.lockdownCooldown = 0;
        if (this.centerAlarmLight) this.centerAlarmLight.intensity = 0;
        this.showToast('LOCKDOWN CLEARED', 'Guards lost your trail. Return to shadows!', '#38bdf8');
      }
    } else {
      if (this.suspicion > 0 && !this.isHacking) {
        this.suspicion = Math.max(0, this.suspicion - dt * 14);
      }
    }
  }

  triggerAlarm(reason = 'SECURITY LOCKDOWN TRIGGERED! 🚨') {
    if (this.isAlarmActive) return;
    this.isAlarmActive = true;
    this.suspicion = 100;
    this.lockdownCooldown = 0;
    this.playSfxAlarmStinger();
    this.showToast('ALARM! LOCKDOWN INITIATED 🚨', reason, '#ef4444');
  }

  updateCameraPosition() {
    if (this.cameraMode === 0) {
      // Tactical Isometric (smooth center lead)
      const targetX = this.playerPos.x;
      const targetY = 22;
      const targetZ = this.playerPos.z + 18;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, 0.08);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, 0.08);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, 0.08);
      this.camera.lookAt(this.playerPos.x, 1.2, this.playerPos.z);
    } else if (this.cameraMode === 1) {
      // Over-the-Shoulder Stealth Chase
      const camDist = 6.5;
      const targetX = this.playerPos.x - Math.sin(this.playerRot) * camDist;
      const targetZ = this.playerPos.z - Math.cos(this.playerRot) * camDist;
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, 0.12);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 4.2, 0.12);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, 0.12);
      this.camera.lookAt(this.playerPos.x, 1.6, this.playerPos.z);
    } else {
      // Security Blueprint (Bird's Eye Top-Down)
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.playerPos.x, 0.1);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 34, 0.1);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, this.playerPos.z, 0.1);
      this.camera.lookAt(this.playerPos.x, 0, this.playerPos.z);
    }
  }

  winMission() {
    this.missionWon = true;
    this.playSfxSuccess();

    const modal = document.getElementById('heistWinModal');
    const timeEl = document.getElementById('heistWinTime');
    const takedownsEl = document.getElementById('heistWinTakedowns');
    const rankEl = document.getElementById('heistWinRank');

    if (timeEl) timeEl.textContent = `${this.missionTime.toFixed(1)}s`;
    if (takedownsEl) takedownsEl.textContent = `${this.takedowns} Silent Takedowns`;

    let rank = 'GHOST [S-RANK]';
    if (this.isAlarmActive || this.suspicion > 60) rank = 'SHADOW [A-RANK]';
    if (this.takedowns >= 3) rank = 'INFILTRATOR [B-RANK]';
    if (rankEl) rankEl.textContent = rank;

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  failMission(reason = 'SECURITY COMPROMISED') {
    this.missionFailed = true;
    this.playSfxAlarmStinger();

    const modal = document.getElementById('heistFailModal');
    const reasonEl = document.getElementById('heistFailReason');
    if (reasonEl) reasonEl.textContent = reason;

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  // =========================================================================
  // Keyboard Listeners
  // =========================================================================
  setupKeyboardListeners() {
    this._keyDownHandler = (e) => {
      this.initAudio();
      this.keys[e.code] = true;

      // Camera Perspective Shortcut [C]
      if (e.code === 'KeyC') {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Tactical Isometric', 'Over-The-Shoulder Chase', 'Security Blueprint'];
        this.showToast('CAMERA VIEW', modes[this.cameraMode], '#38bdf8');
      }

      // Takedown Shortcut [Space]
      if (e.code === 'Space') {
        e.preventDefault();
        this.attemptTakedown();
      }

      // Distraction Decoy [F]
      if (e.code === 'KeyF') {
        this.throwDecoy();
      }
    };

    this._keyUpHandler = (e) => {
      this.keys[e.code] = false;
    };

    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);
  }

  // =========================================================================
  // DOM HUD Overlay
  // =========================================================================
  getHUDHtml() {
    return `
      <div class="shadow-ui-layer">
        <!-- Top Status Bar -->
        <header class="shadow-top-bar">
          <div class="shadow-logo-badge shadow-glass interactive">
            <span style="font-size: 1.5rem;">🕵️</span>
            <div>
              <h1 class="shadow-logo-title">SHADOW OPERATIVE</h1>
              <span class="shadow-logo-sub">MEGACORP CYBER HEIST</span>
            </div>
          </div>

          <!-- Mission Telemetry Card -->
          <div class="shadow-telemetry shadow-glass interactive">
            <div class="shadow-stat-item">
              <span class="stat-label">SECURITY NODES</span>
              <span class="stat-val highlight" id="hudNodes">0 / 3</span>
            </div>
            <div class="stat-divider"></div>
            <div class="shadow-stat-item">
              <span class="stat-label">VAULT STATUS</span>
              <span class="stat-val" id="hudVault" style="color: #ef4444;">LOCKED</span>
            </div>
            <div class="stat-divider"></div>
            <div class="shadow-stat-item">
              <span class="stat-label">STEALTH RATING</span>
              <span class="stat-val" id="hudStatus" style="color: #10b981;">GHOST (0%)</span>
            </div>
          </div>

          <!-- Top Action Buttons -->
          <div class="shadow-top-actions interactive">
            <button class="shadow-btn-icon" id="btnShadowCam" title="Toggle Camera View (Tactical / Over-Shoulder / Top-Down)">🎥</button>
            <button class="shadow-btn-icon" id="btnShadowSound" title="Toggle Sound">🔊</button>
          </div>
        </header>

        <!-- Center Suspicion Radar & Hacking Meter -->
        <div class="shadow-center-hud">
          <!-- Hacking Progress Ring -->
          <div class="shadow-hack-overlay shadow-glass" id="hackOverlay" style="display: none;">
            <div style="font-family: 'Orbitron', sans-serif; font-size: 0.85rem; font-weight: 800; color: #38bdf8;">
              ⚡ BYPASSING CIPHER...
            </div>
            <div class="shadow-progress-track">
              <div class="shadow-progress-fill" id="hackFill" style="width: 0%;"></div>
            </div>
          </div>

          <!-- Vault Interaction Prompt -->
          <div class="shadow-prompt shadow-glass" id="actionPrompt" style="display: none;">
            <span id="promptText">[HOLD E] HACK NODE</span>
          </div>
        </div>

        <!-- Center Announcement Toast -->
        <div class="shadow-toast-center shadow-glass" id="shadowToast">
          <div class="shadow-toast-title" id="shadowToastTitle">GHOST INFILTRATION</div>
          <div class="shadow-toast-sub" id="shadowToastSub">Stay undetected in shadows!</div>
        </div>

        <!-- Bottom Controls Guide -->
        <footer class="shadow-bottom-bar">
          <div class="shadow-guide-card shadow-glass interactive">
            <div class="guide-item">
              <span>Move:</span> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
            </div>
            <div class="guide-item">
              <span>Sneak (Silent):</span> <kbd>Shift</kbd>
            </div>
            <div class="guide-item">
              <span>Takedown:</span> <kbd>Space</kbd>
            </div>
            <div class="guide-item">
              <span>Decoy Grenade:</span> <kbd>F</kbd>
            </div>
            <div class="guide-item">
              <span>Hack / Interact:</span> <kbd>E</kbd>
            </div>
          </div>

          <!-- Mobile Touch Controls -->
          <div class="shadow-mobile-controls interactive">
            <button class="shadow-touch-btn" id="mSneakBtn">SNEAK</button>
            <button class="shadow-touch-btn" id="mTakedownBtn">TAKEDOWN</button>
            <button class="shadow-touch-btn" id="mDecoyBtn">DECOY</button>
            <button class="shadow-touch-btn action" id="mHackBtn">HACK</button>
          </div>
        </footer>

        <!-- Mission Victory Modal -->
        <div class="shadow-modal-overlay" id="heistWinModal" style="display: none;">
          <div class="shadow-modal-box shadow-glass interactive">
            <div style="font-size: 3.5rem;">💎</div>
            <h2 class="shadow-modal-title" style="color: #10b981;">HEIST COMPLETED!</h2>
            <p style="color: #94a3b8; font-size: 0.95rem;">Quantum Data Core successfully extracted without facility lockdown.</p>
            
            <div class="shadow-score-summary">
              <div class="summary-col">
                <span class="label">TIME</span>
                <span class="val" id="heistWinTime">32.4s</span>
              </div>
              <div class="summary-col">
                <span class="label">ELIMINATIONS</span>
                <span class="val" id="heistWinTakedowns">2 Takedowns</span>
              </div>
              <div class="summary-col">
                <span class="label">RATING</span>
                <span class="val" id="heistWinRank" style="color: #38bdf8;">GHOST [S]</span>
              </div>
            </div>

            <button class="primary-btn" id="btnWinReplay">Play Again ➔</button>
          </div>
        </div>

        <!-- Mission Failed Modal -->
        <div class="shadow-modal-overlay" id="heistFailModal" style="display: none;">
          <div class="shadow-modal-box shadow-glass interactive">
            <div style="font-size: 3.5rem;">🚨</div>
            <h2 class="shadow-modal-title" style="color: #ef4444;">MISSION COMPROMISED</h2>
            <p id="heistFailReason" style="color: #94a3b8; font-size: 0.95rem;">Security enforcers caught the operative.</p>
            <button class="primary-btn" id="btnFailRetry">Retry Infiltration 🔄</button>
          </div>
        </div>
      </div>
    `;
  }

  showToast(title, sub, color = '#38bdf8') {
    const toast = document.getElementById('shadowToast');
    const tTitle = document.getElementById('shadowToastTitle');
    const tSub = document.getElementById('shadowToastSub');
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
    const nodesEl = document.getElementById('hudNodes');
    const vaultEl = document.getElementById('hudVault');
    const statusEl = document.getElementById('hudStatus');

    if (nodesEl) nodesEl.textContent = `${this.nodesHacked} / ${this.totalNodes}`;
    if (vaultEl) {
      vaultEl.textContent = this.vaultSecured ? 'EXTRACTED' : (this.vaultUnlocked ? 'UNLOCKED' : 'LOCKED');
      vaultEl.style.color = this.vaultSecured ? '#10b981' : (this.vaultUnlocked ? '#f59e0b' : '#ef4444');
    }
    if (statusEl) {
      if (this.isAlarmActive) {
        statusEl.textContent = 'LOCKDOWN (100%)';
        statusEl.style.color = '#ef4444';
      } else if (this.suspicion > 30) {
        statusEl.textContent = `ALERT (${Math.round(this.suspicion)}%)`;
        statusEl.style.color = '#f59e0b';
      } else {
        statusEl.textContent = `GHOST (${Math.round(this.suspicion)}%)`;
        statusEl.style.color = '#10b981';
      }
    }

    // Hacking UI Overlay
    const hackOverlay = document.getElementById('hackOverlay');
    const hackFill = document.getElementById('hackFill');
    if (hackOverlay && hackFill) {
      hackOverlay.style.display = this.isHacking ? 'flex' : 'none';
      hackFill.style.width = `${Math.min(100, this.hackProgress)}%`;
    }

    // Interaction Prompt
    const promptEl = document.getElementById('actionPrompt');
    const promptText = document.getElementById('promptText');
    if (promptEl && promptText) {
      if (this.targetTerminal && !this.targetTerminal.hacked) {
        promptEl.style.display = 'block';
        promptText.textContent = `[HOLD E] HACK ${this.targetTerminal.name.toUpperCase()}`;
      } else if (this.nearVault) {
        promptEl.style.display = 'block';
        promptText.textContent = '[HOLD E] EXTRACT QUANTUM CORE';
      } else {
        promptEl.style.display = 'none';
      }
    }

    this.bindHUDListeners();
  }

  bindHUDListeners() {
    const btnCam = document.getElementById('btnShadowCam');
    if (btnCam && !btnCam._bound) {
      btnCam._bound = true;
      btnCam.addEventListener('click', () => {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Tactical Isometric', 'Over-The-Shoulder Chase', 'Security Blueprint'];
        this.showToast('CAMERA VIEW', modes[this.cameraMode], '#38bdf8');
      });
    }

    const btnSound = document.getElementById('btnShadowSound');
    if (btnSound && !btnSound._bound) {
      btnSound._bound = true;
      btnSound.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
        this.showToast('AUDIO', this.soundEnabled ? 'Sound Effects ON' : 'Muted', this.soundEnabled ? '#10b981' : '#ef4444');
      });
    }

    const btnWinReplay = document.getElementById('btnWinReplay');
    if (btnWinReplay && !btnWinReplay._bound) {
      btnWinReplay._bound = true;
      btnWinReplay.addEventListener('click', () => {
        const modal = document.getElementById('heistWinModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
        this.start(this.currentMode);
      });
    }

    const btnFailRetry = document.getElementById('btnFailRetry');
    if (btnFailRetry && !btnFailRetry._bound) {
      btnFailRetry._bound = true;
      btnFailRetry.addEventListener('click', () => {
        const modal = document.getElementById('heistFailModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
        this.start(this.currentMode);
      });
    }

    // Mobile touch controls
    const bindTouchAction = (id, onDown, onUp) => {
      const btn = document.getElementById(id);
      if (btn && !btn._bound) {
        btn._bound = true;
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.initAudio();
          if (onDown) onDown();
        });
        if (onUp) {
          btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            onUp();
          });
        }
      }
    };

    bindTouchAction('mSneakBtn', () => { this.keys['KeyC_SNEAK'] = !this.keys['KeyC_SNEAK']; });
    bindTouchAction('mTakedownBtn', () => { this.attemptTakedown(); });
    bindTouchAction('mDecoyBtn', () => { this.throwDecoy(); });
    bindTouchAction('mHackBtn', () => { this.keys['KeyE_HACK'] = true; }, () => { this.keys['KeyE_HACK'] = false; });
  }

  getControlsGuide() {
    return [
      { label: 'Tactical Movement', keys: 'W A S D' },
      { label: 'Sneak Mode (Zero Noise)', keys: 'Hold Shift' },
      { label: 'Silent Takedown (Behind Guard)', keys: 'Spacebar' },
      { label: 'Distraction EMP Decoy', keys: 'F key' },
      { label: 'Hack Security Terminal', keys: 'Hold E inside terminal ring' },
      { label: 'Cycle Camera Perspective', keys: '🎥 Button in Top Bar or [C]' },
      { label: 'Heist Objective', keys: 'Decrypt all 3 Nodes & Steal Quantum Vault Core' }
    ];
  }

  destroy() {
    super.destroy();

    if (this._keyDownHandler) window.removeEventListener('keydown', this._keyDownHandler);
    if (this._keyUpHandler) window.removeEventListener('keyup', this._keyUpHandler);

    if (this._droneOsc1) { try { this._droneOsc1.stop(); } catch (e) {} }
    if (this._droneOsc2) { try { this._droneOsc2.stop(); } catch (e) {} }
    if (this.audioCtx) { try { this.audioCtx.close(); } catch (e) {} }

    this.guards.length = 0;
    this.cameras.length = 0;
    this.terminals.length = 0;
    this.lasers.length = 0;
    this.walls.length = 0;
  }
}
