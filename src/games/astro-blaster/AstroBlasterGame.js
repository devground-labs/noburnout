import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { createFighterShip, createAsteroidMesh } from './ShipModel.js';

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
    this.starfield = null;

    this.score = 0;
    this.highScore = 0;
    this.multiplier = 1;
    this.shield = 100;
    this.spawnTimer = 0;
    this.fireCooldown = 0;
    this.gameOver = false;
  }

  async init(engine) {
    await super.init(engine);

    // Deep space lighting
    const amb = new THREE.AmbientLight(0x1e293b, 1.2);
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dir.position.set(10, 30, -20);
    this.scene.add(dir);

    // Starfield Particle System
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 160;
      positions[i + 1] = (Math.random() - 0.5) * 80;
      positions[i + 2] = -120 + Math.random() * 200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.8,
      transparent: true,
      opacity: 0.85
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);

    // Starfighter
    this.shipMesh = createFighterShip();
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
    this.camera.position.set(0, 10, 28);
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

    this.ship.x = 0;
    this.ship.y = 0;
    this.ship.targetX = 0;
    this.ship.targetY = 0;

    const modal = document.getElementById('astro-gameover-modal');
    if (modal) modal.style.display = 'none';
  }

  spawnAsteroid() {
    const radius = 1.2 + Math.random() * 1.6;
    const mesh = createAsteroidMesh(radius);
    const x = (Math.random() - 0.5) * 44;
    const y = (Math.random() - 0.5) * 18;
    const z = -75;

    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    this.asteroids.push({
      mesh,
      radius,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 2,
      vz: 26 + Math.random() * 14,
      rotX: (Math.random() - 0.5) * 3,
      rotY: (Math.random() - 0.5) * 3
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
    // 1. Move Starfield for illusion of hyperspace warp
    const starPos = this.starfield.geometry.attributes.position;
    for (let i = 2; i < starPos.count * 3; i += 3) {
      starPos.array[i] += 48 * dt;
      if (starPos.array[i] > 30) {
        starPos.array[i] = -120;
      }
    }
    starPos.needsUpdate = true;

    if (this.gameOver) return;

    // 2. Player Ship Controls
    const p1In = input.getP1();
    const speed = 28;
    if (p1In.left) this.ship.targetX -= speed * dt;
    if (p1In.right) this.ship.targetX += speed * dt;
    if (p1In.up) this.ship.targetY += speed * dt;
    if (p1In.down) this.ship.targetY -= speed * dt;

    // Clamping to screen volume
    this.ship.targetX = Math.max(-20, Math.min(20, this.ship.targetX));
    this.ship.targetY = Math.max(-10, Math.min(10, this.ship.targetY));

    // Smooth lerp
    this.ship.x = THREE.MathUtils.lerp(this.ship.x, this.ship.targetX, dt * 10);
    this.ship.y = THREE.MathUtils.lerp(this.ship.y, this.ship.targetY, dt * 10);

    // Dynamic banking roll
    const targetRoll = (this.ship.targetX - this.ship.x) * -0.22;
    this.ship.roll = THREE.MathUtils.lerp(this.ship.roll, targetRoll, dt * 8);

    this.shipMesh.position.set(this.ship.x, this.ship.y, this.ship.z);
    this.shipMesh.rotation.z = this.ship.roll;

    // Fire handling
    if (p1In.fire || input.mouse.isDown) {
      this.fireBlasters();
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // 3. Asteroid Spawning
    this.spawnTimer += dt;
    const rate = this.currentMode === 'Practice Drift' ? 1.0 : 0.45;
    if (this.spawnTimer >= rate) {
      this.spawnTimer = 0;
      this.spawnAsteroid();
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

  triggerGameOver() {
    this.gameOver = true;
    this.audio.explosion(1.5);
    const modal = document.getElementById('astro-gameover-modal');
    const finalScore = document.getElementById('astro-final-score');
    if (finalScore) finalScore.textContent = `${this.score.toLocaleString()} PTS`;
    if (modal) modal.style.display = 'flex';
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
            <div class="astro-score-label">SHIELD INTEGRITY</div>
            <div class="bar-container" style="width: 140px; height: 10px;">
              <div class="bar-fill hp-bar" id="astro-shield-fill" style="width: 100%;"></div>
            </div>
          </div>
        </div>

        <!-- Game Over Modal -->
        <div class="tank-modal-overlay" id="astro-gameover-modal" style="display: none;">
          <div class="tank-modal-box">
            <div style="font-size: 3rem;">💥</div>
            <h2>MISSION TERMINATED</h2>
            <p style="color: #94a3b8; font-size: 0.95rem; margin: 8px 0 16px;">Ship shields collapsed under asteroid impact.</p>
            <div style="font-size: 1.6rem; font-weight: 800; color: #38bdf8; margin-bottom: 20px;" id="astro-final-score">0 PTS</div>
            <button class="primary-btn" id="astro-btn-restart">Relaunch Starfighter 🚀</button>
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

    const btn = document.getElementById('astro-btn-restart');
    if (btn && !btn._hasClickListener) {
      btn._hasClickListener = true;
      btn.addEventListener('click', () => {
        this.start(this.currentMode);
      });
    }
  }

  getControlsGuide() {
    return [
      { label: 'Pilot Maneuver (3D)', keys: 'W A S D / ARROW KEYS' },
      { label: 'Twin Plasma Blasters', keys: 'SPACE / MOUSE CLICK' },
      { label: 'Hyperspace Drift', keys: 'Automatic continuous forward drive' },
      { label: 'Combo Streak', keys: 'Chain asteroid kills for x8.0 multiplier' }
    ];
  }

  destroy() {
    super.destroy();
    this.lasers.forEach(l => this.scene.remove(l.mesh));
    this.asteroids.forEach(a => this.scene.remove(a.mesh));
    this.particles.forEach(p => this.scene.remove(p.mesh));
    if (this.starfield) this.scene.remove(this.starfield);
    if (this.shipMesh) this.scene.remove(this.shipMesh);
  }
}
