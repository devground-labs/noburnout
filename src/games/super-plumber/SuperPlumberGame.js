import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { PlumberModel } from './PlumberModel.js';

/**
 * SuperPlumberGame - 2.5D Mushroom Kingdom Platformer in Three.js
 */
export class SuperPlumberGame extends BaseGame {
  constructor() {
    super({
      id: 'super-plumber',
      name: 'SUPER PLUMBER 3D',
      subtitle: 'Mushroom Kingdom 2.5D',
      description: 'Classic 2.5D side-scrolling platformer! Stomp Goombas & Koopas, bump [?] blocks, collect golden coins, grab Super Mushrooms & Fire Flowers, shatter bricks, and reach the victory flagpole.',
      icon: '🍄',
      badge: '2.5D Platformer',
      genre: 'Action Platformer',
      players: '1 Player',
      modes: ['World 1-1 (Grassland)', 'World 1-2 (Underground)', 'Speedrun Challenge']
    });

    // Player State
    this.player = null;
    this.playerMesh = null;
    this.playerFacing = 1; // 1 = right, -1 = left
    this.form = 'small'; // 'small', 'super', 'fire', 'star'
    this.lives = 3;
    this.score = 0;
    this.coins = 0;
    this.timeRemaining = 400;
    this.invulnerableTimer = 0;
    this.starTimer = 0;
    this.isDead = false;
    this.deathTimer = 0;
    this.isVictory = false;
    this.victoryPhase = 0;
    this.victoryTimer = 0;
    this.flagBonus = 0;

    // Physics Tuning
    this.gravity = -44;
    this.lowJumpGravity = -28;
    this.runAccel = 42;
    this.maxRunSpeed = 9.2;
    this.sprintSpeed = 13.8;
    this.friction = 32;
    this.jumpVelocity = 16.5;

    // World Entities
    this.levelBlocks = []; // Ground, bricks, question blocks
    this.levelPipes = [];
    this.levelEnemies = []; // Goombas, Koopas
    this.levelCoins = [];
    this.levelPowerups = [];
    this.fireballs = [];
    this.particles = [];
    this.flagpole = null;
    this.castle = null;
    this.clouds = [];

    // Camera settings
    this.camMode = 0; // 0: 2.5D Classic, 1: Pure Retro 2D, 2: 3D Isometric
    this.camModes = ['2.5D Dynamic', 'Pure 2D Retro', '3D Isometric'];
    this.camTargetX = 0;
    this.camTargetY = 4;

    // Audio
    this.audioCtx = null;
    this.soundEnabled = true;
    this.bgmTimer = 0;
    this.bgmStep = 0;
    this.bgmPlaying = false;
  }

  async init(engine) {
    await super.init(engine);
    
    // Completely decouple from the base game/engine 3D arena
    // Create an isolated scene for the platformer
    this.scene = new THREE.Scene();
    
    // Setup true 2D Orthographic Camera
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 14; // Height of the view in game units
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2, viewSize * aspect / 2,
      viewSize / 2, -viewSize / 2,
      0.1, 100
    );
    this.camera.position.set(0, 4, 15);
    this.camera.lookAt(0, 4, 0);
    
    this.hasCustomRender = true;
    
    this.initAudioContext();
  }

  onResize(width, height) {
    if (this.camera && this.camera.isOrthographicCamera) {
      const aspect = width / height;
      const viewSize = 14;
      this.camera.left = -viewSize * aspect / 2;
      this.camera.right = viewSize * aspect / 2;
      this.camera.top = viewSize / 2;
      this.camera.bottom = -viewSize / 2;
      this.camera.updateProjectionMatrix();
    }
  }

  render() {
    if (this.engine && this.engine.renderer) {
      this.engine.renderer.render(this.scene, this.camera);
    }
  }

  // =========================================================================
  // Audio Synthesizer (Chiptune 8-Bit)
  // =========================================================================

  initAudioContext() {
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
    } catch (e) {
      console.warn('Web Audio not supported:', e);
    }
  }

  ensureAudio() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(freq, type = 'square', duration = 0.12, gainVal = 0.15, slideTo = null) {
    if (!this.soundEnabled || !this.audioCtx) return;
    this.ensureAudio();

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }

      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  playJumpSfx() {
    // Upward pitch bend (160Hz -> 620Hz)
    this.playTone(160, 'square', 0.16, 0.14, 620);
  }

  playCoinSfx() {
    if (!this.soundEnabled || !this.audioCtx) return;
    this.ensureAudio();
    try {
      // Classic two-note crystal chime: B5 -> E6
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  playStompSfx() {
    // Hollow punch
    this.playTone(260, 'triangle', 0.1, 0.22, 60);
  }

  playBlockBumpSfx() {
    this.playTone(140, 'triangle', 0.08, 0.18, 50);
  }

  playBrickBreakSfx() {
    this.playTone(220, 'square', 0.15, 0.2, 40);
  }

  playPowerupSpawnSfx() {
    // Ascending arpeggio C4-E4-G4-C5-E5-G5
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'square', 0.08, 0.12), idx * 60);
    });
  }

  playPowerupCollectSfx() {
    const notes = [330, 392, 659, 523, 587, 784];
    notes.forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'sine', 0.1, 0.16), idx * 70);
    });
  }

  playFireballSfx() {
    this.playTone(720, 'triangle', 0.12, 0.15, 240);
  }

  playFlagpoleSfx() {
    // Sliding glissando downward
    this.playTone(600, 'triangle', 0.6, 0.2, 180);
    setTimeout(() => {
      // Victory Fanfare
      const fanfare = [
        { f: 523.25, d: 0.12 },
        { f: 659.25, d: 0.12 },
        { f: 783.99, d: 0.12 },
        { f: 1046.5, d: 0.3 }
      ];
      fanfare.forEach((n, idx) => {
        setTimeout(() => this.playTone(n.f, 'square', n.d, 0.18), idx * 130);
      });
    }, 650);
  }

  playDeathSfx() {
    const deathNotes = [500, 470, 440, 400, 350, 300, 200];
    deathNotes.forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 'square', 0.14, 0.16), idx * 90);
    });
  }

  // =========================================================================
  // Game Setup & Start
  // =========================================================================

  start(mode = this.modes[0]) {
    super.start(mode);

    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.timeRemaining = mode.includes('Speedrun') ? 120 : 400;
    this.form = 'small';
    this.isDead = false;
    this.isVictory = false;
    this.victoryPhase = 0;
    this.invulnerableTimer = 0;
    this.starTimer = 0;

    this.buildWorld(mode);
    this.bindHUDEvents();
    this.showToast('WORLD 1-1', 'Super Plumber 3D Infiltration!', '#ef4444');
  }

  buildWorld(mode) {
    // Clear our isolated scene instead of the engine's main scene
    while(this.scene.children.length > 0){ 
      const obj = this.scene.children[0];
      this.scene.remove(obj); 
    }

    // Scene Environment
    const isUnderground = mode.includes('Underground');
    const skyColor = isUnderground ? 0x0a1128 : 0x60a5fa;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, 28, 70);

    // Dynamic Lighting
    const hemiLight = new THREE.HemisphereLight(
      isUnderground ? 0x38bdf8 : 0xffffff,
      isUnderground ? 0x0f172a : 0x16a34a,
      isUnderground ? 0.7 : 0.95
    );
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.3);
    dirLight.position.set(15, 25, 18);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -10;
    this.scene.add(dirLight);

    // Arrays clear
    this.levelBlocks = [];
    this.levelPipes = [];
    this.levelEnemies = [];
    this.levelCoins = [];
    this.levelPowerups = [];
    this.fireballs = [];
    this.particles = [];
    this.clouds = [];

    // Background Scenery (Hills, Bushes, Clouds)
    if (!isUnderground) {
      this.buildGrasslandScenery();
    } else {
      this.buildCavernScenery();
    }

    // Level Layout
    this.generateLevelGeometry(isUnderground);

    // Spawn Player Plumber
    this.spawnPlayer();
  }

  buildGrasslandScenery() {
    // Parallax Clouds
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0
    });

    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Group();
      const numPuffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < numPuffs; p++) {
        const puffGeo = new THREE.SphereGeometry(1.2 + Math.random() * 0.8, 10, 8);
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(p * 1.4 - (numPuffs * 0.7), Math.sin(p) * 0.4, 0);
        cloud.add(puff);
      }
      cloud.position.set(i * 12 - 10, 10 + Math.random() * 6, -10 - Math.random() * 6);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }

    // Rolling Green Hills with cartoon dots
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.8,
      metalness: 0.05
    });

    for (let i = 0; i < 12; i++) {
      const hillGeo = new THREE.ConeGeometry(5 + (i % 3) * 2, 7 + (i % 2) * 3, 16);
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set(i * 18 - 8, 2, -5 - (i % 2) * 3);
      this.scene.add(hill);
    }

    // Bushes
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.7
    });

    for (let i = 0; i < 16; i++) {
      const bushGeo = new THREE.SphereGeometry(1.2, 10, 8);
      bushGeo.scale(1.8, 1, 0.8);
      const bush = new THREE.Mesh(bushGeo, bushMat);
      bush.position.set(i * 14 + 4, 0.7, -1.8);
      this.scene.add(bush);
    }
  }

  buildCavernScenery() {
    // Stalactites and deep cavern ceiling
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9
    });

    for (let i = 0; i < 20; i++) {
      const stalactiteGeo = new THREE.ConeGeometry(0.8, 3.5, 6);
      stalactiteGeo.rotateX(Math.PI);
      const s = new THREE.Mesh(stalactiteGeo, stoneMat);
      s.position.set(i * 7, 12, -1.5);
      this.scene.add(s);
    }
  }

  generateLevelGeometry(isUnderground) {
    // Materials
    const grassTopMat = new THREE.MeshStandardMaterial({
      color: isUnderground ? 0x0284c7 : 0x22c55e,
      roughness: 0.7
    });

    const dirtMat = new THREE.MeshStandardMaterial({
      color: isUnderground ? 0x0f172a : 0x78350f,
      roughness: 0.85
    });

    // Helper: Add Ground Block
    const addGroundBlock = (x, y = 0, width = 1, height = 3) => {
      const group = new THREE.Group();
      group.position.set(x, y - height / 2, 0);

      const dirtGeo = new THREE.BoxGeometry(width, height, 2);
      const dirt = new THREE.Mesh(dirtGeo, dirtMat);
      dirt.receiveShadow = true;
      group.add(dirt);

      const topGeo = new THREE.BoxGeometry(width, 0.3, 2.05);
      const top = new THREE.Mesh(topGeo, grassTopMat);
      top.position.y = height / 2 - 0.15;
      top.receiveShadow = true;
      group.add(top);

      this.scene.add(group);
      this.levelBlocks.push({
        x: x,
        y: y,
        w: width,
        h: height,
        type: 'ground',
        mesh: group
      });
    };

    // Helper: Add Question Block
    const addQBlock = (x, y, content = 'coin') => {
      const q = PlumberModel.createQuestionBlock(content);
      q.position.set(x, y, 0);
      this.scene.add(q);
      this.levelBlocks.push({
        x: x,
        y: y,
        w: 1,
        h: 1,
        type: 'question',
        mesh: q,
        content: content,
        isUsed: false,
        bumpY: 0
      });
    };

    // Helper: Add Brick Block
    const addBrick = (x, y) => {
      const b = PlumberModel.createBrickBlock();
      b.position.set(x, y, 0);
      this.scene.add(b);
      this.levelBlocks.push({
        x: x,
        y: y,
        w: 1,
        h: 1,
        type: 'brick',
        mesh: b,
        isDestroyed: false,
        bumpY: 0
      });
    };

    // Helper: Add Warp Pipe
    const addPipe = (x, height = 3, hasPiranha = false) => {
      const p = PlumberModel.createPipe(height);
      p.position.set(x, 0, 0);
      this.scene.add(p);
      this.levelPipes.push({
        x: x,
        y: height,
        w: 1.76,
        h: height,
        mesh: p
      });

      if (hasPiranha) {
        const piranha = PlumberModel.createPiranhaPlant();
        piranha.position.set(x, height, 0);
        this.scene.add(piranha);
        this.levelEnemies.push({
          type: 'piranha',
          mesh: piranha,
          baseX: x,
          baseY: height,
          timer: Math.random() * Math.PI,
          alive: true
        });
      }
    };

    // Helper: Add Coin
    const addCoin = (x, y) => {
      const c = PlumberModel.createCoin();
      c.position.set(x, y, 0);
      this.scene.add(c);
      this.levelCoins.push({
        x,
        y,
        mesh: c,
        collected: false
      });
    };

    // Helper: Add Goomba
    const addGoomba = (x, y = 0.5) => {
      const g = PlumberModel.createGoomba();
      g.position.set(x, y, 0);
      this.scene.add(g);
      this.levelEnemies.push({
        type: 'goomba',
        mesh: g,
        x: x,
        y: y,
        vx: -1.6,
        vy: 0,
        alive: true,
        squished: false,
        squishTimer: 0
      });
    };

    // Helper: Add Koopa
    const addKoopa = (x, y = 0.7) => {
      const k = PlumberModel.createKoopa();
      k.position.set(x, y, 0);
      this.scene.add(k);
      this.levelEnemies.push({
        type: 'koopa',
        mesh: k,
        x: x,
        y: y,
        vx: -1.8,
        vy: 0,
        alive: true,
        isShell: false,
        shellSpeed: 0
      });
    };

    // 1. Segment 1: Starting Zone (X: -6 to 32)
    addGroundBlock(13, 0, 40, 3);

    // Initial blocks
    addQBlock(7, 3.8, 'coin');
    addBrick(9, 3.8);
    addQBlock(10, 3.8, 'mushroom'); // Super Mushroom!
    addBrick(11, 3.8);
    addQBlock(12, 3.8, 'coin');
    addBrick(13, 3.8);
    addQBlock(10, 6.8, 'fireflower'); // Elevated Fire Flower block!

    // First patrolling Goomba
    addGoomba(15, 0.5);
    addGoomba(19, 0.5);

    // Pipes of increasing height
    addPipe(21, 2.4, false);
    addGoomba(24, 0.5);
    addPipe(27, 3.2, true);
    addPipe(31, 4.0, false);

    // 2. Chasm / Pit 1 (X: 33 to 37)

    // 3. Segment 2: Runway & Overhead Platforms (X: 38 to 68)
    addGroundBlock(53, 0, 32, 3);

    // Floating Brick Runway with hidden 1-UP and star
    for (let bx = 41; bx <= 47; bx++) {
      if (bx === 43) {
        addQBlock(bx, 4.2, 'coin');
      } else if (bx === 45) {
        addQBlock(bx, 4.2, 'star');
      } else {
        addBrick(bx, 4.2);
      }
      addCoin(bx, 5.5);
    }

    addGoomba(44, 0.5);
    addGoomba(46, 0.5);
    addKoopa(51, 0.7); // Koopa turtle!

    // High platform with multi-coin rewards
    addBrick(54, 4.0);
    addBrick(55, 4.0);
    addBrick(56, 4.0);
    addQBlock(55, 7.0, 'coin');
    addCoin(54, 7.0);
    addCoin(56, 7.0);

    addPipe(60, 3.0, true);
    addGoomba(63, 0.5);
    addKoopa(66, 0.7);

    // 4. Chasm / Pit 2 (X: 69 to 73)

    // 5. Segment 3: Staircase Pyramid & Goal (X: 74 to 125)
    addGroundBlock(100, 0, 54, 3);

    // Step Pyramid (Staircase)
    const stepStart = 78;
    for (let step = 0; step < 7; step++) {
      for (let sy = 0; sy <= step; sy++) {
        addBrick(stepStart + step, sy + 1);
      }
    }

    // Coins over the leap
    addCoin(86, 8.5);
    addCoin(87, 8.8);
    addCoin(88, 8.5);

    // Second smaller pyramid
    for (let step = 0; step < 4; step++) {
      for (let sy = 0; sy <= step; sy++) {
        addBrick(90 + step, sy + 1);
      }
    }

    // Flagpole at X = 98
    this.flagpole = PlumberModel.createFlagpole(10.5);
    this.flagpole.position.set(98, 0, 0);
    this.scene.add(this.flagpole);

    // Castle at X = 106
    this.castle = PlumberModel.createCastle();
    this.castle.position.set(106, 0, 0);
    this.scene.add(this.castle);
  }

  spawnPlayer() {
    this.playerMesh = PlumberModel.createPlumber();
    this.playerMesh.position.set(0, 1.0, 0);
    this.scene.add(this.playerMesh);

    this.player = {
      x: 0,
      y: 1.0,
      vx: 0,
      vy: 0,
      w: 0.7,
      h: 1.1,
      isGrounded: false,
      isSkidding: false
    };

    PlumberModel.setPlumberForm(this.playerMesh, this.form);
  }

  // =========================================================================
  // Game Loop: Update
  // =========================================================================

  update(dt, input) {
    if (!this.isRunning || this.isPaused) return;

    // Countdown Timer
    if (!this.isVictory && !this.isDead) {
      this.timeRemaining -= dt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.killPlayer('TIME UP!');
        return;
      }
    }

    // Invulnerability flashing
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
      const flash = Math.sin(this.invulnerableTimer * 25) > 0;
      this.playerMesh.visible = flash;
      if (this.invulnerableTimer <= 0) {
        this.playerMesh.visible = true;
      }
    }

    // Star powerup countdown
    if (this.starTimer > 0) {
      this.starTimer -= dt;
      // Rainbow cycling
      const hue = (Date.now() % 1000) / 1000;
      this.playerMesh.userData.redMat.color.setHSL(hue, 1, 0.6);
      this.playerMesh.userData.blueMat.color.setHSL((hue + 0.3) % 1, 1, 0.5);
      if (this.starTimer <= 0) {
        PlumberModel.setPlumberForm(this.playerMesh, this.form);
      }
    }

    // Victory sequence handling
    if (this.isVictory) {
      this.updateVictorySequence(dt);
      this.updateVisualEntities(dt);
      this.updateCamera(dt);
      return;
    }

    // Death sequence handling
    if (this.isDead) {
      this.updateDeathSequence(dt);
      this.updateVisualEntities(dt);
      this.updateCamera(dt);
      return;
    }

    // Normal Gameplay Updates
    this.handlePlayerInput(dt, input);
    this.updatePlayerPhysics(dt, input);
    this.updateBlocks(dt);
    this.updateEnemies(dt);
    this.updateCoinsAndPowerups(dt);
    this.updateFireballs(dt);
    this.updateParticles(dt);
    this.checkFlagpoleCollision();
    this.updateVisualEntities(dt);
    this.updateCamera(dt);
  }

  handlePlayerInput(dt, input) {
    let moveDir = 0;

    // Desktop keys
    const isLeft = input.isDown('KeyA') || input.isDown('ArrowLeft') || this._touchLeft;
    const isRight = input.isDown('KeyD') || input.isDown('ArrowRight') || this._touchRight;
    const isSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight') || input.isDown('KeyF') || this._touchFire;
    const isJump = input.isDown('KeyW') || input.isDown('ArrowUp') || input.isDown('Space') || this._touchJump;

    if (isLeft) moveDir -= 1;
    if (isRight) moveDir += 1;

    // Fireball Throw on tap
    if ((input.isJustPressed('KeyF') || input.isJustPressed('KeyX') || this._touchFireJustPressed) && this.form === 'fire') {
      this._touchFireJustPressed = false;
      this.throwFireball();
    }

    // Speed caps
    const maxSpeed = isSprint ? this.sprintSpeed : this.maxRunSpeed;

    if (moveDir !== 0) {
      this.player.vx += moveDir * this.runAccel * dt;
      this.player.vx = THREE.MathUtils.clamp(this.player.vx, -maxSpeed, maxSpeed);
      this.playerFacing = moveDir;

      // Check skidding
      this.player.isSkidding = (this.player.vx > 1 && moveDir < 0) || (this.player.vx < -1 && moveDir > 0);
    } else {
      // Deceleration
      this.player.isSkidding = false;
      if (this.player.vx > 0) {
        this.player.vx = Math.max(0, this.player.vx - this.friction * dt);
      } else if (this.player.vx < 0) {
        this.player.vx = Math.min(0, this.player.vx + this.friction * dt);
      }
    }

    // Jump Initiation
    if (isJump && this.player.isGrounded && !this._jumpPressedPrev) {
      this.player.vy = this.jumpVelocity;
      this.player.isGrounded = false;
      this.playJumpSfx();
    }
    this._jumpPressedPrev = isJump;

    // Variable jump gravity
    const appliedGravity = (isJump && this.player.vy > 0) ? this.lowJumpGravity : this.gravity;
    this.player.vy += appliedGravity * dt;
  }

  updatePlayerPhysics(dt, input) {
    const p = this.player;

    // Move X
    p.x += p.vx * dt;
    this.resolveHorizontalCollisions();

    // Move Y
    p.y += p.vy * dt;
    p.isGrounded = false;
    this.resolveVerticalCollisions();

    // Fall into pit
    if (p.y < -4) {
      this.killPlayer('FELL INTO THE CHASM!');
      return;
    }

    // Sync mesh position & facing
    this.playerMesh.position.set(p.x, p.y, 0);
    this.playerMesh.rotation.y = this.playerFacing > 0 ? 0 : Math.PI;

    // Animate mesh limbs
    PlumberModel.animatePlumber(
      this.playerMesh,
      dt,
      p.vx,
      p.isGrounded,
      p.isSkidding,
      this.isDead,
      this.isVictory
    );
  }

  resolveHorizontalCollisions() {
    const p = this.player;
    const halfW = p.w / 2;
    const footY = p.y;
    const headY = p.y + p.h;

    // Check blocks
    for (const b of this.levelBlocks) {
      if (b.type === 'brick' && b.isDestroyed) continue;
      const bLeft = b.x - b.w / 2;
      const bRight = b.x + b.w / 2;
      const bBottom = b.y - b.h;
      const bTop = b.y;

      // Vertical overlap check
      if (footY < bTop - 0.05 && headY > bBottom + 0.05) {
        if (p.vx > 0 && p.x + halfW > bLeft && p.x - halfW < bLeft) {
          p.x = bLeft - halfW;
          p.vx = 0;
        } else if (p.vx < 0 && p.x - halfW < bRight && p.x + halfW > bRight) {
          p.x = bRight + halfW;
          p.vx = 0;
        }
      }
    }

    // Check pipes
    for (const pipe of this.levelPipes) {
      const pLeft = pipe.x - pipe.w / 2;
      const pRight = pipe.x + pipe.w / 2;
      const pBottom = 0;
      const pTop = pipe.h;

      if (footY < pTop - 0.05 && headY > pBottom + 0.05) {
        if (p.vx > 0 && p.x + halfW > pLeft && p.x - halfW < pLeft) {
          p.x = pLeft - halfW;
          p.vx = 0;
        } else if (p.vx < 0 && p.x - halfW < pRight && p.x + halfW > pRight) {
          p.x = pRight + halfW;
          p.vx = 0;
        }
      }
    }
  }

  resolveVerticalCollisions() {
    const p = this.player;
    const halfW = p.w / 2;
    const footY = p.y;
    const headY = p.y + p.h;

    // All solid surfaces (blocks + pipes)
    const surfaces = [];
    for (const b of this.levelBlocks) {
      if (b.type === 'brick' && b.isDestroyed) continue;
      surfaces.push({
        ref: b,
        left: b.x - b.w / 2,
        right: b.x + b.w / 2,
        bottom: b.y - b.h,
        top: b.y
      });
    }

    for (const pipe of this.levelPipes) {
      surfaces.push({
        ref: pipe,
        left: pipe.x - pipe.w / 2,
        right: pipe.x + pipe.w / 2,
        bottom: 0,
        top: pipe.h
      });
    }

    for (const s of surfaces) {
      // Horizontal overlap
      if (p.x + halfW > s.left + 0.08 && p.x - halfW < s.right - 0.08) {
        // Landing on top
        if (p.vy <= 0 && footY <= s.top && footY >= s.top - 0.5) {
          p.y = s.top;
          p.vy = 0;
          p.isGrounded = true;
        }
        // Hitting head from below
        else if (p.vy > 0 && headY >= s.bottom && headY <= s.bottom + 0.5) {
          p.y = s.bottom - p.h;
          p.vy = -2;
          this.bumpBlock(s.ref);
        }
      }
    }
  }

  bumpBlock(block) {
    if (!block || !block.type) return;

    if (block.type === 'question') {
      if (block.isUsed) {
        this.playBlockBumpSfx();
        return;
      }

      block.isUsed = true;
      block.bumpY = 0.35;
      this.playBlockBumpSfx();

      // Transform appearance to spent block
      block.mesh.children[0].material.color.setHex(0x78350f);
      block.mesh.children[0].material.emissive.setHex(0x000000);

      // Dispense content
      if (block.content === 'coin') {
        this.addScore(100);
        this.addCoin();
        this.spawnBlockCoinReward(block.x, block.y + 0.5);
      } else if (block.content === 'mushroom') {
        this.spawnPowerup('mushroom', block.x, block.y + 1);
      } else if (block.content === 'fireflower') {
        this.spawnPowerup('fireflower', block.x, block.y + 1);
      } else if (block.content === 'star') {
        this.spawnPowerup('star', block.x, block.y + 1);
      }
    } else if (block.type === 'brick') {
      if (this.form === 'small') {
        block.bumpY = 0.25;
        this.playBlockBumpSfx();
      } else {
        // Shatter brick!
        block.isDestroyed = true;
        block.mesh.visible = false;
        this.addScore(50);
        this.playBrickBreakSfx();
        this.spawnBrickDebris(block.x, block.y);
      }
    }
  }

  spawnBlockCoinReward(x, y) {
    this.playCoinSfx();
    const c = PlumberModel.createCoin();
    c.position.set(x, y, 0);
    this.scene.add(c);

    // Floating upward trajectory
    const startTime = Date.now();
    const animateCoin = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed < 0.45) {
        c.position.y = y + Math.sin(elapsed * Math.PI / 0.45) * 1.2;
        c.rotation.y += 0.4;
        requestAnimationFrame(animateCoin);
      } else {
        this.scene.remove(c);
      }
    };
    animateCoin();
  }

  spawnBrickDebris(x, y) {
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
    const velocities = [
      { vx: -4, vy: 8 },
      { vx: 4, vy: 8 },
      { vx: -3, vy: 5 },
      { vx: 3, vy: 5 }
    ];

    velocities.forEach(v => {
      const chunkGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
      const chunk = new THREE.Mesh(chunkGeo, debrisMat);
      chunk.position.set(x, y, 0);
      this.scene.add(chunk);

      this.particles.push({
        mesh: chunk,
        vx: v.vx,
        vy: v.vy,
        rot: Math.random() * 8,
        life: 1.2
      });
    });
  }

  spawnPowerup(type, x, y) {
    this.playPowerupSpawnSfx();
    let powerMesh;
    if (type === 'mushroom') powerMesh = PlumberModel.createSuperMushroom();
    else if (type === 'fireflower') powerMesh = PlumberModel.createFireFlower();
    else powerMesh = PlumberModel.createCoin();

    powerMesh.position.set(x, y, 0);
    this.scene.add(powerMesh);

    this.levelPowerups.push({
      type,
      mesh: powerMesh,
      x,
      y,
      vx: type === 'mushroom' ? 2.8 : 0,
      vy: 2.0,
      collected: false
    });
  }

  throwFireball() {
    this.playFireballSfx();
    const fb = PlumberModel.createFireball();
    const spawnX = this.player.x + (this.playerFacing * 0.6);
    const spawnY = this.player.y + 0.6;
    fb.position.set(spawnX, spawnY, 0);
    this.scene.add(fb);

    this.fireballs.push({
      mesh: fb,
      x: spawnX,
      y: spawnY,
      vx: this.playerFacing * 14,
      vy: -1.5,
      bounces: 0,
      life: 2.5
    });
  }

  // =========================================================================
  // Block, Enemy & Collectible Updates
  // =========================================================================

  updateBlocks(dt) {
    for (const b of this.levelBlocks) {
      if (b.bumpY > 0) {
        b.bumpY -= dt * 3.5;
        if (b.bumpY < 0) b.bumpY = 0;
        b.mesh.position.y = b.y + Math.sin(b.bumpY * Math.PI) * 0.35;
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;

    for (const e of this.levelEnemies) {
      if (!e.alive) continue;

      if (e.type === 'piranha') {
        // Pop in and out of pipe
        e.timer += dt * 1.8;
        const popOffset = Math.sin(e.timer) * 1.2;
        e.mesh.position.y = e.baseY + Math.max(0, popOffset);

        // Check player contact
        const dist = Math.hypot(p.x - e.baseX, p.y - e.mesh.position.y);
        if (dist < 0.9 && popOffset > 0.3) {
          this.hurtPlayer();
        }
        continue;
      }

      if (e.squished) {
        e.squishTimer += dt;
        if (e.squishTimer > 0.45) {
          e.alive = false;
          this.scene.remove(e.mesh);
        }
        continue;
      }

      // Shell sliding physics
      if (e.type === 'koopa' && e.isShell) {
        if (Math.abs(e.shellSpeed) > 0.1) {
          e.x += e.shellSpeed * dt;
          e.mesh.position.x = e.x;
          e.mesh.rotation.y += e.shellSpeed * dt * 4;

          // Shell destroys other enemies!
          for (const other of this.levelEnemies) {
            if (other !== e && other.alive && Math.hypot(other.x - e.x, other.y - e.y) < 1.0) {
              other.alive = false;
              this.scene.remove(other.mesh);
              this.addScore(400);
              this.playStompSfx();
            }
          }
        }
      } else {
        // Normal patrol movement
        e.x += e.vx * dt;
        e.mesh.position.x = e.x;
        e.mesh.position.y = e.y;

        // Waddling feet animation
        if (e.type === 'goomba') {
          const waddle = Math.sin(Date.now() * 0.012) * 0.2;
          e.mesh.userData.footL.position.y = 0.08 + waddle * 0.05;
          e.mesh.userData.footR.position.y = 0.08 - waddle * 0.05;
        }

        // Turn around on block/pipe collisions
        for (const pipe of this.levelPipes) {
          if (Math.abs(e.x - pipe.x) < (pipe.w / 2 + 0.4)) {
            e.vx = -e.vx;
          }
        }
      }

      // Player vs Enemy Collision
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.95) {
        // Star Invincible Stomp
        if (this.starTimer > 0) {
          e.alive = false;
          this.scene.remove(e.mesh);
          this.addScore(300);
          this.playStompSfx();
          continue;
        }

        // Jumping on head stomp! (Player falling and above enemy)
        if (p.vy < 0 && p.y > e.y + 0.3) {
          p.vy = 12.0; // Stomp bounce!
          this.playStompSfx();

          if (e.type === 'goomba') {
            e.squished = true;
            e.mesh.scale.set(1.2, 0.2, 1.2);
            this.addScore(200);
          } else if (e.type === 'koopa') {
            if (!e.isShell) {
              e.isShell = true;
              e.mesh.userData.headGroup.visible = false;
              e.mesh.userData.shoeL.visible = false;
              e.mesh.userData.shoeR.visible = false;
              e.shellSpeed = 0;
              this.addScore(200);
            } else {
              // Kick shell!
              e.shellSpeed = p.x < e.x ? 18 : -18;
              this.addScore(400);
            }
          }
        } else {
          // Hurt player from side/bottom
          if (e.type === 'koopa' && e.isShell && Math.abs(e.shellSpeed) < 0.1) {
            // Safe kick of stationary shell
            e.shellSpeed = p.x < e.x ? 18 : -18;
            this.playStompSfx();
          } else {
            this.hurtPlayer();
          }
        }
      }
    }
  }

  updateCoinsAndPowerups(dt) {
    const p = this.player;

    // Coins
    for (const c of this.levelCoins) {
      if (c.collected) continue;
      c.mesh.rotation.y += c.mesh.userData.rotSpeed * dt;

      if (Math.hypot(p.x - c.x, p.y - c.y) < 0.9) {
        c.collected = true;
        this.scene.remove(c.mesh);
        this.addScore(100);
        this.addCoin();
        this.playCoinSfx();
      }
    }

    // Powerups
    for (const pw of this.levelPowerups) {
      if (pw.collected) continue;

      if (pw.type === 'mushroom') {
        pw.x += pw.vx * dt;
        pw.mesh.position.x = pw.x;
      }

      if (Math.hypot(p.x - pw.x, p.y - pw.y) < 1.0) {
        pw.collected = true;
        this.scene.remove(pw.mesh);
        this.playPowerupCollectSfx();

        if (pw.type === 'mushroom') {
          if (this.form === 'small') {
            this.form = 'super';
            PlumberModel.setPlumberForm(this.playerMesh, 'super');
            this.player.h = 1.35;
          }
          this.addScore(1000);
          this.showToast('SUPER MUSHROOM!', 'Power increased! You can break bricks.', '#ef4444');
        } else if (pw.type === 'fireflower') {
          this.form = 'fire';
          PlumberModel.setPlumberForm(this.playerMesh, 'fire');
          this.player.h = 1.35;
          this.addScore(1000);
          this.showToast('FIRE FLOWER!', 'Press [F] or Fire to shoot fireballs!', '#f97316');
        } else if (pw.type === 'star') {
          this.starTimer = 12.0;
          this.addScore(1000);
          this.showToast('STAR POWER!', 'INVINCIBLE! Trample all enemies!', '#facc15');
        }
      }
    }
  }

  updateFireballs(dt) {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.life -= dt;
      if (fb.life <= 0) {
        this.scene.remove(fb.mesh);
        this.fireballs.splice(i, 1);
        continue;
      }

      fb.x += fb.vx * dt;
      fb.vy += this.gravity * 0.7 * dt;
      fb.y += fb.vy * dt;

      // Bounce on ground
      if (fb.y <= 0.25) {
        fb.y = 0.25;
        fb.vy = 6.2;
      }

      fb.mesh.position.set(fb.x, fb.y, 0);

      // Check collision with enemies
      for (const e of this.levelEnemies) {
        if (e.alive && Math.hypot(e.x - fb.x, e.y - fb.y) < 0.9) {
          e.alive = false;
          this.scene.remove(e.mesh);
          this.addScore(200);
          this.playStompSfx();

          this.scene.remove(fb.mesh);
          this.fireballs.splice(i, 1);
          break;
        }
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      pt.mesh.position.x += pt.vx * dt;
      pt.vy += this.gravity * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.rotation.z += pt.rot * dt;
    }
  }

  // =========================================================================
  // Flagpole & Victory
  // =========================================================================

  checkFlagpoleCollision() {
    if (!this.flagpole || this.isVictory) return;

    const fpX = this.flagpole.position.x;
    if (Math.abs(this.player.x - fpX) < 0.7) {
      this.triggerFlagpoleVictory();
    }
  }

  triggerFlagpoleVictory() {
    this.isVictory = true;
    this.victoryPhase = 1; // Sliding down pole
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.x = this.flagpole.position.x - 0.25;

    // Calculate height score bonus
    const grabHeight = Math.max(1, Math.min(10, this.player.y));
    this.flagBonus = Math.floor(grabHeight * 500);
    this.addScore(this.flagBonus);

    this.playFlagpoleSfx();
    this.showToast('COURSE CLEAR!', `Flagpole Bonus +${this.flagBonus} PTS!`, '#10b981');
  }

  updateVictorySequence(dt) {
    this.victoryTimer += dt;

    if (this.victoryPhase === 1) {
      // Sliding down pole
      this.player.y -= dt * 6.5;
      this.flagpole.userData.flagMesh.position.y -= dt * 6.5;

      if (this.player.y <= 0.8) {
        this.player.y = 0.8;
        this.victoryPhase = 2; // Walk towards castle
      }
      this.playerMesh.position.set(this.player.x, this.player.y, 0);
    } else if (this.victoryPhase === 2) {
      // Walk into castle
      this.player.vx = 3.5;
      this.player.x += this.player.vx * dt;
      this.playerMesh.position.set(this.player.x, this.player.y, 0);
      this.playerFacing = 1;
      this.playerMesh.rotation.y = 0;

      PlumberModel.animatePlumber(this.playerMesh, dt, this.player.vx, true, false, false, false);

      if (this.player.x >= this.castle.position.x - 0.2) {
        this.victoryPhase = 3; // Entered castle
        this.playerMesh.visible = false;
        this.showWinModal();
      }
    }
  }

  showWinModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('plumberWinModal');
    const scoreEl = document.getElementById('winScore');
    const coinsEl = document.getElementById('winCoins');
    const timeEl = document.getElementById('winTime');
    const rankEl = document.getElementById('winRank');

    if (scoreEl) scoreEl.textContent = this.score.toString().padStart(6, '0');
    if (coinsEl) coinsEl.textContent = `x ${this.coins}`;
    if (timeEl) timeEl.textContent = `${Math.ceil(this.timeRemaining)}s`;

    let rank = 'SUPER STAR [S]';
    if (this.timeRemaining < 200) rank = 'HERO [A]';
    if (this.score < 3000) rank = 'PLUMBER [B]';
    if (rankEl) rankEl.textContent = rank;

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  // =========================================================================
  // Damage & Death
  // =========================================================================

  hurtPlayer() {
    if (this.invulnerableTimer > 0 || this.isDead || this.isVictory) return;

    if (this.form === 'fire' || this.form === 'super') {
      // Downgrade to small
      this.form = 'small';
      PlumberModel.setPlumberForm(this.playerMesh, 'small');
      this.player.h = 1.1;
      this.invulnerableTimer = 2.2;
      this.playStompSfx();
      this.showToast('POWER DOWN', 'Operate carefully!', '#ef4444');
    } else {
      this.killPlayer('ELIMINATED BY ENEMY!');
    }
  }

  killPlayer(reason = 'LIFE LOST') {
    if (this.isDead || this.isVictory) return;
    this.isDead = true;
    this.deathTimer = 0;
    this.player.vx = 0;
    this.player.vy = 14.0; // Death leap upward!
    this.playDeathSfx();

    this.lives -= 1;
    this.showToast('LIFE LOST', reason, '#ef4444');
  }

  updateDeathSequence(dt) {
    this.deathTimer += dt;
    this.player.vy += this.gravity * 0.7 * dt;
    this.player.y += this.player.vy * dt;

    this.playerMesh.position.set(this.player.x, this.player.y, 0);
    this.playerMesh.rotation.z += dt * 4;

    if (this.deathTimer > 2.8) {
      if (this.lives > 0) {
        // Respawn
        this.respawnPlayer();
      } else {
        // Game Over modal
        this.showGameOverModal();
      }
    }
  }

  respawnPlayer() {
    this.isDead = false;
    this.playerMesh.rotation.z = 0;
    this.player.x = Math.max(0, this.player.x - 8);
    this.player.y = 4.0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.form = 'small';
    PlumberModel.setPlumberForm(this.playerMesh, 'small');
    this.invulnerableTimer = 2.5;
  }

  showGameOverModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('plumberGameOverModal');
    const finalScore = document.getElementById('gameOverScore');
    if (finalScore) finalScore.textContent = this.score.toString().padStart(6, '0');

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  // =========================================================================
  // Camera & Visual Parallax
  // =========================================================================

  updateCamera(dt) {
    const p = this.player;

    // Smooth camera tracking (Side-scrolling focus)
    const targetX = p.x + (this.playerFacing * 1.5);
    const targetY = Math.max(4.0, p.y + 2.0); // Keep ground in lower third

    this.camTargetX += (targetX - this.camTargetX) * (dt * 5.0);
    this.camTargetY += (targetY - this.camTargetY) * (dt * 4.0);
    
    // Prevent camera from going too far left (past start of level)
    this.camTargetX = Math.max(0, this.camTargetX);

    // Update orthographic camera position (pure 2D view)
    this.camera.position.set(this.camTargetX, this.camTargetY, 15.0);
    this.camera.lookAt(this.camTargetX, this.camTargetY, 0);
  }

  updateVisualEntities(dt) {
    // Parallax background clouds drift
    for (const c of this.clouds) {
      c.position.x += dt * 0.4;
      if (c.position.x > this.player.x + 45) {
        c.position.x = this.player.x - 35;
      }
    }
  }

  cycleCameraMode() {
    this.camMode = (this.camMode + 1) % this.camModes.length;
    this.showToast('CAMERA VIEW', this.camModes[this.camMode], '#38bdf8');
  }

  // =========================================================================
  // Score, Coins & HUD
  // =========================================================================

  addScore(pts) {
    this.score += pts;
  }

  addCoin() {
    this.coins += 1;
    if (this.coins >= 100) {
      this.coins = 0;
      this.lives += 1;
      this.showToast('1-UP!', 'Earned an extra life!', '#10b981');
    }
  }

  updateHUD() {
    if (typeof document === 'undefined') return;
    const scoreEl = document.getElementById('hudMarioScore');
    const coinsEl = document.getElementById('hudMarioCoins');
    const livesEl = document.getElementById('hudMarioLives');
    const timeEl = document.getElementById('hudMarioTime');
    const formEl = document.getElementById('hudMarioForm');

    if (scoreEl) scoreEl.textContent = this.score.toString().padStart(6, '0');
    if (coinsEl) coinsEl.textContent = `x ${this.coins.toString().padStart(2, '0')}`;
    if (livesEl) livesEl.textContent = `x ${this.lives}`;
    if (timeEl) timeEl.textContent = Math.ceil(this.timeRemaining).toString().padStart(3, '0');
    if (formEl) {
      if (this.starTimer > 0) formEl.textContent = `STAR (${Math.ceil(this.starTimer)}s)`;
      else if (this.form === 'fire') formEl.textContent = 'FIRE PLUMBER';
      else if (this.form === 'super') formEl.textContent = 'SUPER';
      else formEl.textContent = 'SMALL';
    }

    this.bindHUDEvents();
  }

  getHUDHtml() {
    return `
      <div class="plumber-ui-layer">
        <!-- Retro Arcade Top HUD Bar -->
        <header class="plumber-top-bar">
          <div class="plumber-logo-badge plumber-glass interactive">
            <span style="font-size: 1.5rem;">🍄</span>
            <div>
              <h1 class="plumber-logo-title">SUPER PLUMBER</h1>
              <span class="plumber-logo-sub">RETRO KINGDOM 3D</span>
            </div>
          </div>

          <!-- Mission Retro Scoreboard -->
          <div class="plumber-scoreboard plumber-glass interactive">
            <div class="plumber-stat-item">
              <span class="stat-label">SCORE</span>
              <span class="stat-val highlight" id="hudMarioScore">000000</span>
            </div>
            <div class="stat-divider"></div>
            <div class="plumber-stat-item">
              <span class="stat-label">COINS</span>
              <span class="stat-val gold" id="hudMarioCoins">x 00</span>
            </div>
            <div class="stat-divider"></div>
            <div class="plumber-stat-item">
              <span class="stat-label">LIVES</span>
              <span class="stat-val red" id="hudMarioLives">x 3</span>
            </div>
            <div class="stat-divider"></div>
            <div class="plumber-stat-item">
              <span class="stat-label">TIME</span>
              <span class="stat-val" id="hudMarioTime">400</span>
            </div>
            <div class="stat-divider"></div>
            <div class="plumber-stat-item">
              <span class="stat-label">FORM</span>
              <span class="stat-val form-badge" id="hudMarioForm">SMALL</span>
            </div>
          </div>

          <!-- Top Action Buttons -->
          <div class="plumber-top-actions interactive">
            <button class="plumber-btn-icon" id="btnPlumberCam" title="Toggle Camera View (2.5D / Pure 2D / 3D Isometric)">🎥</button>
            <button class="plumber-btn-icon" id="btnPlumberSound" title="Toggle Sound">🔊</button>
          </div>
        </header>

        <!-- Center Announcement Toast -->
        <div class="plumber-toast-center plumber-glass" id="plumberToast">
          <div class="plumber-toast-title" id="plumberToastTitle">WORLD 1-1</div>
          <div class="plumber-toast-sub" id="plumberToastSub">Mushroom Kingdom 3D!</div>
        </div>

        <!-- Bottom Controls Guide & Mobile Touch Buttons -->
        <footer class="plumber-bottom-bar">
          <div class="plumber-guide-card plumber-glass interactive">
            <div class="guide-item">
              <span>Run:</span> <kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd>
            </div>
            <div class="guide-item">
              <span>Jump:</span> <kbd>W</kbd> or <kbd>Space</kbd>
            </div>
            <div class="guide-item">
              <span>Sprint / Fireball:</span> <kbd>Shift</kbd> or <kbd>F</kbd>
            </div>
            <div class="guide-item">
              <span>Camera:</span> <kbd>C</kbd>
            </div>
          </div>

          <!-- Mobile On-Screen Touch Pad -->
          <div class="plumber-mobile-controls interactive">
            <div class="plumber-dpad">
              <button class="plumber-touch-btn" id="mPlumberLeft">◀</button>
              <button class="plumber-touch-btn" id="mPlumberRight">▶</button>
            </div>
            <div class="plumber-action-pad">
              <button class="plumber-touch-btn sprint-btn" id="mPlumberFire">FIRE / RUN</button>
              <button class="plumber-touch-btn jump-btn" id="mPlumberJump">JUMP</button>
            </div>
          </div>
        </footer>

        <!-- Stage Clear Victory Modal -->
        <div class="plumber-modal-overlay" id="plumberWinModal" style="display: none;">
          <div class="plumber-modal-box plumber-glass interactive">
            <div style="font-size: 3.5rem;">⭐</div>
            <h2 class="plumber-modal-title" style="color: #facc15;">STAGE CLEARED!</h2>
            <p style="color: #94a3b8; font-size: 0.95rem;">You reached the castle and conquered the Mushroom Kingdom!</p>
            
            <div class="plumber-score-summary">
              <div class="summary-col">
                <span class="label">FINAL SCORE</span>
                <span class="val" id="winScore">008450</span>
              </div>
              <div class="summary-col">
                <span class="label">COINS</span>
                <span class="val" id="winCoins">x 24</span>
              </div>
              <div class="summary-col">
                <span class="label">TIME LEFT</span>
                <span class="val" id="winTime">265s</span>
              </div>
              <div class="summary-col">
                <span class="label">RANK</span>
                <span class="val" id="winRank" style="color: #facc15;">SUPER STAR [S]</span>
              </div>
            </div>

            <button class="primary-btn gold-btn" id="btnPlumberPlayAgain">Play Again ➔</button>
          </div>
        </div>

        <!-- Game Over Modal -->
        <div class="plumber-modal-overlay" id="plumberGameOverModal" style="display: none;">
          <div class="plumber-modal-box plumber-glass interactive">
            <div style="font-size: 3.5rem;">💀</div>
            <h2 class="plumber-modal-title" style="color: #ef4444;">GAME OVER</h2>
            <p style="color: #94a3b8; font-size: 0.95rem;">Out of lives! Return to World 1-1 to try again.</p>
            <div class="plumber-score-summary">
              <div class="summary-col">
                <span class="label">FINAL SCORE</span>
                <span class="val" id="gameOverScore">001200</span>
              </div>
            </div>
            <button class="primary-btn red-btn" id="btnPlumberRetry">Retry Level 🔄</button>
          </div>
        </div>
      </div>
    `;
  }

  showToast(title, sub, color = '#ef4444') {
    if (typeof document === 'undefined') return;
    const toast = document.getElementById('plumberToast');
    const tTitle = document.getElementById('plumberToastTitle');
    const tSub = document.getElementById('plumberToastSub');
    if (!toast || !tTitle || !tSub) return;

    tTitle.textContent = title;
    tTitle.style.color = color;
    tSub.textContent = sub;
    toast.classList.add('show');

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  bindHUDEvents() {
    if (typeof document === 'undefined') return;
    // Camera Toggle
    const btnCam = document.getElementById('btnPlumberCam');
    if (btnCam && !btnCam._bound) {
      btnCam._bound = true;
      btnCam.addEventListener('click', () => this.cycleCameraMode());
    }

    // Sound Toggle
    const btnSound = document.getElementById('btnPlumberSound');
    if (btnSound && !btnSound._bound) {
      btnSound._bound = true;
      btnSound.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
        this.showToast('AUDIO', this.soundEnabled ? 'Sound ON' : 'Muted', this.soundEnabled ? '#10b981' : '#ef4444');
      });
    }

    // Modal buttons
    const btnPlayAgain = document.getElementById('btnPlumberPlayAgain');
    if (btnPlayAgain && !btnPlayAgain._bound) {
      btnPlayAgain._bound = true;
      btnPlayAgain.addEventListener('click', () => {
        const modal = document.getElementById('plumberWinModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
        this.start(this.currentMode);
      });
    }

    const btnRetry = document.getElementById('btnPlumberRetry');
    if (btnRetry && !btnRetry._bound) {
      btnRetry._bound = true;
      btnRetry.addEventListener('click', () => {
        const modal = document.getElementById('plumberGameOverModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
        this.start(this.currentMode);
      });
    }

    // Touch controls
    const mLeft = document.getElementById('mPlumberLeft');
    const mRight = document.getElementById('mPlumberRight');
    const mJump = document.getElementById('mPlumberJump');
    const mFire = document.getElementById('mPlumberFire');

    const bindTouch = (el, onDown, onUp) => {
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(); });
      el.addEventListener('pointercancel', (e) => { e.preventDefault(); onUp(); });
    };

    bindTouch(mLeft, () => { this._touchLeft = true; }, () => { this._touchLeft = false; });
    bindTouch(mRight, () => { this._touchRight = true; }, () => { this._touchRight = false; });
    bindTouch(mJump, () => { this._touchJump = true; }, () => { this._touchJump = false; });
    bindTouch(mFire, () => {
      this._touchFire = true;
      this._touchFireJustPressed = true;
    }, () => {
      this._touchFire = false;
    });

    // Keyboard 'C' camera key listener
    if (!this._keyListenerBound && typeof window !== 'undefined') {
      this._keyListenerBound = true;
      window.addEventListener('keydown', (e) => {
        if (!this.isRunning || this.isPaused) return;
        if (e.code === 'KeyC') {
          this.cycleCameraMode();
        }
      });
    }
  }

  getControlsGuide() {
    return [
      { label: 'Run Left / Right', keys: 'A / D or ← / →' },
      { label: 'Jump', keys: 'W / Space / ↑' },
      { label: 'Sprint / Fireball', keys: 'Shift / F / X' },
      { label: 'Toggle Camera View', keys: 'C or 🎥 Button' },
      { label: 'Toggle Sound Effects', keys: '🔊 Button' }
    ];
  }

  destroy() {
    this.isRunning = false;
    this.engine._clearScene();
  }
}
