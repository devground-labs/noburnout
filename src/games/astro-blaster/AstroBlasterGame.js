import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { createFighterShip, createJetShip, createAsteroidMesh, createEnemyJetMesh, createDogfighterMesh, createBombMesh } from './ShipModel.js';

const TRANSFORM_TIME = 0.55; // seconds for the barrel-roll transformation
const TRANSFORM_COOLDOWN = 2.2;
const JET_SPEED = 1.45; // the jet flies faster than the starfighter
const JET_HULL = 0.35; // ...but is a bigger target
const BOMB_COST = 100; // charge needed for the atom bomb

export class AstroBlasterGame extends BaseGame {
  constructor() {
    super({
      id: 'astro-blaster',
      name: 'Astro-Blaster 3D',
      subtitle: 'High-Velocity Deep Space Arcade Combat',
      description: 'Pilot a starfighter through dense asteroid belts and into dogfights with AI fighter planes. Transform into a jet with homing missiles, shoot down rivals to patch your shields, and charge up an atom bomb to annihilate a planet.',
      icon: '🚀',
      badge: 'Arcade Space Combat',
      genre: '3D Space Shooter',
      players: '1 Player',
      modes: ['Arcade Survival', 'Practice Drift']
    });

    this.ship = null;
    this.lasers = [];
    this.asteroids = [];
    this.particles = [];
    this.enemies = [];
    this.planets = [];
    this.starfield = null;
    this.lowerStarfield = null;

    // Dogfight: AI planes, their bolts, and the jet's homing missiles
    this.dogfighters = [];
    this.bolts = [];
    this.missiles = [];
    this.dogTimer = 0;
    this.dogSpawns = 0;
    this.form = 'starfighter'; // or 'jet'
    this.tf = { active: false, t: 0, swapped: false, to: 'jet', cd: 0 };
    this._pod = 1;
    // Atom bomb: charges over time and with kills, then annihilates a planet
    this.bombCharge = 50;
    this.bomb = null;
    this.wipe = null;
    this.timeScale = 1;
    this.shake = 0;
    this._shaking = false;

    this.score = 0;
    this.highScore = 0;
    this.multiplier = 1;
    this.shield = 100;
    this.spawnTimer = 0;
    this.enemySpawnTimer = 0;
    this.planetSpawnTimer = 0;
    this.distance = 0;
    this.fireCooldown = 0;
    this.xLimit = 11; // half-width of the ship's playfield (shrinks on portrait screens)
    this.fieldScale = 1; // scales enemy/asteroid spawn width to match xLimit
    this._touch = { x: 0, y: 0 }; // virtual joystick, each axis in [-1, 1] (y up)
    this._touchFire = false;
    this.gameOver = false;
  }

  async init(engine) {
    await super.init(engine);

    // A deep-indigo toy-box cosmos (the previous background/fog come back in destroy())
    this._prevBackground = this.scene.background;
    this._prevFog = this.scene.fog;
    this.scene.background = new THREE.Color(0x161a5e);
    this.scene.fog = new THREE.FogExp2(0x161a5e, 0.012);

    const amb = new THREE.AmbientLight(0x9aa5ff, 3.2);
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 2.6);
    dir.position.set(10, 30, -20);
    this.scene.add(dir);

    // Ship Floodlight initialization
    this.floodLightOn = true;
    this.floodLight = new THREE.SpotLight(0xffffff, 25.0); // Brighter floodlight
    this.floodLight.position.set(0, 0, -2);
    this.floodLight.angle = Math.PI / 2.5; // Wider angle
    this.floodLight.penumbra = 0.5;
    this.floodLight.decay = 0.5; // Less decay so it reaches further
    this.floodLight.distance = 350;
    
    this.floodLightTarget = new THREE.Object3D();
    this.floodLightTarget.position.set(0, 0, -100);

    // Toggle floodlight with 'F' key
    this.handleKeyDown = (e) => {
      if (e.code === 'KeyT' && !e.repeat) this.startTransform();
      if (e.code === 'KeyB' && !e.repeat) this.launchBomb();
      if (e.code === 'KeyF' || e.code === 'KeyL') {
        this.floodLightOn = !this.floodLightOn;
        this.floodLight.intensity = this.floodLightOn ? 15.0 : 0;
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    // Lower Starfield Particle System
    const lowerStarGeo = new THREE.BufferGeometry();
    const lowerStarCount = 800;
    const lowerStarPositions = new Float32Array(lowerStarCount * 3);
    for (let i = 0; i < lowerStarCount * 3; i += 3) {
      lowerStarPositions[i] = (Math.random() - 0.5) * 200;
      lowerStarPositions[i + 1] = -25 - Math.random() * 40; // Below the game area
      lowerStarPositions[i + 2] = -150 + Math.random() * 200;
    }
    lowerStarGeo.setAttribute('position', new THREE.BufferAttribute(lowerStarPositions, 3));
    const lowerStarMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      transparent: true,
      opacity: 0.85
    });
    this.lowerStarfield = new THREE.Points(lowerStarGeo, lowerStarMat);
    this.scene.add(this.lowerStarfield);

    // The player's ship: a container holding both forms (starfighter and jet). The transformation
    // swaps which one is visible while the model barrel-rolls.
    this.shipMesh = new THREE.Group();
    this.models = { starfighter: createFighterShip(), jet: createJetShip() };
    this.models.jet.visible = false;
    this.shipMesh.add(this.models.starfighter, this.models.jet);
    this.shipMesh.add(this.floodLight);
    this.shipMesh.add(this.floodLightTarget);
    this.floodLight.target = this.floodLightTarget;
    this.scene.add(this.shipMesh);

    // A red ring that marks the planet the atom bomb will hit
    this.lockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide })
    );
    this.lockRing.renderOrder = 10;
    this.lockRing.visible = false;
    this.scene.add(this.lockRing);

    // Shared geometry and materials for bolts, missiles and sparks
    const missileBody = new THREE.CapsuleGeometry(0.2, 0.8, 4, 8);
    missileBody.rotateX(Math.PI / 2);
    const missileNose = new THREE.ConeGeometry(0.2, 0.45, 8);
    missileNose.rotateX(Math.PI / 2);
    missileNose.translate(0, 0, 0.7);
    this.fx = {
      boltGeo: new THREE.SphereGeometry(0.42, 12, 10),
      boltMat: new THREE.MeshBasicMaterial({ color: 0xff6b5b }),
      coreMat: new THREE.MeshBasicMaterial({ color: 0xffe9b8 }),
      missileBody,
      missileNose,
      missileMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
      noseMat: new THREE.MeshStandardMaterial({ color: 0xff6b5b, roughness: 0.4 }),
      smokeGeo: new THREE.SphereGeometry(0.3, 8, 6),
      smokeMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      sparkGeo: new THREE.DodecahedronGeometry(0.22, 0),
      sparkMats: [0xffd23f, 0xff6b5b, 0xffffff].map(c => new THREE.MeshBasicMaterial({ color: c })),
      ringGeo: new THREE.RingGeometry(0.8, 1.0, 40)
    };

    this.ship = {
      x: 0,
      y: 0,
      z: 14,
      targetX: 0,
      targetY: 0,
      roll: 0
    };

    // Camera setup for space flight
    this.applyView(this.camera.aspect);
    this.camera.lookAt(0, 0, -10);
  }

  start(mode = 'Arcade Survival') {
    super.start(mode);
    this.score = 0;
    this.multiplier = 1;
    this.shield = 100;
    this.gameOver = false;

    // Clear active space objects
    this.lasers.forEach(l => this.scene.remove(l.mesh));
    this.lasers = [];
    this.asteroids.forEach(a => this.scene.remove(a.mesh));
    this.asteroids = [];
    if (this.enemies) {
      this.enemies.forEach(e => this.scene.remove(e.mesh));
      this.enemies = [];
    }
    if (this.planets) {
      this.planets.forEach(p => this.scene.remove(p.mesh));
      this.planets = [];
    }
    [...this.dogfighters, ...this.bolts, ...this.missiles].forEach(o => this.scene.remove(o.mesh));
    this.dogfighters = [];
    this.bolts = [];
    this.missiles = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.dogTimer = 8; // the first bogey arrives soon after the start
    if (this.bomb) this.scene.remove(this.bomb.mesh);
    this.bomb = null;
    this.wipe = null;
    this.bombCharge = 50;
    this.timeScale = 1;
    this.shake = 0;
    this.dogSpawns = 0;
    this.setForm('starfighter');
    this.tf = { active: false, t: 0, swapped: false, to: 'jet', cd: 0 };

    this.distance = 0;
    this.enemySpawnTimer = 0;
    this.planetSpawnTimer = 7; // a first planet drifts into view within a few seconds

    this.ship.x = 0;
    this.ship.y = 0;
    this.ship.targetX = 0;
    this.ship.targetY = 0;

    const modal = document.getElementById('astro-gameover-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  /**
   * Frames the playfield for the screen shape. The shared camera has a fixed
   * vertical FOV, so on a portrait phone the sides of the playfield would be
   * off-screen. Widen the FOV a little and narrow the playfield (ship range and
   * spawn width) to what is actually visible.
   */
  applyView(aspect) {
    const BASE_FOV = 55;
    const BASE_CAM_Z = 28;
    const SHIP_HALF_WIDTH = 3; // wing tips must stay on screen at the playfield edge
    const portrait = Math.max(0, 1 - aspect);

    // Widen the FOV a little and pull the camera back as the screen gets narrower
    const fov = Math.min(85, BASE_FOV + portrait * 60);
    const camZ = BASE_CAM_Z + portrait * 14;
    this.camera.fov = fov;
    this.camera.position.set(0, 10, camZ);
    this.camera.lookAt(0, 0, -10);
    this.camera.updateProjectionMatrix();
    this._camBase = { y: 10, z: camZ };

    // Visible half-width at the ship's plane, then fit the playfield inside it
    const planeDist = camZ - 14 + 2;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * planeDist * aspect;
    this.xLimit = Math.min(11, Math.max(4, halfWidth - SHIP_HALF_WIDTH));
    this.fieldScale = this.xLimit / 11;
  }

  onResize(width, height) {
    this.applyView(width / height);
  }

  spawnPlanet() {
    const radius = 25 + Math.random() * 15;
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const colors = [0xff6b5b, 0xffd23f, 0x5ee0a0, 0xff8fb8, 0x8ad8ff, 0xa78bfa];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const mat = new THREE.MeshStandardMaterial({ 
      color: color, 
      roughness: 0.55,
      metalness: 0,
      fog: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    const x = (Math.random() - 0.5) * 120;
    const y = -45 - Math.random() * 20; // Pass below the player
    const z = -200;

    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.scene.add(mesh);

    this.planets.push({
      mesh,
      radius,
      vz: 12 + Math.random() * 8, // Slow moving
      rotY: (Math.random() - 0.5) * 0.05
    });
  }

  spawnAsteroid(difficultyLevel = 0) {
    const radius = 1.2 + Math.random() * 1.6;
    const mesh = createAsteroidMesh(radius);
    const x = (Math.random() - 0.5) * 44 * this.fieldScale;
    const y = (Math.random() - 0.5) * 18;
    const z = -75;

    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const extraSpeed = difficultyLevel * 5;

    this.asteroids.push({
      mesh,
      radius,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 2,
      vz: 26 + Math.random() * 14 + extraSpeed,
      rotX: (Math.random() - 0.5) * 3,
      rotY: (Math.random() - 0.5) * 3
    });
  }

  spawnEnemy(difficultyLevel = 0) {
    const mesh = createEnemyJetMesh();
    const x = (Math.random() - 0.5) * 28 * this.fieldScale;
    const y = (Math.random() - 0.5) * 14;
    const z = -80;

    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const extraSpeed = difficultyLevel * 6;

    this.enemies.push({
      mesh,
      radius: 1.2,
      vx: 0,
      vy: 0,
      vz: 40 + Math.random() * 20 + extraSpeed
    });
  }

  fireBlasters() {
    if (this.fireCooldown > 0 || this.gameOver) return;
    this.fireCooldown = 0.14;

    this.audio.laser(960, 0.14);

    [-1.8, 1.8].forEach(offsetX => {
      const geo = new THREE.CylinderGeometry(0.14, 0.14, 2.4, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(this.ship.x + offsetX, this.ship.y, this.ship.z - 1.5);
      this.scene.add(mesh);

      this.lasers.push({
        mesh,
        x: this.ship.x + offsetX,
        y: this.ship.y,
        z: this.ship.z - 1.5,
        vz: -85,
        life: 1.4
      });
    });
  }

  update(dt, input) {
    // Slow motion for the big moments (the clock eases back to normal on its own)
    const rawDt = dt;
    dt *= this.timeScale;
    this.timeScale = Math.min(1, this.timeScale + rawDt * 0.9);
    this.updateShake(rawDt);

    // 1. Hyperspace starfield illusion removed

    // 1. Move Lower Starfield
    if (this.lowerStarfield) {
      const lowerPos = this.lowerStarfield.geometry.attributes.position;
      for (let i = 2; i < lowerPos.count * 3; i += 3) {
        lowerPos.array[i] += 40 * dt;
        if (lowerPos.array[i] > 50) {
          lowerPos.array[i] = -150;
        }
      }
      lowerPos.needsUpdate = true;
    }

    if (this.gameOver) return;

    // 2. Player Ship Controls
    const p1In = input.getP1();
    const speed = 28 * (this.form === 'jet' ? JET_SPEED : 1);
    if (p1In.left) this.ship.targetX -= speed * dt;
    if (p1In.right) this.ship.targetX += speed * dt;
    if (p1In.up) this.ship.targetY += speed * dt;
    if (p1In.down) this.ship.targetY -= speed * dt;
    // Virtual joystick (touch): analog, so a gentle push moves the ship gently
    this.ship.targetX += this._touch.x * speed * dt;
    this.ship.targetY += this._touch.y * speed * dt;

    // Clamping to tighter screen volume based on camera perspective
    this.ship.targetX = Math.max(-this.xLimit, Math.min(this.xLimit, this.ship.targetX));
    // Camera is looking slightly down, so the visible Y center is around +6 at Z=14
    this.ship.targetY = Math.max(1, Math.min(11, this.ship.targetY));

    // Smooth lerp
    this.ship.x = THREE.MathUtils.lerp(this.ship.x, this.ship.targetX, dt * 10);
    this.ship.y = THREE.MathUtils.lerp(this.ship.y, this.ship.targetY, dt * 10);

    // Dynamic banking roll
    const targetRoll = (this.ship.targetX - this.ship.x) * -0.22 * (this.form === 'jet' ? 1.4 : 1);
    this.ship.roll = THREE.MathUtils.lerp(this.ship.roll, targetRoll, dt * 8);

    this.shipMesh.position.set(this.ship.x, this.ship.y, this.ship.z);
    this.shipMesh.rotation.z = this.ship.roll;
    // The jet also pitches with climbs and dives
    this.shipMesh.rotation.x = this.form === 'jet' ? (this.ship.targetY - this.ship.y) * 0.05 : 0;
    this.updateTransform(dt);

    // Fire handling
    if (p1In.fire || input.mouse.isDown || this._touchFire) {
      this.fireWeapons();
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // 3. Difficulty and Spawning
    const forwardSpeed = 40;
    this.distance += forwardSpeed * dt;
    const difficultyLevel = Math.floor(this.distance / 500);

    this.spawnTimer += dt;
    const baseRate = this.currentMode === 'Practice Drift' ? 1.0 : 0.35;
    const rate = Math.max(0.15, baseRate - (difficultyLevel * 0.05));
    
    if (this.spawnTimer >= rate) {
      this.spawnTimer = 0;
      this.spawnAsteroid(difficultyLevel);
    }

    if (this.currentMode !== 'Practice Drift') {
      this.enemySpawnTimer += dt;
      const enemyRate = Math.max(0.6, 2.5 - (difficultyLevel * 0.3));
      if (this.enemySpawnTimer >= enemyRate) {
        this.enemySpawnTimer = 0;
        this.spawnEnemy(difficultyLevel);
      }
    }

    // AI dogfighters: they arrive a few seconds in and get more numerous and sharper over time
    if (this.currentMode !== 'Practice Drift' && this.distance > 300) {
      this.dogTimer += dt;
      const cap = Math.min(4, 1 + Math.floor(difficultyLevel / 2));
      const interval = Math.max(3.5, 9 - difficultyLevel * 0.8);
      if (this.dogTimer >= interval && this.dogfighters.length < cap) {
        this.dogTimer = 0;
        this.spawnDogfighter(difficultyLevel);
      }
    }

    this.planetSpawnTimer += dt;
    if (this.planetSpawnTimer >= 10.0) { // Spawn one roughly every 10 seconds
      this.planetSpawnTimer = 0;
      this.spawnPlanet();
    }

    // Update Planets
    if (this.planets) {
      for (let i = this.planets.length - 1; i >= 0; i--) {
        const p = this.planets[i];
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.y += p.rotY * dt;
        if (p.mesh.position.z > 50) {
          this.scene.remove(p.mesh);
          this.planets.splice(i, 1);
        }
      }
    }

    // 4. Update Lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.z += l.vz * dt;
      l.life -= dt;
      l.mesh.position.set(l.x, l.y, l.z);

      if (l.z < -85 || l.life <= 0) {
        this.scene.remove(l.mesh);
        this.lasers.splice(i, 1);
      }
    }

    // 5. Update Asteroids & Collisions
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.mesh.position.x += a.vx * dt;
      a.mesh.position.y += a.vy * dt;
      a.mesh.position.z += a.vz * dt;
      a.mesh.rotation.x += a.rotX * dt;
      a.mesh.rotation.y += a.rotY * dt;

      // Check collision with Lasers
      let hit = false;
      for (let j = this.lasers.length - 1; j >= 0; j--) {
        const l = this.lasers[j];
        const dist = a.mesh.position.distanceTo(l.mesh.position);
        if (dist < a.radius + 0.6) {
          hit = true;
          this.scene.remove(l.mesh);
          this.lasers.splice(j, 1);
          break;
        }
      }

      if (hit) {
        this.destroyAsteroid(a, true);
        this.asteroids.splice(i, 1);
        continue;
      }

      // Check collision with Ship
      const shipDist = a.mesh.position.distanceTo(this.shipMesh.position);
      if (shipDist < a.radius + 1.6 + this.hullBonus()) {
        this.audio.hit();
        this.destroyAsteroid(a, false);
        this.asteroids.splice(i, 1);

        if (this.currentMode !== 'Practice Drift') {
          this.shield = Math.max(0, this.shield - 25);
          this.multiplier = 1;
          if (this.shield <= 0) {
            this.triggerGameOver();
          }
        }
        continue;
      }

      // Past camera
      if (a.mesh.position.z > 30) {
        this.scene.remove(a.mesh);
        this.asteroids.splice(i, 1);
      }
    }

    // 5.5 Update Enemies
    if (this.enemies) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        
        // Slight homing towards player
        const dx = this.ship.x - e.mesh.position.x;
        const dy = this.ship.y - e.mesh.position.y;
        e.vx = THREE.MathUtils.lerp(e.vx, dx * 0.5, dt);
        e.vy = THREE.MathUtils.lerp(e.vy, dy * 0.5, dt);
        
        e.mesh.position.x += e.vx * dt;
        e.mesh.position.y += e.vy * dt;
        e.mesh.position.z += e.vz * dt;

        // Collision with lasers
        let hit = false;
        for (let j = this.lasers.length - 1; j >= 0; j--) {
          const l = this.lasers[j];
          if (e.mesh.position.distanceTo(l.mesh.position) < e.radius + 0.6) {
            hit = true;
            this.scene.remove(l.mesh);
            this.lasers.splice(j, 1);
            break;
          }
        }
        if (hit) {
          this.destroyEnemy(e, true);
          this.enemies.splice(i, 1);
          continue;
        }

        // Collision with ship
        if (e.mesh.position.distanceTo(this.shipMesh.position) < e.radius + 1.2 + this.hullBonus()) {
          this.audio.hit();
          this.destroyEnemy(e, false);
          this.enemies.splice(i, 1);
          
          if (this.currentMode !== 'Practice Drift') {
            this.shield = Math.max(0, this.shield - 35);
            this.multiplier = 1;
            if (this.shield <= 0) this.triggerGameOver();
          }
          continue;
        }

        if (e.mesh.position.z > 30) {
          this.scene.remove(e.mesh);
          this.enemies.splice(i, 1);
        }
      }
    }

    this.updateAirCombat(dt, difficultyLevel);
    this.updateBomb(dt);

    // 6. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.spin) p.mesh.rotation.x += p.spin * dt;
      if (p.shrink) p.mesh.scale.setScalar(Math.max(0.01, p.life / p.maxLife));
      if (p.grow) {
        const k = 1 - p.life / p.maxLife;
        p.mesh.scale.setScalar(1 + k * p.grow);
        p.mesh.material.opacity = 1 - k;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Transform: starfighter <-> jet
  // -------------------------------------------------------------------------
  hullBonus() {
    return this.form === 'jet' ? JET_HULL : 0;
  }

  setForm(form) {
    this.form = form;
    if (this.models) {
      this.models.starfighter.visible = form === 'starfighter';
      this.models.jet.visible = form === 'jet';
      Object.values(this.models).forEach(m => {
        m.rotation.z = 0;
        m.scale.setScalar(1);
      });
    }
  }

  startTransform() {
    const t = this.tf;
    if (!this.isRunning || this.gameOver || t.active || t.cd > 0) return;
    this.tf = { active: true, t: 0, swapped: false, to: this.form === 'jet' ? 'starfighter' : 'jet', cd: 0 };
    this.audio?.boostSweep?.();
    this.toast(this.tf.to === 'jet' ? 'JET MODE' : 'STARFIGHTER MODE');
  }

  updateTransform(dt) {
    const t = this.tf;
    if (!t.active) {
      if (t.cd > 0) t.cd = Math.max(0, t.cd - dt);
      return;
    }
    t.t = Math.min(1, t.t + dt / TRANSFORM_TIME);
    const k = t.t * t.t * (3 - 2 * t.t); // eased barrel roll
    const incoming = this.models[t.to];
    if (!t.swapped && t.t >= 0.5) {
      // Halfway through the roll: swap forms, with a flash ring and a burst of sparks
      t.swapped = true;
      this.models[this.form].visible = false;
      this.form = t.to;
      incoming.visible = true;
      this.spark(this.shipMesh.position, 18, 16, 0.5);
      this.ring(this.shipMesh.position, 0xffd23f, 7, 0.5);
    }
    const pulse = 1 + 0.25 * Math.sin(t.t * Math.PI);
    const active = this.models[this.form];
    active.rotation.z = k * Math.PI * 2;
    active.scale.setScalar(pulse);
    if (t.t >= 1) {
      this.setForm(t.to);
      this.tf = { active: false, t: 0, swapped: false, to: t.to === 'jet' ? 'starfighter' : 'jet', cd: TRANSFORM_COOLDOWN };
    }
  }

  // -------------------------------------------------------------------------
  // Weapons
  // -------------------------------------------------------------------------
  fireWeapons() {
    if (this.tf.active) return;
    if (this.form === 'jet') this.fireMissiles();
    else this.fireBlasters();
  }

  /** The nearest thing worth locking onto in front of the ship; dogfighters come first. */
  pickTarget() {
    const sx = this.ship.x;
    const sy = this.ship.y;
    let best = null;
    let bestScore = Infinity;
    const consider = (list, weight) => {
      for (const t of list) {
        const p = t.mesh.position;
        if (p.z > this.ship.z - 4 || p.z < -90) continue;
        const dx = Math.abs(p.x - sx);
        const dy = Math.abs(p.y - sy);
        if (dx > 15 || dy > 12) continue;
        const score = (dx + dy + (this.ship.z - p.z) * 0.06) * weight;
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      }
    };
    consider(this.dogfighters, 0.6);
    consider(this.enemies, 0.8);
    consider(this.asteroids, 1.4);
    return best;
  }

  fireMissiles() {
    if (this.fireCooldown > 0 || this.gameOver) return;
    this.fireCooldown = 0.5;
    this.audio?.missileLaunch?.();

    this._pod *= -1;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.fx.missileBody, this.fx.missileMat), new THREE.Mesh(this.fx.missileNose, this.fx.noseMat));
    const pos = new THREE.Vector3(this.ship.x + this._pod * 2.6, this.ship.y - 0.2, this.ship.z - 0.6);
    group.position.copy(pos);
    this.scene.add(group);
    this.missiles.push({
      mesh: group,
      pos,
      vel: new THREE.Vector3(this._pod * 6, 0, -34),
      target: this.pickTarget(),
      life: 2.6,
      smoke: 0
    });
  }

  isAlive(t) {
    return this.dogfighters.includes(t) || this.enemies.includes(t) || this.asteroids.includes(t);
  }

  /** A blast that takes out everything near `pos`. */
  detonate(pos) {
    this.audio?.explosion?.(1.0);
    this.spark(pos, 20, 18, 0.6);
    this.ring(pos, 0xff9f1c, 9, 0.45);
    const R = 4.6;
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (a.mesh.position.distanceTo(pos) < R + a.radius * 0.5) {
        this.destroyAsteroid(a, true);
        this.asteroids.splice(i, 1);
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.mesh.position.distanceTo(pos) < R) {
        this.destroyEnemy(e, true);
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.dogfighters.length - 1; i >= 0; i--) {
      const d = this.dogfighters[i];
      if (d.mesh.position.distanceTo(pos) < R + 0.8) this.damageDog(d, 3);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (this.bolts[i].mesh.position.distanceTo(pos) < R) {
        this.scene.remove(this.bolts[i].mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------------------
  // AI dogfighters
  // -------------------------------------------------------------------------
  spawnDogfighter(level) {
    this.dogSpawns++;
    const ace = level >= 3 && this.dogSpawns % 3 === 0;
    const mesh = createDogfighterMesh({ ace });
    mesh.scale.setScalar(ace ? 2.8 : 2.4);
    const side = Math.random() < 0.5 ? -1 : 1;
    mesh.position.set(side * (this.xLimit + 12), 7 + (Math.random() - 0.5) * 4, -88);
    mesh.rotation.y = Math.PI; // nose toward the player
    this.scene.add(mesh);

    this.dogfighters.push({
      mesh,
      ace,
      hp: ace ? 5 : 2,
      radius: ace ? 2.6 : 2.1,
      state: 'approach',
      t: 0,
      side,
      cx: (Math.random() - 0.5) * this.xLimit * 1.1,
      cy: 5 + (Math.random() - 0.5) * 3,
      zHold: -26 - Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      amp: (6 + Math.random() * 4) * this.fieldScale,
      freq: 0.7 + Math.random() * 0.5,
      fireCd: 1.6 + Math.random() * 1.4,
      shotsLeft: 0,
      dodgeCd: 0,
      dodge: 0,
      dodgeDir: 1,
      flash: 0,
      life: 14 + Math.random() * 5,
      vx: 0
    });
    this.toast(ace ? 'ACE PILOT!' : 'BOGEY INCOMING');
    this.audio?.beep?.(ace ? 880 : 660, 0.16, 'square', 0.18);
  }

  setGlow(d, color, intensity) {
    for (const m of d.mesh.userData.mats) {
      m.emissive.setHex(color);
      m.emissiveIntensity = intensity;
    }
  }

  fireBolt(d, level) {
    const origin = d.mesh.position.clone();
    origin.z += 1.8;
    // Aim where the player is heading, with a little error that shrinks as the game goes on
    const lead = 0.55;
    const vx = (this.ship.targetX - this.ship.x) * 6;
    const vy = (this.ship.targetY - this.ship.y) * 6;
    const spread = Math.max(0.5, 3.2 - level * 0.28);
    const target = new THREE.Vector3(
      this.ship.x + vx * lead + (Math.random() - 0.5) * spread * 2,
      this.ship.y + vy * lead + (Math.random() - 0.5) * spread * 2,
      this.ship.z
    );
    const speed = Math.min(54, 30 + level * 2.4);
    const vel = target.sub(origin).normalize().multiplyScalar(speed);

    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.fx.boltGeo, this.fx.boltMat));
    const core = new THREE.Mesh(this.fx.boltGeo, this.fx.coreMat);
    core.scale.setScalar(0.5);
    mesh.add(core);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.bolts.push({ mesh, vel, life: 4, dmg: d.ace ? 16 : 12 });
    this.audio?.laser?.(d.ace ? 380 : 480, 0.12);
  }

  damageDog(d, dmg) {
    d.hp -= dmg;
    d.flash = 0.1;
    this.setGlow(d, 0xffffff, 0.9);
    this.spark(d.mesh.position, 5, 10, 0.3);
    if (d.hp > 0) {
      this.audio?.hit?.();
      return false;
    }
    this.destroyDog(d);
    return true;
  }

  destroyDog(d) {
    const i = this.dogfighters.indexOf(d);
    if (i >= 0) this.dogfighters.splice(i, 1);
    this.audio?.explosion?.(1.0);
    this.addCharge(d.ace ? 50 : 30);
    this.score += (d.ace ? 1000 : 400) * this.multiplier;
    this.multiplier = Math.min(8, this.multiplier + 1);
    if (this.score > this.highScore) this.highScore = this.score;
    // Winning a dogfight patches the shields up a little
    this.shield = Math.min(100, this.shield + (d.ace ? 12 : 6));
    this.spark(d.mesh.position, 26, 22, 0.7);
    this.ring(d.mesh.position, 0xff6b5b, 8, 0.45);
    this.scene.remove(d.mesh);
    this.toast(d.ace ? 'ACE DOWN! +SHIELD' : 'SPLASH ONE! +SHIELD');
  }

  hurtPlayer(amount) {
    if (this.currentMode === 'Practice Drift') return;
    this.audio?.hit?.();
    this.shield = Math.max(0, this.shield - amount);
    this.multiplier = 1;
    const flash = document.getElementById('astro-flash');
    if (flash) {
      flash.classList.remove('show');
      void flash.offsetWidth; // restart the CSS animation
      flash.classList.add('show');
    }
    if (this.shield <= 0) this.triggerGameOver();
  }

  updateAirCombat(dt, level) {
    const shipPos = this.shipMesh.position;
    const bonus = this.hullBonus();

    // --- Dogfighters ----------------------------------------------------
    for (let i = this.dogfighters.length - 1; i >= 0; i--) {
      const d = this.dogfighters[i];
      const p = d.mesh.position;
      const prevX = p.x;
      d.t += dt;
      d.life -= dt;
      d.dodgeCd -= dt;
      if (d.flash > 0) {
        d.flash -= dt;
        if (d.flash <= 0) this.setGlow(d, 0x000000, 0);
      }

      if (d.state === 'approach') {
        const dx = d.cx - p.x;
        const dy = d.cy - p.y;
        const dz = d.zHold - p.z;
        const dist = Math.hypot(dx, dy, dz);
        const step = Math.min(dist, 50 * dt);
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.z += (dz / dist) * step;
        if (dist < 2.5) {
          d.state = 'engage';
          d.t = 0;
        }
      } else if (d.state === 'engage') {
        const wantX = d.cx + Math.sin(d.t * d.freq + d.phase) * d.amp + this.ship.x * 0.35;
        const wantY = d.cy + Math.sin(d.t * d.freq * 1.3 + d.phase) * 2.4;
        const wantZ = d.zHold + Math.sin(d.t * 0.6 + d.phase) * 5;
        const ease = Math.min(1, dt * 2.2);
        p.x += (wantX - p.x) * ease;
        p.y += (wantY - p.y) * ease;
        p.z += (wantZ - p.z) * ease;

        // Dodge a laser that is about to hit
        if (d.dodge <= 0 && d.dodgeCd <= 0) {
          for (const l of this.lasers) {
            if (l.z > p.z && l.z - p.z < 26 && Math.abs(l.x - p.x) < 2.4 && Math.random() < Math.min(0.85, 0.35 + level * 0.1)) {
              d.dodge = 0.38;
              d.dodgeDir = l.x >= p.x ? -1 : 1;
              d.dodgeCd = Math.max(1.1, 2.6 - level * 0.18);
              break;
            }
          }
        }

        // Shoot, with a flashing tell just before
        d.fireCd -= dt;
        if (d.fireCd < 0.45 && d.dodge <= 0) {
          this.setGlow(d, 0xff3d3d, 0.45 + 0.35 * Math.sin(d.t * 40));
        }
        if (d.fireCd <= 0) {
          if (d.shotsLeft <= 0) d.shotsLeft = d.ace ? 3 : 1;
          this.fireBolt(d, level);
          d.shotsLeft--;
          d.fireCd = d.shotsLeft > 0 ? 0.16 : Math.max(0.9, 2.6 - level * 0.18) + Math.random() * 0.6;
          if (d.shotsLeft <= 0) this.setGlow(d, 0x000000, 0);
        }
        if (d.life <= 0) {
          d.state = 'leave';
          this.setGlow(d, 0x000000, 0);
        }
      } else {
        // Peel away off the side of the screen
        p.x += d.side * 34 * dt;
        p.y += 8 * dt;
        p.z += 14 * dt;
        d.mesh.rotation.z += dt * 5;
        if (Math.abs(p.x) > 80 || p.z > 40) {
          this.scene.remove(d.mesh);
          this.dogfighters.splice(i, 1);
          continue;
        }
      }

      if (d.dodge > 0) {
        d.dodge -= dt;
        p.x += d.dodgeDir * 24 * dt;
      }
      d.vx = (p.x - prevX) / Math.max(dt, 1e-3);
      if (d.state !== 'leave') {
        // Bank into turns, and roll all the way over when dodging
        const spin = d.dodge > 0 ? (1 - d.dodge / 0.38) * Math.PI * 2 * -d.dodgeDir : 0;
        d.mesh.rotation.z = -d.vx * 0.04 + spin;
        d.mesh.rotation.y = Math.PI;
        d.mesh.rotation.x = Math.max(-0.3, Math.min(0.3, (d.cy - p.y) * 0.08));
      }

      // Player lasers
      let killed = false;
      for (let j = this.lasers.length - 1; j >= 0; j--) {
        const l = this.lasers[j];
        if (p.distanceTo(l.mesh.position) < d.radius + 0.7) {
          this.scene.remove(l.mesh);
          this.lasers.splice(j, 1);
          if (this.damageDog(d, 1)) {
            killed = true;
            break;
          }
        }
      }
      if (killed) continue;

      // Ramming the player
      if (p.distanceTo(shipPos) < d.radius + 1.4 + bonus) {
        this.destroyDog(d);
        this.hurtPlayer(30);
      }
    }

    // --- Enemy bolts ----------------------------------------------------
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.scale.setScalar(1 + 0.12 * Math.sin(b.life * 30));
      b.life -= dt;
      let gone = b.life <= 0 || b.mesh.position.z > this.ship.z + 12;

      if (!gone) {
        // Your lasers can shoot bolts down
        for (let j = this.lasers.length - 1; j >= 0; j--) {
          if (b.mesh.position.distanceTo(this.lasers[j].mesh.position) < 1.0) {
            this.scene.remove(this.lasers[j].mesh);
            this.lasers.splice(j, 1);
            this.spark(b.mesh.position, 6, 10, 0.3);
            gone = true;
            break;
          }
        }
      }
      if (!gone && b.mesh.position.distanceTo(shipPos) < 1.3 + bonus) {
        this.spark(b.mesh.position, 8, 12, 0.35);
        this.hurtPlayer(b.dmg);
        gone = true;
      }
      if (gone) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }

    // --- Homing missiles ------------------------------------------------
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (m.target && !this.isAlive(m.target)) m.target = null;
      const desired = m.target
        ? m.target.mesh.position.clone().sub(m.pos).normalize().multiplyScalar(64)
        : new THREE.Vector3(0, 0, -64);
      m.vel.lerp(desired, Math.min(1, dt * (m.target ? 4.5 : 2)));
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.lookAt(m.pos.clone().add(m.vel));
      m.life -= dt;

      m.smoke -= dt;
      if (m.smoke <= 0) {
        m.smoke = 0.04;
        const puff = new THREE.Mesh(this.fx.smokeGeo, this.fx.smokeMat);
        puff.position.copy(m.pos);
        this.scene.add(puff);
        this.particles.push({ mesh: puff, vel: new THREE.Vector3(0, 0, 4), life: 0.35, maxLife: 0.35, shrink: true });
      }

      // Blow up on the target, on anything it clips, or when it runs out of road
      let boom = m.life <= 0 || m.pos.z < -92;
      if (!boom && m.target && m.target.mesh.position.distanceTo(m.pos) < (m.target.radius || 1.4) + 0.9) boom = true;
      if (!boom) {
        const near = [...this.dogfighters, ...this.enemies, ...this.asteroids].some(t => t.mesh.position.distanceTo(m.pos) < (t.radius || 1.4) + 0.7);
        if (near) boom = true;
      }
      if (boom) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        this.detonate(m.pos.clone());
      }
    }
  }

  // -------------------------------------------------------------------------
  // Atom bomb (jet only): drop it on a planet and annihilate it
  // -------------------------------------------------------------------------
  /** The planet the bomb would hit: the biggest one currently on screen. */
  bombTarget() {
    let best = null;
    for (const p of this.planets) {
      const z = p.mesh.position.z;
      if (z > 20 || z < -195) continue;
      if (!best || p.radius > best.radius) best = p;
    }
    return best;
  }

  addCharge(amount) {
    this.bombCharge = Math.min(BOMB_COST, this.bombCharge + amount);
  }

  launchBomb() {
    if (!this.isRunning || this.gameOver || this.bomb || this.tf.active) return;
    if (this.form !== 'jet') return;
    if (this.bombCharge < BOMB_COST) {
      this.toast('BOMB CHARGING...');
      return;
    }
    const target = this.bombTarget();
    if (!target) {
      this.toast('NO PLANET IN RANGE');
      return;
    }
    this.bombCharge = 0;
    const mesh = createBombMesh();
    mesh.position.set(this.ship.x, this.ship.y - 0.6, this.ship.z - 1);
    this.scene.add(mesh);
    this.bomb = {
      mesh,
      pos: mesh.position.clone(),
      vel: new THREE.Vector3(0, -7, -10), // it drops away from the jet first
      target,
      age: 0,
      smoke: 0
    };
    this.toast('ATOM BOMB AWAY!');
    this.audio?.missileLaunch?.();
    this.audio?.whoosh?.(1.4, 2600, 250, 0.3); // a falling whistle
  }

  updateBomb(dt) {
    // The bomb charges by itself, and faster when you shoot things down
    if (!this.bomb) this.addCharge(dt * 1.8);

    // Mark the planet it would hit once it is armed
    const ring = this.lockRing;
    const armedTarget = this.form === 'jet' && !this.bomb && this.bombCharge >= BOMB_COST ? this.bombTarget() : null;
    if (armedTarget) {
      ring.visible = true;
      ring.position.copy(armedTarget.mesh.position);
      ring.scale.setScalar(armedTarget.radius * 1.12);
      ring.lookAt(this.camera.position);
      ring.material.opacity = 0.55 + 0.4 * Math.sin(performance.now() * 0.008);
    } else {
      ring.visible = false;
    }

    // Delayed blast wave that sweeps the playfield after a planet goes up
    if (this.wipe) {
      this.wipe.t -= dt;
      if (this.wipe.t <= 0) {
        this.wipeField();
        this.wipe = null;
      }
    }

    const b = this.bomb;
    if (!b) return;
    b.age += dt;
    const tp = b.target.mesh.position;
    const speed = 22 + 80 * Math.min(1, b.age / 1.1);
    b.vel.lerp(tp.clone().sub(b.pos).normalize().multiplyScalar(speed), Math.min(1, dt * 3.5));
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(b.pos.clone().add(b.vel));

    b.smoke -= dt;
    if (b.smoke <= 0) {
      b.smoke = 0.025;
      const puff = new THREE.Mesh(this.fx.smokeGeo, this.fx.sparkMats[1]);
      puff.position.copy(b.pos);
      puff.scale.setScalar(1.6);
      this.scene.add(puff);
      this.particles.push({ mesh: puff, vel: new THREE.Vector3(0, 0, 6), life: 0.5, maxLife: 0.5, shrink: true });
    }

    if (b.pos.distanceTo(tp) < b.target.radius * 0.95 || b.age > 7) {
      this.scene.remove(b.mesh);
      this.bomb = null;
      this.annihilate(b.target);
    }
  }

  /** Blow a planet to pieces. */
  annihilate(planet) {
    const pos = planet.mesh.position.clone();
    const R = planet.radius;
    const color = planet.mesh.material.color.getHex();
    const i = this.planets.indexOf(planet);
    if (i >= 0) this.planets.splice(i, 1);
    this.scene.remove(planet.mesh);

    // Bright core and expanding shockwaves
    const glowMat = hex => new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false });
    const orb = (hex, radius, grow, life, vy = 0) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), glowMat(hex));
      m.position.copy(pos);
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(0, vy, 0), life, maxLife: life, grow });
    };
    orb(0xffffff, R * 0.9, 1.4, 0.9);
    orb(0xffd23f, R * 0.7, 2.0, 1.3);
    orb(0xff6b5b, R * 0.5, 2.6, 1.6);
    this.ring(pos, 0xffffff, R * 4.5, 0.9);
    this.ring(pos, 0xff9f1c, R * 3.2, 1.2);
    this.ring(pos, 0xff6b5b, R * 2.2, 1.5);

    // A toy mushroom cloud: a stem and a cap that climb as they fade
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.18, R * 0.32, R * 1.3, 18), glowMat(0xffb454));
    stem.position.set(pos.x, pos.y + R * 0.9, pos.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 0.55, 22, 16), glowMat(0xfff1c2));
    cap.scale.y = 0.75;
    cap.position.set(pos.x, pos.y + R * 1.8, pos.z);
    this.scene.add(stem, cap);
    this.particles.push({ mesh: stem, vel: new THREE.Vector3(0, R * 0.5, 0), life: 2.2, maxLife: 2.2, grow: 0.5 });
    this.particles.push({ mesh: cap, vel: new THREE.Vector3(0, R * 0.55, 0), life: 2.2, maxLife: 2.2, grow: 0.7 });

    // The planet itself, in pieces
    for (let n = 0; n < 40; n++) {
      const size = R * (0.08 + Math.random() * 0.14);
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true })
      );
      chunk.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * R, (Math.random() - 0.5) * R, (Math.random() - 0.5) * R));
      this.scene.add(chunk);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      this.particles.push({
        mesh: chunk,
        vel: dir.multiplyScalar(14 + Math.random() * 30),
        life: 2.2 + Math.random() * 1.2,
        maxLife: 3.4,
        shrink: true,
        spin: (Math.random() - 0.5) * 8
      });
    }
    this.spark(pos, 40, 46, 1.1);

    // The big moment: flash, shake, slow motion, sound, and a score to match
    this.shake = 2.4;
    this.timeScale = 0.22;
    this.nukeFlash();
    this.audio?.explosion?.(2.2);
    this.audio?.crash?.();
    this.audio?.thump?.();
    this.score += 5000 * this.multiplier;
    this.multiplier = Math.min(8, this.multiplier + 2);
    if (this.score > this.highScore) this.highScore = this.score;
    this.toast('PLANET ANNIHILATED!');
    this.wipe = { t: 0.5 };
  }

  /** The shockwave reaches the playfield and everything in it goes up. */
  wipeField() {
    for (let i = this.asteroids.length - 1; i >= 0; i--) this.destroyAsteroid(this.asteroids[i], true);
    this.asteroids = [];
    for (let i = this.enemies.length - 1; i >= 0; i--) this.destroyEnemy(this.enemies[i], true);
    this.enemies = [];
    [...this.dogfighters].forEach(d => this.destroyDog(d));
    this.bolts.forEach(b => this.scene.remove(b.mesh));
    this.bolts = [];
    this.shake = Math.max(this.shake, 1.4);
  }

  nukeFlash() {
    const el = document.getElementById('astro-nuke');
    if (!el) return;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Camera shake: jitter the camera while `shake` is above zero, then put it back. */
  updateShake(dt) {
    const base = this._camBase;
    if (!base) return;
    if (this.shake > 0.02) {
      this.shake *= Math.exp(-dt * 2.4);
      this.camera.position.set((Math.random() - 0.5) * this.shake * 1.6, base.y + (Math.random() - 0.5) * this.shake * 1.2, base.z);
      this.camera.lookAt(0, 0, -10);
      this._shaking = true;
    } else if (this._shaking) {
      this._shaking = false;
      this.shake = 0;
      this.camera.position.set(0, base.y, base.z);
      this.camera.lookAt(0, 0, -10);
    }
  }

  // -------------------------------------------------------------------------
  // Effects and HUD messages
  // -------------------------------------------------------------------------
  spark(pos, count = 10, speed = 14, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.fx.sparkGeo, this.fx.sparkMats[i % 3]);
      p.position.copy(pos);
      this.scene.add(p);
      this.particles.push({
        mesh: p,
        vel: new THREE.Vector3((Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed),
        life,
        maxLife: life,
        shrink: true
      });
    }
  }

  /** A flat ring that swells and fades, for transformations and explosions. */
  ring(pos, color, grow = 6, life = 0.45) {
    const mesh = new THREE.Mesh(this.fx.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.copy(pos);
    mesh.lookAt(this.camera.position);
    this.scene.add(mesh);
    this.particles.push({ mesh, vel: new THREE.Vector3(), life, maxLife: life, grow });
  }

  toast(text) {
    const el = document.getElementById('astro-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  destroyAsteroid(asteroid, byLaser) {
    this.audio.explosion(0.7);
    if (byLaser) this.addCharge(1.5);
    const pos = asteroid.mesh.position;

    if (byLaser) {
      this.score += 150 * this.multiplier;
      this.multiplier = Math.min(8, this.multiplier + 0.5);
      if (this.score > this.highScore) this.highScore = this.score;
    }

    // Spawn shatter debris particles
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.DodecahedronGeometry(0.3, 0);
      const mat = new THREE.MeshBasicMaterial({ color: byLaser ? 0xffd23f : 0xff6b5b });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      this.scene.add(p);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      this.particles.push({ mesh: p, vel, life: 0.5 });
    }

    this.scene.remove(asteroid.mesh);
  }

  destroyEnemy(enemy, byLaser) {
    this.audio.explosion(0.9);
    if (byLaser) this.addCharge(8);
    const pos = enemy.mesh.position;

    if (byLaser) {
      this.score += 250 * this.multiplier;
      this.multiplier = Math.min(8, this.multiplier + 0.5);
      if (this.score > this.highScore) this.highScore = this.score;
    }

    for (let i = 0; i < 15; i++) {
      const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const mat = new THREE.MeshBasicMaterial({ color: byLaser ? 0xef4444 : 0xf97316 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      this.scene.add(p);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
      this.particles.push({ mesh: p, vel, life: 0.6 });
    }

    this.scene.remove(enemy.mesh);
  }

  triggerGameOver() {
    this.gameOver = true;
    this.audio.explosion(1.5);
    const modal = document.getElementById('astro-gameover-modal');
    const finalScore = document.getElementById('astro-final-score');
    if (finalScore) finalScore.textContent = `${this.score.toLocaleString()} PTS`;
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active'); // the shared overlay rule hides it unless .active is set
    }
  }

  getHUDHtml() {
    return `
      <div class="astro-hud-container">
        <!-- Top Score Bar -->
        <div class="astro-score-bar">
          <div>
            <div class="astro-score-label">SCORE</div>
            <div class="astro-score-val" id="astro-score">0</div>
          </div>
          <div>
            <div class="astro-score-label">MULTIPLIER</div>
            <div class="astro-multiplier-val" id="astro-mult">x1.0</div>
          </div>
          <div>
            <div class="astro-score-label">SHIELD</div>
            <div class="astro-shield"><div class="astro-shield-fill" id="astro-shield-fill"></div></div>
          </div>
        </div>

        <div class="astro-toast" id="astro-toast"></div>
        <div class="astro-flash" id="astro-flash"></div>

        <div class="astro-nuke" id="astro-nuke"></div>

        <!-- Atom bomb (jet mode only): charges up, then press B or tap -->
        <button class="astro-bomb" id="astro-bomb" aria-label="Launch the atom bomb at a planet" hidden>
          <span class="ab-name">ATOM BOMB</span>
          <span class="ab-hint" id="astro-bomb-hint">B &middot; CHARGING</span>
          <i class="ab-fill" id="astro-bomb-fill"></i>
        </button>

        <!-- Transform button: works with a click or tap, or the T key -->
        <button class="astro-transform" id="astro-transform" aria-label="Transform between starfighter and jet">
          <span class="at-name" id="astro-form-name">STARFIGHTER</span>
          <span class="at-hint">T &middot; TRANSFORM</span>
          <i class="at-cd" id="astro-cd"></i>
        </button>

        <!-- Touch controls (shown on touch screens only): joystick + fire -->
        <div class="astro-touch">
          <div class="astro-stick" id="astro-stick" aria-label="Move ship">
            <div class="astro-stick-knob" id="astro-stick-knob"></div>
          </div>
          <button class="astro-fire" id="astro-fire" aria-label="Fire blasters">FIRE</button>
        </div>

        <!-- Game Over Modal -->
        <div class="tank-modal-overlay" id="astro-gameover-modal" style="display: none;">
          <div class="tank-modal-box astro-over">
            <h2>Ship down!</h2>
            <p class="tank-modal-sub">Your shields gave out. Ready for another run?</p>
            <div class="astro-final" id="astro-final-score">0 PTS</div>
            <button class="primary-btn" id="astro-btn-restart">Play again</button>
          </div>
        </div>
      </div>
    `;
  }

  updateHUD() {
    const scoreEl = document.getElementById('astro-score');
    const multEl = document.getElementById('astro-mult');
    const shieldEl = document.getElementById('astro-shield-fill');

    if (scoreEl) scoreEl.textContent = this.score.toLocaleString();
    if (multEl) multEl.textContent = `x${this.multiplier.toFixed(1)}`;
    if (shieldEl) {
      shieldEl.style.width = `${Math.max(0, this.shield)}%`;
      shieldEl.dataset.level = this.shield > 60 ? 'ok' : this.shield > 30 ? 'mid' : 'low';
    }

    // Transform button: shows the current form and refills as the cooldown runs down
    const formEl = document.getElementById('astro-form-name');
    const tfBtn = document.getElementById('astro-transform');
    const cdEl = document.getElementById('astro-cd');
    if (formEl) formEl.textContent = this.form === 'jet' ? 'JET' : 'STARFIGHTER';
    if (tfBtn) {
      tfBtn.dataset.form = this.form;
      tfBtn.classList.toggle('busy', this.tf.active || this.tf.cd > 0);
      if (!tfBtn._bound) {
        tfBtn._bound = true;
        tfBtn.addEventListener('click', () => this.startTransform());
      }
    }
    if (cdEl) cdEl.style.width = `${this.tf.active ? 0 : (1 - this.tf.cd / TRANSFORM_COOLDOWN) * 100}%`;

    // Atom bomb button: only in jet mode; fills as it charges, glows red when armed
    const bombBtn = document.getElementById('astro-bomb');
    if (bombBtn) {
      bombBtn.hidden = this.form !== 'jet';
      const armed = this.bombCharge >= BOMB_COST;
      bombBtn.classList.toggle('ready', armed);
      const fill = document.getElementById('astro-bomb-fill');
      if (fill) fill.style.width = `${this.bombCharge}%`;
      const hint = document.getElementById('astro-bomb-hint');
      if (hint) hint.innerHTML = this.bomb ? 'AWAY!' : armed ? 'B &middot; LAUNCH' : `B &middot; ${Math.floor(this.bombCharge)}%`;
      if (!bombBtn._bound) {
        bombBtn._bound = true;
        bombBtn.addEventListener('click', () => this.launchBomb());
      }
    }

    this.bindTouchControls();

    const btn = document.getElementById('astro-btn-restart');
    if (btn && !btn._hasClickListener) {
      btn._hasClickListener = true;
      btn.addEventListener('click', () => {
        this.start(this.currentMode);
      });
    }
  }

  bindTouchControls() {
    const stick = document.getElementById('astro-stick');
    const knob = document.getElementById('astro-stick-knob');
    const fire = document.getElementById('astro-fire');
    if (!stick || !knob || !fire || stick._bound) return;
    stick._bound = true;

    const DEAD = 0.18;
    let activeId = null;

    const move = (e) => {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = e.clientX - (rect.left + radius);
      let dy = e.clientY - (rect.top + radius);
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1, len / radius);
      const k = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD);
      this._touch.x = len ? (dx / Math.min(len, radius)) * k : 0;
      this._touch.y = len ? (-dy / Math.min(len, radius)) * k : 0;
    };
    const release = (e) => {
      if (e.pointerId !== activeId) return;
      activeId = null;
      knob.style.transform = '';
      this._touch.x = 0;
      this._touch.y = 0;
    };

    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      activeId = e.pointerId;
      try { stick.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      move(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === activeId) move(e);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    const setFire = (v) => (e) => {
      e.preventDefault();
      this._touchFire = v;
      fire.classList.toggle('pressed', v);
    };
    fire.addEventListener('pointerdown', setFire(true));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => fire.addEventListener(t, setFire(false)));
    [stick, fire].forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));
  }

  getControlsGuide() {
    return [
      { label: 'Pilot Maneuver (3D)', keys: 'W A S D' },
      { label: 'Fire (blasters / missiles)', keys: 'SPACE / MOUSE CLICK' },
      { label: 'Transform: starfighter <-> jet', keys: 'T KEY / TRANSFORM BUTTON' },
      { label: 'Jet mode', keys: 'Faster, with homing missiles' },
      { label: 'Atom Bomb (jet, when charged)', keys: 'B KEY / BOMB BUTTON' },
      { label: 'Touch Screens', keys: 'Left stick to fly, hold FIRE to shoot' },
      { label: 'Toggle Floodlight', keys: 'F or L KEY' },
      { label: 'Hyperspace Drift', keys: 'Automatic continuous forward drive' },
      { label: 'Combo Streak', keys: 'Chain asteroid kills for x8.0 multiplier' }
    ];
  }

  destroy() {
    super.destroy();
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    [...this.dogfighters, ...this.bolts, ...this.missiles].forEach(o => this.scene.remove(o.mesh));
    this.dogfighters = [];
    this.bolts = [];
    this.missiles = [];
    if (this.bomb) this.scene.remove(this.bomb.mesh);
    if (this.lockRing) this.scene.remove(this.lockRing);
    this.lasers.forEach(l => this.scene.remove(l.mesh));
    this.asteroids.forEach(a => this.scene.remove(a.mesh));
    if (this.enemies) this.enemies.forEach(e => this.scene.remove(e.mesh));
    this.particles.forEach(p => this.scene.remove(p.mesh));
    if (this.starfield) this.scene.remove(this.starfield);
    if (this.lowerStarfield) this.scene.remove(this.lowerStarfield);
    if (this.planets) this.planets.forEach(p => this.scene.remove(p.mesh));
    if (this.shipMesh) this.scene.remove(this.shipMesh);
    // The camera is shared with other games: put its FOV back
    this._touch.x = this._touch.y = 0;
    this._touchFire = false;
    this.shake = 0;
    this.timeScale = 1;
    this.camera.fov = 55;
    this.camera.position.set(0, 10, 28);
    this.camera.updateProjectionMatrix();
    if (this._prevBackground !== undefined) {
      this.scene.background = this._prevBackground;
      this.scene.fog = this._prevFog;
    }
  }
}
