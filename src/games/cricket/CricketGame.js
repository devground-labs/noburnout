import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import {
  createCricketStadium,
  createWicketsSet,
  createBatsmanModel,
  createBowlerModel,
  createCricketBall
} from './CricketModels.js';

export class CricketGame extends BaseGame {
  constructor() {
    super({
      id: 'super-over-cricket',
      name: 'Super Over Cricket 3D',
      subtitle: 'Single Player 1-Over Thriller',
      description: 'High-octane 3D cricket thriller! Step up to the crease in a high-pressure 1-over (6 balls) showdown under stadium floodlights. Time your drives, pulls, and lofted sixes to win the match!',
      icon: '🏏',
      badge: 'Super Over · 6 Balls',
      genre: '3D Sports Cricket',
      players: 'Single Player',
      modes: ['Target Chase (19 Runs)', 'Maximum Blitz (Bat First)', 'Net Practice']
    });

    // Audio Synth (Web Audio API)
    this.audioCtx = null;
    this.soundEnabled = true;

    // 3D Objects & Models
    this.stadiumMesh = null;
    this.batsmanWickets = null;
    this.bowlerWickets = null;
    this.batsman = null;
    this.bowler = null;
    this.ball = null;
    this.fielders = [];
    this.pitchMarker = null;

    // Delivery & Ball Flight Physics
    this.ballState = 'IDLE'; // 'IDLE', 'RUNUP', 'BOWLED', 'IN_PLAY', 'DEAD'
    this.ballPos = new THREE.Vector3(0, 0, 0);
    this.ballVel = new THREE.Vector3(0, 0, 0);
    this.ballBounces = 0;
    this.currentDelivery = null;
    this.deliveryProgress = 0;
    this.gravity = 9.81 * 2.2; // Crisper sports gravity scale

    // Over & Match Progression (Strictly 1 Over = 6 Legal Deliveries)
    this.ballsBowled = 0;
    this.maxBalls = 6;
    this.runs = 0;
    this.wickets = 0;
    this.maxWickets = 2; // Super over standard: 2 wickets max
    this.target = 19;    // In Target Chase mode
    this.timeline = [];  // Array of ball outcome strings e.g. ['4', '1', '6']
    this.matchComplete = false;
    this.autoNextBallTimer = 0;

    // Shot Telemetry
    this.lastShotInfo = null; // { runs: 6, distance: 98, speed: 142, timing: 'PERFECT' }
    this.timingFeedback = '';

    // Batsman Crease Position
    this.batsmanX = 0;
    this.batsmanTargetX = 0;

    // Camera Perspective (0: Broadcast Behind Batsman, 1: High Press Box, 2: Action Follow)
    this.cameraMode = 0;

    // Input state
    this.keys = {};
    this._keyDownHandler = null;
    this._keyUpHandler = null;

    // Particles for fireworks / celebrations
    this.particles = [];
  }

  // =========================================================================
  // Web Audio Synth for Authentic Cricket Sounds
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

  playBatCrack() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    // 1. Crisp wooden snap
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.14);

    // 2. High-frequency wood impact click
    const bSize = this.audioCtx.sampleRate * 0.05;
    const buf = this.audioCtx.createBuffer(1, bSize, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bSize * 0.2));
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buf;
    const nFilter = this.audioCtx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.setValueAtTime(1400, now);
    const nGain = this.audioCtx.createGain();
    nGain.gain.setValueAtTime(0.65, now);
    nGain.gain.linearRampToValueAtTime(0.01, now + 0.05);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.audioCtx.destination);
    noise.start(now);
  }

  playStumpsCrash() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    // Wooden clatter
    [240, 310, 420].forEach((f, idx) => {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now + idx * 0.04);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
      gain.gain.setValueAtTime(0.4, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + 0.38);
    });
  }

  playTurfBounce() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playCrowdCheer() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const bSize = this.audioCtx.sampleRate * 1.5;
    const buf = this.audioCtx.createBuffer(1, bSize, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buf;
    const nFilter = this.audioCtx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.setValueAtTime(500, now);
    nFilter.frequency.linearRampToValueAtTime(800, now + 0.6);
    nFilter.frequency.linearRampToValueAtTime(400, now + 1.5);
    const nGain = this.audioCtx.createGain();
    nGain.gain.setValueAtTime(0.01, now);
    nGain.gain.linearRampToValueAtTime(0.45, now + 0.3);
    nGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.audioCtx.destination);
    noise.start(now);
  }

  playCrowdGasp() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.4);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playVictoryFanfare() {
    if (!this.soundEnabled || !this.audioCtx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const now = this.audioCtx.currentTime + i * 0.12;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  // =========================================================================
  // Game Initialization & Scene Setup
  // =========================================================================
  async init(engine) {
    await super.init(engine);

    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.008);

    // Arena Lighting
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x14532d, 0.9);
    this.scene.add(hemiLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 1.3);
    mainSun.position.set(20, 50, 15);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 160;
    const d = 50;
    mainSun.shadow.camera.left = -d;
    mainSun.shadow.camera.right = d;
    mainSun.shadow.camera.top = d;
    mainSun.shadow.camera.bottom = -d;
    this.scene.add(mainSun);

    // Build Stadium & Outfield
    this.stadiumMesh = createCricketStadium();
    this.scene.add(this.stadiumMesh);

    // Wickets Sets (Batsman at z=9.8, Bowler at z=-9.8)
    this.batsmanWickets = createWicketsSet(9.8);
    this.scene.add(this.batsmanWickets.group);

    this.bowlerWickets = createWicketsSet(-9.8);
    this.scene.add(this.bowlerWickets.group);

    // Batsman & Bowler Models
    this.batsman = createBatsmanModel();
    this.batsman.mesh.position.set(0, 0, 9.2); // Just inside the popping crease
    this.scene.add(this.batsman.mesh);

    this.bowler = createBowlerModel();
    this.scene.add(this.bowler.mesh);

    // Cricket Ball
    this.ball = createCricketBall();
    this.ball.mesh.position.set(0, 1.5, -11);
    this.scene.add(this.ball.mesh);

    // Pitch Landing Marker (Visual Aid)
    const markerGeo = new THREE.RingGeometry(0.25, 0.55, 24);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    this.pitchMarker = new THREE.Mesh(markerGeo, markerMat);
    this.pitchMarker.rotation.x = -Math.PI / 2;
    this.pitchMarker.position.set(0, 0.04, 3.5);
    this.scene.add(this.pitchMarker);

    // Fielders around the oval
    this.spawnFielders();

    // Camera setup
    this.updateCamera(0);

    // Keyboard bindings
    this.setupKeyboard();
  }

  spawnFielders() {
    this.fielders.forEach(f => this.scene.remove(f.mesh));
    this.fielders = [];

    const positions = [
      { name: 'Wicket Keeper', x: 0, z: 12.2 },
      { name: 'First Slip', x: 3.2, z: 13.0 },
      { name: 'Cover Point', x: -16, z: 5 },
      { name: 'Extra Cover', x: -24, z: -6 },
      { name: 'Mid Off', x: -9, z: -16 },
      { name: 'Mid On', x: 9, z: -16 },
      { name: 'Square Leg', x: 18, z: 7 },
      { name: 'Deep Mid-Wicket', x: 34, z: -4 },
      { name: 'Long On', x: 14, z: -36 }
    ];

    const fMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
    const pMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });

    positions.forEach(pos => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.7, 0.28), fMat);
      body.position.y = 1.15;
      body.castShadow = true;
      g.add(body);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshStandardMaterial({ color: 0xddb18f }));
      head.position.y = 1.65;
      g.add(head);

      // Legs
      [-0.12, 0.12].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), pMat);
        leg.position.set(lx, 0.4, 0);
        leg.castShadow = true;
        g.add(leg);
      });

      g.position.set(pos.x, 0, pos.z);
      g.lookAt(0, 1.2, 9.2); // Look towards batsman
      this.scene.add(g);

      this.fielders.push({
        name: pos.name,
        mesh: g,
        homePos: new THREE.Vector3(pos.x, 0, pos.z),
        pos: new THREE.Vector3(pos.x, 0, pos.z)
      });
    });
  }

  // =========================================================================
  // Game Modes & Over Lifecycle
  // =========================================================================
  start(mode = 'Target Chase (19 Runs)') {
    super.start(mode);
    this.initAudio();

    this.ballsBowled = 0;
    this.runs = 0;
    this.wickets = 0;
    this.timeline = [];
    this.matchComplete = false;
    this.lastShotInfo = null;
    this.timingFeedback = '';

    if (mode.includes('Chase')) {
      this.target = 19;
    } else if (mode.includes('Blitz')) {
      this.target = 0; // Bat first
    } else {
      this.target = 0; // Net practice
    }

    this.batsmanWickets.reset();
    this.bowlerWickets.reset();

    // Prepare first ball
    this.ballState = 'IDLE';
    this.showToast('SUPER OVER BEGINS! ⚡', `Deliveries: 6 · ${mode}`, '#10b981');
    setTimeout(() => this.triggerNextBall(), 1500);
  }

  triggerNextBall() {
    if (this.matchComplete) return;

    if (this.currentMode !== 'Net Practice' && (this.ballsBowled >= this.maxBalls || this.wickets >= this.maxWickets)) {
      this.finishMatch();
      return;
    }

    if (this.currentMode.includes('Chase') && this.runs >= this.target) {
      this.finishMatch();
      return;
    }

    this.ballState = 'RUNUP';
    this.ballBounces = 0;
    this.timingFeedback = '';
    this.batsmanWickets.reset();

    // Generate random AI bowler delivery length & pace
    const deliveryTypes = [
      { name: 'GOOD LENGTH SEAMER', speed: 38, pitchZ: 3.2, devX: (Math.random() - 0.5) * 0.4 },
      { name: 'FAST YORKER', speed: 43, pitchZ: 7.6, devX: (Math.random() - 0.5) * 0.2 },
      { name: 'SHORT PITCH BOUNCER', speed: 40, pitchZ: -1.2, devX: (Math.random() - 0.5) * 0.5 },
      { name: 'OUTSWINGER', speed: 36, pitchZ: 4.0, devX: 0.5 },
      { name: 'SLOWER BALL', speed: 28, pitchZ: 4.5, devX: (Math.random() - 0.5) * 0.3 }
    ];
    this.currentDelivery = deliveryTypes[Math.floor(Math.random() * deliveryTypes.length)];

    // Position pitch target marker
    this.pitchMarker.position.set(this.currentDelivery.devX, 0.04, this.currentDelivery.pitchZ);
    this.pitchMarker.visible = true;

    // Bowler run-up & delivery arm animation
    this.bowler.mesh.position.set(0, 0, -11.0);
    this.bowler.playDeliveryAction(() => {
      this.releaseBall();
    });
  }

  releaseBall() {
    this.ballState = 'BOWLED';
    this.ballPos.set(0.28, 2.0, -10.5); // Released from bowler's high hand
    this.ball.mesh.position.copy(this.ballPos);
    this.ball.mesh.visible = true;

    // Calculate initial velocity vector towards pitch landing spot
    const dx = this.currentDelivery.devX - this.ballPos.x;
    const dz = this.currentDelivery.pitchZ - this.ballPos.z;
    const speed = this.currentDelivery.speed;
    const flightTime = Math.abs(dz) / speed;

    // Trajectory arc towards pitch
    this.ballVel.set(
      dx / flightTime,
      -1.5,
      speed
    );
  }

  // =========================================================================
  // Batting Control & Shot Impact Evaluation
  // =========================================================================
  setupKeyboard() {
    this._keyDownHandler = (e) => {
      this.initAudio();
      this.keys[e.code] = true;

      // Crease Movement
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.batsmanTargetX = Math.max(-0.6, this.batsmanTargetX - 0.25);
      }
      if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.batsmanTargetX = Math.min(0.6, this.batsmanTargetX + 0.25);
      }

      // Camera Perspective Shortcut [C]
      if (e.code === 'KeyC') {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Behind Batsman', 'High Press Box', 'Dynamic Action Follow'];
        this.showToast('CAMERA VIEW', modes[this.cameraMode], '#38bdf8');
      }

      // Swing Trigger (Space, W, Enter)
      if (['Space', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'Enter'].includes(e.code)) {
        e.preventDefault();
        this.attemptBatSwing(e.code);
      }
    };

    this._keyUpHandler = (e) => {
      this.keys[e.code] = false;
    };

    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);
  }

  attemptBatSwing(keyCode) {
    if (this.ballState !== 'BOWLED' && this.ballState !== 'IN_PLAY') {
      // Practice ready swing
      this.batsman.playSwingAnimation('DRIVE');
      return;
    }

    let shotType = 'DRIVE';
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) shotType = 'PULL';
    else if (this.keys['KeyD'] || this.keys['ArrowRight']) shotType = 'CUT';
    else if (keyCode === 'KeyS' || keyCode === 'ArrowDown') shotType = 'DEFENSE';
    else if (keyCode === 'Space' || keyCode === 'Enter') shotType = 'LOFTED';

    this.batsman.playSwingAnimation(shotType);

    // Evaluate timing relative to ball hitting zone (optimal impact at z ~ 8.8 to 9.2)
    const distToCrease = 9.0 - this.ballPos.z;
    const ballSpeedZ = Math.max(15, this.ballVel.z);
    const timeDelta = distToCrease / ballSpeedZ; // seconds until/since optimal impact

    if (Math.abs(timeDelta) < 0.22 && this.ballPos.z > 5.5 && this.ballPos.z < 10.2) {
      // Ball connected with bat!
      this.ballState = 'IN_PLAY';
      this.pitchMarker.visible = false;
      this.playBatCrack();

      const timingAbs = Math.abs(timeDelta);
      let timingRating = 'PERFECT';
      let powerFactor = 1.0;

      if (timingAbs < 0.055) {
        timingRating = 'PERFECT ⚡';
        powerFactor = 1.25;
      } else if (timingAbs < 0.12) {
        timingRating = 'GOOD 👍';
        powerFactor = 0.95;
      } else {
        timingRating = 'EARLY / LATE';
        powerFactor = 0.65;
      }

      this.timingFeedback = timingRating;

      // Shot direction vector based on shot type and timing
      let exitAngle = 0; // radians relative to straight back (-Z)
      let launchAngleY = 0.35; // trajectory elevation

      if (shotType === 'LOFTED') {
        launchAngleY = 0.52;
        powerFactor *= 1.2;
        exitAngle = (Math.random() - 0.5) * 0.4;
      } else if (shotType === 'PULL') {
        exitAngle = 1.1 + (Math.random() - 0.5) * 0.3; // Towards deep midwicket / square leg
        launchAngleY = 0.32;
      } else if (shotType === 'CUT') {
        exitAngle = -1.1 + (Math.random() - 0.5) * 0.3; // Towards point / cover
        launchAngleY = 0.25;
      } else if (shotType === 'DEFENSE') {
        powerFactor *= 0.35;
        launchAngleY = 0.12;
        exitAngle = 0.2;
      } else {
        // Straight Drive
        exitAngle = (Math.random() - 0.5) * 0.25;
        launchAngleY = 0.38;
      }

      const exitSpeed = 38 * powerFactor;
      this.ballVel.set(
        Math.sin(exitAngle) * exitSpeed,
        Math.sin(launchAngleY) * exitSpeed * 1.1,
        -Math.cos(exitAngle) * exitSpeed
      );

      this.ballBounces = 0;
    }
  }

  // =========================================================================
  // Physics & Ball Motion Simulation
  // =========================================================================
  update(dt, input) {
    if (this.isPaused) return;

    // Smooth batsman stance positioning
    this.batsmanX = THREE.MathUtils.lerp(this.batsmanX, this.batsmanTargetX, 0.12);
    this.batsman.mesh.position.x = this.batsmanX;

    // Ball simulation
    if (this.ballState === 'BOWLED') {
      this.simulateBowledDelivery(dt);
    } else if (this.ballState === 'IN_PLAY') {
      this.simulateHitTrajectory(dt);
    }

    // Auto-advance ball timer
    if (this.ballState === 'DEAD') {
      this.autoNextBallTimer -= dt;
      if (this.autoNextBallTimer <= 0 && !this.matchComplete) {
        this.triggerNextBall();
      }
    }

    // Particle animations (fireworks/confetti on sixes)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Update Camera
    this.updateCamera(this.cameraMode);
  }

  simulateBowledDelivery(dt) {
    this.ballPos.x += this.ballVel.x * dt;
    this.ballPos.z += this.ballVel.z * dt;
    this.ballPos.y += this.ballVel.y * dt;

    // Bounce on pitch
    if (this.ballPos.y <= 0.16 && this.ballPos.z < 8.2) {
      this.ballPos.y = 0.16;
      this.ballVel.y = Math.abs(this.ballVel.y) * 0.75 + (this.currentDelivery.name.includes('BOUNCER') ? 2.5 : 1.2);
      this.playTurfBounce();
    } else {
      this.ballVel.y -= this.gravity * 0.65 * dt;
    }

    this.ball.mesh.position.copy(this.ballPos);

    // Stumps Hit Check (BOWLED!)
    if (this.ballPos.z >= 9.6 && this.ballPos.z <= 10.2) {
      const distToStumpsX = Math.abs(this.ballPos.x);
      if (distToStumpsX < 0.22 && this.ballPos.y <= 0.82) {
        // Direct hit on stumps!
        this.ballState = 'DEAD';
        this.pitchMarker.visible = false;
        this.batsmanWickets.scatter(this.ballVel);
        this.playStumpsCrash();
        this.playCrowdGasp();

        this.wickets++;
        this.recordDeliveryResult('W');
        this.showToast('BOWLED! OUT! 💥', 'The ball crashed directly into off-stump!', '#ef4444');
        this.autoNextBallTimer = 3.0;
        return;
      }
    }

    // Ball passed batsman safely into wicketkeeper's gloves (Dot Ball)
    if (this.ballPos.z > 11.5) {
      this.ballState = 'DEAD';
      this.pitchMarker.visible = false;
      this.recordDeliveryResult('•');
      this.showToast('DOT BALL · 0 RUNS', 'Beaten by the bowler pace and seam!', '#94a3b8');
      this.autoNextBallTimer = 2.4;
    }
  }

  simulateHitTrajectory(dt) {
    this.ballPos.x += this.ballVel.x * dt;
    this.ballPos.z += this.ballVel.z * dt;
    this.ballPos.y += this.ballVel.y * dt;
    this.ballVel.y -= this.gravity * dt;

    // Turf Bounces
    if (this.ballPos.y <= 0.16) {
      this.ballPos.y = 0.16;
      this.ballBounces++;
      this.playTurfBounce();
      this.ballVel.y = Math.max(0, -this.ballVel.y * 0.55);
      this.ballVel.x *= 0.88;
      this.ballVel.z *= 0.88;
    }

    this.ball.mesh.position.copy(this.ballPos);

    const distFromCenter = Math.hypot(this.ballPos.x, this.ballPos.z);

    // Boundary Rope Check (radius ~50m)
    if (distFromCenter >= 50.0) {
      this.ballState = 'DEAD';
      if (this.ballBounces === 0) {
        // SIX RUNS! (Cleared on the full)
        this.runs += 6;
        this.recordDeliveryResult('6');
        this.spawnFireworks(this.ballPos);
        this.playCrowdCheer();
        const dist = Math.round(distFromCenter * 1.8);
        this.lastShotInfo = { runs: 6, distance: dist, speed: 144, timing: this.timingFeedback };
        this.showToast('🔥 MASSIVE SIX! 6 RUNS! 🔥', `${dist}m monster strike cleared the grandstand!`, '#f59e0b');
      } else {
        // FOUR RUNS! (Boundary on bounce)
        this.runs += 4;
        this.recordDeliveryResult('4');
        this.playCrowdCheer();
        this.lastShotInfo = { runs: 4, distance: Math.round(distFromCenter), speed: 128, timing: this.timingFeedback };
        this.showToast('💥 BOUNDARY FOUR! 4 RUNS! 💥', 'Cracked through the outfield ropes!', '#38bdf8');
      }
      this.autoNextBallTimer = 3.2;
      return;
    }

    // Ball slowed down in outfield -> Fielded
    const ballSpeed = Math.hypot(this.ballVel.x, this.ballVel.z);
    if (this.ballBounces > 1 && ballSpeed < 3.0 && Math.abs(this.ballVel.y) < 0.5) {
      this.ballState = 'DEAD';
      let runsScored = 1;
      if (distFromCenter > 32) runsScored = 2;
      else if (distFromCenter > 42) runsScored = 3;

      this.runs += runsScored;
      this.recordDeliveryResult(`${runsScored}`);
      this.lastShotInfo = { runs: runsScored, distance: Math.round(distFromCenter), speed: 96, timing: this.timingFeedback };
      this.showToast(`${runsScored} RUNS`, `Pushed into the gap for ${runsScored}!`, '#10b981');
      this.autoNextBallTimer = 2.4;
    }
  }

  recordDeliveryResult(resStr) {
    if (this.currentMode !== 'Net Practice') {
      this.ballsBowled++;
      this.timeline.push(resStr);

      if (this.currentMode.includes('Chase') && this.runs >= this.target) {
        setTimeout(() => this.finishMatch(), 1200);
      } else if (this.ballsBowled >= this.maxBalls || this.wickets >= this.maxWickets) {
        setTimeout(() => this.finishMatch(), 1200);
      }
    }
  }

  spawnFireworks(pos) {
    const colors = [0xf59e0b, 0xef4444, 0x3b82f6, 0x10b981, 0xa855f7];
    for (let i = 0; i < 28; i++) {
      const geo = new THREE.SphereGeometry(0.2, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const theta = Math.random() * Math.PI * 2;
      const spd = 6 + Math.random() * 14;
      const vel = new THREE.Vector3(Math.cos(theta) * spd, 8 + Math.random() * 10, Math.sin(theta) * spd);

      this.particles.push({ mesh, vel, life: 1.2 });
    }
  }

  // =========================================================================
  // Match Completion & Victory Dialog
  // =========================================================================
  finishMatch() {
    this.matchComplete = true;

    const modal = document.getElementById('cricketEndModal');
    const title = document.getElementById('cricketWinnerTitle');
    const sub = document.getElementById('cricketWinnerSub');
    const scoreText = document.getElementById('cricketFinalScore');
    const playBtn = document.getElementById('btnCricketPlayAgain');
    if (!modal) return;

    let isWin = false;
    if (this.currentMode.includes('Chase')) {
      if (this.runs >= this.target) {
        isWin = true;
        this.playVictoryFanfare();
        if (title) title.textContent = '🏆 SUPER OVER CHAMPION!';
        if (sub) sub.textContent = `Target ${this.target} Chased down in style with ${this.maxBalls - this.ballsBowled} balls remaining!`;
      } else if (this.runs === this.target - 1) {
        if (title) title.textContent = '🤝 SUPER OVER TIED!';
        if (sub) sub.textContent = `Match tied at ${this.runs} runs! Incredible contest!`;
      } else {
        if (title) title.textContent = '💔 CHASE FELL SHORT!';
        if (sub) sub.textContent = `Required ${this.target} runs · Scored ${this.runs}/${this.wickets}. Bowler defended total!`;
      }
    } else {
      isWin = true;
      this.playVictoryFanfare();
      if (title) title.textContent = '🔥 1-OVER INNINGS COMPLETE!';
      if (sub) sub.textContent = `Blasted ${this.runs} Runs for ${this.wickets} Wickets off 6 deliveries!`;
    }

    if (scoreText) scoreText.textContent = `${this.runs} / ${this.wickets} (${this.ballsBowled} Balls)`;
    if (playBtn) playBtn.textContent = 'Play Next Super Over (6 Balls) 🏏';

    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  // =========================================================================
  // Camera Perspectives
  // =========================================================================
  updateCamera(mode) {
    if (mode === 0) {
      // Dynamic Broadcast Behind Batsman (looking straight down the pitch at bowler)
      this.camera.position.set(this.batsmanX * 0.4, 3.8, 15.5);
      this.camera.lookAt(0, 1.4, -4);
    } else if (mode === 1) {
      // High Stadium Press Box (tactical overview)
      this.camera.position.set(0, 26, 32);
      this.camera.lookAt(0, 1.2, 0);
    } else {
      // Dynamic Action Follow (follows ball trajectory)
      if (this.ballState === 'IN_PLAY') {
        this.camera.position.set(this.ballPos.x * 0.6, Math.max(4, this.ballPos.y + 4), this.ballPos.z + 12);
        this.camera.lookAt(this.ballPos.x, this.ballPos.y, this.ballPos.z);
      } else {
        this.camera.position.set(this.batsmanX * 0.4, 3.8, 15.5);
        this.camera.lookAt(0, 1.4, -4);
      }
    }
  }

  // =========================================================================
  // HUD UI Overlay HTML
  // =========================================================================
  getHUDHtml() {
    return `
      <div class="cricket-ui-layer">
        <!-- Top Status Bar & Scoreboard -->
        <header class="cricket-top-bar">
          <!-- Game Logo Badge -->
          <div class="cricket-logo-badge cricket-glass interactive">
            <div class="cricket-logo-icon">🏏</div>
            <div class="cricket-logo-text">
              <h1>SUPER OVER CRICKET</h1>
              <span>3D 1-Over Showdown</span>
            </div>
          </div>

          <!-- Main TV Scoreboard -->
          <div class="cricket-tv-scoreboard cricket-glass interactive">
            <!-- Score & Wickets -->
            <div class="score-main-col">
              <div class="score-team-label">SUPER STRIKERS</div>
              <div class="score-large-val" id="cricketScoreVal">0 / 0</div>
            </div>

            <div class="score-divider"></div>

            <!-- Over & Ball Timeline -->
            <div class="over-timeline-col">
              <div class="over-header-row">
                <span id="cricketOverText">OVER 0.0 / 1.0</span>
                <span class="target-badge" id="cricketTargetBadge">TARGET: ${this.target}</span>
              </div>
              <div class="timeline-pills" id="cricketTimelinePills">
                <div class="pill empty">·</div>
                <div class="pill empty">·</div>
                <div class="pill empty">·</div>
                <div class="pill empty">·</div>
                <div class="pill empty">·</div>
                <div class="pill empty">·</div>
              </div>
            </div>

            <div class="score-divider"></div>

            <!-- Required Rate / Equation -->
            <div class="equation-col">
              <div class="equation-title" id="cricketEquationTitle">NEED 19 FROM 6</div>
              <div class="equation-sub" id="cricketEquationSub">RRR: 19.00</div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="cricket-top-actions interactive">
            <button class="cricket-btn-icon" id="btnCricketNext" title="Bowl Next Ball">⚡ Bowl</button>
            <button class="cricket-btn-icon" id="btnCricketCam" title="Toggle Camera View">🎥</button>
            <button class="cricket-btn-icon" id="btnCricketSound" title="Toggle Sound">🔊</button>
          </div>
        </header>

        <!-- Center Shot Telemetry Toast -->
        <div class="cricket-telemetry-banner cricket-glass" id="cricketTelemetry">
          <div class="telemetry-badge" id="telemetryBadge">PERFECT TIMING ⚡</div>
          <div class="telemetry-main" id="telemetryMain">104M MAXIMUM SIX!</div>
          <div class="telemetry-sub" id="telemetrySub">Exit Velocity: 144 km/h · English Willow Sweet Spot</div>
        </div>

        <!-- Center Announcement Toast -->
        <div class="cricket-toast-center cricket-glass" id="cricketToast">
          <div class="cricket-toast-title" id="cricketToastTitle">SUPER OVER BEGINS! ⚡</div>
          <div class="cricket-toast-sub" id="cricketToastSub">Deliveries: 6 · Target Chase</div>
        </div>

        <!-- Bottom Controls Guide & Batting Prompt -->
        <footer class="cricket-bottom-bar">
          <div class="cricket-control-guide-card cricket-glass interactive">
            <div class="guide-title">🏏 BATTING CONTROLS</div>
            <div class="guide-keys-row">
              <div class="guide-key-item">
                <kbd>W</kbd> or <kbd>↑</kbd> <span>Straight Drive</span>
              </div>
              <div class="guide-key-item">
                <kbd>A</kbd> + <kbd>Space</kbd> <span>Pull / Leg Flick</span>
              </div>
              <div class="guide-key-item">
                <kbd>D</kbd> + <kbd>Space</kbd> <span>Cover Drive / Cut</span>
              </div>
              <div class="guide-key-item">
                <kbd>Space</kbd> <span>Power Lofted Six</span>
              </div>
              <div class="guide-key-item">
                <kbd>A</kbd> / <kbd>D</kbd> <span>Shuffle in Crease</span>
              </div>
            </div>
          </div>

          <!-- Mobile Tap Swing Button -->
          <div class="cricket-mobile-controls interactive">
            <button class="mobile-swing-btn" id="mCricketSwing">SWING BAT 💥</button>
          </div>
        </footer>

        <!-- Match Result Modal -->
        <div class="cricket-modal-overlay" id="cricketEndModal" style="display: none;">
          <div class="cricket-modal-box cricket-glass interactive">
            <div id="cricketWinnerEmoji" style="font-size: 3.8rem;">🏆</div>
            <h2 class="cricket-modal-title" id="cricketWinnerTitle">SUPER OVER CHAMPION!</h2>
            <p class="cricket-modal-sub" id="cricketWinnerSub">Target chased down in thrilling 6-ball duel!</p>

            <div class="cricket-score-summary" id="cricketFinalScore">
              19 / 0 (5 Balls)
            </div>

            <button class="primary-btn" id="btnCricketPlayAgain">Play Next Super Over (6 Balls) 🏏</button>
          </div>
        </div>
      </div>
    `;
  }

  showToast(title, sub, color = '#10b981') {
    const toast = document.getElementById('cricketToast');
    const tTitle = document.getElementById('cricketToastTitle');
    const tSub = document.getElementById('cricketToastSub');
    if (!toast || !tTitle || !tSub) return;

    tTitle.textContent = title;
    tTitle.style.color = color;
    tSub.textContent = sub;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  updateHUD() {
    // 1. Score display
    const scoreVal = document.getElementById('cricketScoreVal');
    if (scoreVal) scoreVal.textContent = `${this.runs} / ${this.wickets}`;

    // 2. Over progress
    const overText = document.getElementById('cricketOverText');
    if (overText) overText.textContent = `OVER 0.${this.ballsBowled} / 1.0`;

    // 3. Equation & RRR
    const eqTitle = document.getElementById('cricketEquationTitle');
    const eqSub = document.getElementById('cricketEquationSub');
    const targetBadge = document.getElementById('cricketTargetBadge');

    if (this.currentMode.includes('Chase')) {
      const remainingBalls = Math.max(0, this.maxBalls - this.ballsBowled);
      const remainingRuns = Math.max(0, this.target - this.runs);
      if (eqTitle) eqTitle.textContent = remainingRuns === 0 ? 'TARGET ACHIEVED! 🏆' : `NEED ${remainingRuns} FROM ${remainingBalls}`;
      if (eqSub) {
        const rrr = remainingBalls > 0 ? ((remainingRuns / remainingBalls) * 6).toFixed(2) : '0.00';
        eqSub.textContent = `REQ RUN RATE: ${rrr}`;
      }
      if (targetBadge) targetBadge.textContent = `TARGET: ${this.target}`;
    } else {
      if (eqTitle) eqTitle.textContent = `CURRENT SCORE: ${this.runs}`;
      if (eqSub) eqSub.textContent = `RUN RATE: ${this.ballsBowled > 0 ? ((this.runs / this.ballsBowled) * 6).toFixed(2) : '0.00'}`;
      if (targetBadge) targetBadge.textContent = 'BAT FIRST BLITZ';
    }

    // 4. Timeline pills
    const pillsContainer = document.getElementById('cricketTimelinePills');
    if (pillsContainer) {
      const pillsHtml = [];
      for (let i = 0; i < 6; i++) {
        if (i < this.timeline.length) {
          const item = this.timeline[i];
          let pillClass = 'pill';
          if (item === '6') pillClass += ' six';
          else if (item === '4') pillClass += ' four';
          else if (item === 'W') pillClass += ' wicket';
          else if (item === '•') pillClass += ' dot';
          else pillClass += ' run';
          pillsHtml.push(`<div class="${pillClass}">${item}</div>`);
        } else {
          pillsHtml.push('<div class="pill empty">·</div>');
        }
      }
      pillsContainer.innerHTML = pillsHtml.join('');
    }

    // 5. Shot telemetry display
    const telemetry = document.getElementById('cricketTelemetry');
    if (telemetry && this.lastShotInfo) {
      const badge = document.getElementById('telemetryBadge');
      const main = document.getElementById('telemetryMain');
      const sub = document.getElementById('telemetrySub');
      if (badge) badge.textContent = this.lastShotInfo.timing || 'PERFECT TIMING ⚡';
      if (main) {
        if (this.lastShotInfo.runs === 6) main.textContent = `🔥 ${this.lastShotInfo.distance}M MAXIMUM SIX! 🔥`;
        else if (this.lastShotInfo.runs === 4) main.textContent = `💥 BOUNDARY FOUR! (${this.lastShotInfo.distance}M) 💥`;
        else main.textContent = `STRIKE: ${this.lastShotInfo.runs} RUNS (${this.lastShotInfo.distance}M)`;
      }
      if (sub) sub.textContent = `Exit Velocity: ${this.lastShotInfo.speed} km/h · English Willow Sweet Spot`;
      telemetry.classList.add('show');
      setTimeout(() => telemetry.classList.remove('show'), 2600);
      this.lastShotInfo = null;
    }

    // Bind event listeners once
    this.bindHUDListeners();
  }

  bindHUDListeners() {
    const btnNext = document.getElementById('btnCricketNext');
    if (btnNext && !btnNext._bound) {
      btnNext._bound = true;
      btnNext.addEventListener('click', () => {
        this.initAudio();
        this.triggerNextBall();
      });
    }

    const btnCam = document.getElementById('btnCricketCam');
    if (btnCam && !btnCam._bound) {
      btnCam._bound = true;
      btnCam.addEventListener('click', () => {
        this.cameraMode = (this.cameraMode + 1) % 3;
        const modes = ['Broadcast Behind Batsman', 'High Press Box', 'Dynamic Action Follow'];
        this.showToast('CAMERA VIEW', modes[this.cameraMode], '#38bdf8');
      });
    }

    const btnSound = document.getElementById('btnCricketSound');
    if (btnSound && !btnSound._bound) {
      btnSound._bound = true;
      btnSound.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
        this.showToast('AUDIO', this.soundEnabled ? 'Sound Effects ON' : 'Muted', this.soundEnabled ? '#10b981' : '#ef4444');
      });
    }

    const btnPlayAgain = document.getElementById('btnCricketPlayAgain');
    if (btnPlayAgain && !btnPlayAgain._bound) {
      btnPlayAgain._bound = true;
      btnPlayAgain.addEventListener('click', () => {
        const modal = document.getElementById('cricketEndModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
        this.start(this.currentMode);
      });
    }

    const mSwing = document.getElementById('mCricketSwing');
    if (mSwing && !mSwing._bound) {
      mSwing._bound = true;
      mSwing.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.initAudio();
        this.attemptBatSwing('Space');
      });
    }
  }

  getControlsGuide() {
    return [
      { label: 'Drive Down Ground', keys: 'W or Up Arrow' },
      { label: 'Pull / Leg Glance', keys: 'A + Space / Left Arrow' },
      { label: 'Cover Drive / Cut', keys: 'D + Space / Right Arrow' },
      { label: 'Power Lofted Six', keys: 'Spacebar / Enter' },
      { label: 'Defensive Block', keys: 'S or Down Arrow' },
      { label: 'Shuffle in Crease', keys: 'A / D to adjust line' },
      { label: 'Cycle Camera Perspective', keys: '🎥 Button in Top Bar or [C]' },
      { label: 'Super Over Tournament Rule', keys: 'Strictly 1 Over (6 deliveries) · 2 Wickets Max' }
    ];
  }

  destroy() {
    super.destroy();

    if (this._keyDownHandler) window.removeEventListener('keydown', this._keyDownHandler);
    if (this._keyUpHandler) window.removeEventListener('keyup', this._keyUpHandler);

    if (this.stadiumMesh) this.scene.remove(this.stadiumMesh);
    if (this.batsmanWickets) this.scene.remove(this.batsmanWickets.group);
    if (this.bowlerWickets) this.scene.remove(this.bowlerWickets.group);
    if (this.batsman) this.scene.remove(this.batsman.mesh);
    if (this.bowler) this.scene.remove(this.bowler.mesh);
    if (this.ball) this.scene.remove(this.ball.mesh);
    if (this.pitchMarker) this.scene.remove(this.pitchMarker);

    this.fielders.forEach(f => this.scene.remove(f.mesh));
    this.fielders = [];

    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
  }
}
