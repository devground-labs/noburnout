import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { createFighterShip, createAsteroidMesh, createEnemyJetMesh } from './ShipModel.js';

export class AstroBlasterGame extends BaseGame {
  constructor() {
    super({
      id: 'astro-blaster',
      name: 'Neon Astro-Blaster 3D',
      subtitle: 'High-Velocity Deep Space Arcade Combat',
      description: 'Pilot an agile starfighter through dense asteroid belts and alien interceptor squadrons. Rack up chain combos with rapid plasma blasters.',
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

    // Deep space lighting
    const amb = new THREE.AmbientLight(0x475569, 3.5); // Brighter ambient light
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0x7dd3fc, 2.5); // Brighter directional light
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
      color: 0x93c5fd,
      size: 1.0,
      transparent: true,
      opacity: 0.6
    });
    this.lowerStarfield = new THREE.Points(lowerStarGeo, lowerStarMat);
    this.scene.add(this.lowerStarfield);

    // Starfighter
    this.shipMesh = createFighterShip();
    this.shipMesh.add(this.floodLight);
    this.shipMesh.add(this.floodLightTarget);
    this.floodLight.target = this.floodLightTarget;
    this.scene.add(this.shipMesh);

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
    this.distance = 0;
    this.enemySpawnTimer = 0;
    this.planetSpawnTimer = 0;

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
    const colors = [0x1e3a8a, 0x064e3b, 0x4c1d95, 0x78350f, 0x831843, 0x0f766e];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const mat = new THREE.MeshStandardMaterial({ 
      color: color, 
      roughness: 0.8,
      metalness: 0.2,
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
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
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
    const speed = 28;
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
    const targetRoll = (this.ship.targetX - this.ship.x) * -0.22;
    this.ship.roll = THREE.MathUtils.lerp(this.ship.roll, targetRoll, dt * 8);

    this.shipMesh.position.set(this.ship.x, this.ship.y, this.ship.z);
    this.shipMesh.rotation.z = this.ship.roll;

    // Fire handling
    if (p1In.fire || input.mouse.isDown || this._touchFire) {
      this.fireBlasters();
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
      if (shipDist < a.radius + 1.6) {
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
        if (e.mesh.position.distanceTo(this.shipMesh.position) < e.radius + 1.2) {
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

    // 6. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  destroyAsteroid(asteroid, byLaser) {
    this.audio.explosion(0.7);
    const pos = asteroid.mesh.position;

    if (byLaser) {
      this.score += 150 * this.multiplier;
      this.multiplier = Math.min(8, this.multiplier + 0.5);
      if (this.score > this.highScore) this.highScore = this.score;
    }

    // Spawn shatter debris particles
    for (let i = 0; i < 10; i++) {
      const geo = new THREE.DodecahedronGeometry(0.3, 0);
      const mat = new THREE.MeshBasicMaterial({ color: byLaser ? 0x38bdf8 : 0xef4444 });
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

        <!-- Touch controls (shown on touch screens only): joystick + fire -->
        <div class="astro-touch">
          <div class="astro-stick" id="astro-stick" aria-label="Move ship">
            <div class="astro-stick-knob" id="astro-stick-knob"></div>
          </div>
          <button class="astro-fire" id="astro-fire" aria-label="Fire blasters">FIRE</button>
        </div>

        <!-- Game Over Modal -->
        <div class="tank-modal-overlay" id="astro-gameover-modal" style="display: none;">
          <div class="tank-modal-box">
            <h2>Mission terminated</h2>
            <p class="tank-modal-sub">Ship shields collapsed under asteroid impact.</p>
            <div class="astro-final" id="astro-final-score">0 PTS</div>
            <button class="primary-btn" id="astro-btn-restart">Relaunch starfighter</button>
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
    if (shieldEl) shieldEl.style.width = `${Math.max(0, this.shield)}%`;

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
      { label: 'Twin Plasma Blasters', keys: 'SPACE / MOUSE CLICK' },
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
    this.camera.fov = 55;
    this.camera.position.set(0, 10, 28);
    this.camera.updateProjectionMatrix();
  }
}
