import * as THREE from 'three';
import { BaseGame } from '../../framework/BaseGame.js';
import { createTankMesh } from './TankModel.js';

export class CyberTanksGame extends BaseGame {
  constructor() {
    super({
      id: 'cyber-tanks',
      name: 'Cyber Tanks 3D',
      subtitle: 'Tactical Sci-Fi Missile Warfare',
      description: 'Pilot heavy combat hover-tanks in an electrified cyber arena. Features strictly 3-round championship matches, autonomous AI, 2P local duel, and solo practice range.',
      icon: '🛡️',
      badge: 'Championship 3-Rounds',
      genre: 'Tactical Vehicular Duel',
      players: '1 - 2 Players',
      modes: ['1P (vs AI)', '2P Duel', 'Practice']
    });

    this.p1 = null;
    this.p2 = null;
    this.missiles = [];
    this.particles = [];
    this.obstacles = [];
    this.practiceTargets = [];

    // Series Scoring (Strictly 3 rounds in Battle modes)
    this.currentRound = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.matchOver = false;

    // AI state
    this.aiFireTimer = 1.0;
  }

  async init(engine) {
    await super.init(engine);

    // Setup Lighting
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    this.scene.add(dirLight);

    // Arena Floor
    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      roughness: 0.35,
      metalness: 0.8
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid Floor Overlay
    const grid = new THREE.GridHelper(80, 40, 0x38bdf8, 0x1e293b);
    grid.position.y = 0.05;
    this.scene.add(grid);

    // Perimeter Wall Forcefield
    const wallGeo = new THREE.BoxGeometry(80, 4, 1.5);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x0369a1,
      emissiveIntensity: 0.2
    });
    [
      { x: 0, z: -40, rot: 0 },
      { x: 0, z: 40, rot: 0 },
      { x: -40, z: 0, rot: Math.PI / 2 },
      { x: 40, z: 0, rot: Math.PI / 2 }
    ].forEach(w => {
      const mesh = new THREE.Mesh(wallGeo, wallMat);
      mesh.position.set(w.x, 2, w.z);
      mesh.rotation.y = w.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });

    // Create Tanks
    const p1Data = createTankMesh(0x38bdf8, 0x0284c7);
    this.p1 = {
      mesh: p1Data.mesh,
      turret: p1Data.turret,
      x: 0,
      z: 22,
      rot: 0,
      speed: 0,
      hp: 100,
      maxHp: 100,
      reload: 0,
      maxReload: 1.2
    };
    this.scene.add(this.p1.mesh);

    const p2Data = createTankMesh(0xf97316, 0xc2410c);
    this.p2 = {
      mesh: p2Data.mesh,
      turret: p2Data.turret,
      x: 0,
      z: -22,
      rot: Math.PI,
      speed: 0,
      hp: 100,
      maxHp: 100,
      reload: 0,
      maxReload: 1.2
    };
    this.scene.add(this.p2.mesh);

    // Camera view
    this.camera.position.set(0, 36, 42);
    this.camera.lookAt(0, 0, 0);

    this.spawnObstacles();
  }

  start(mode = '1P (vs AI)') {
    super.start(mode);
    this.currentRound = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.resetRound(true);
  }

  resetRound(isNewMatch = false) {
    this.matchOver = false;

    // Reset P1
    this.p1.x = 0;
    this.p1.z = 22;
    this.p1.rot = 0;
    this.p1.speed = 0;
    this.p1.hp = 100;
    this.p1.reload = 0;
    this.p1.mesh.position.set(0, 0, 22);
    this.p1.mesh.rotation.y = 0;
    this.p1.mesh.visible = true;

    // Reset P2
    this.p2.x = 0;
    this.p2.z = -22;
    this.p2.rot = Math.PI;
    this.p2.speed = 0;
    this.p2.hp = 100;
    this.p2.reload = 0;
    this.p2.mesh.position.set(0, 0, -22);
    this.p2.mesh.rotation.y = Math.PI;
    this.p2.mesh.visible = (this.currentMode !== 'Practice');

    // Clear active missiles & particles
    this.missiles.forEach(m => this.scene.remove(m.mesh));
    this.missiles = [];

    // Respawn cover
    this.spawnObstacles();

    if (this.currentMode === 'Practice') {
      this.spawnPracticeDrones();
    } else {
      this.clearPracticeDrones();
    }

    // Close in-game modal
    const modal = document.getElementById('tank-round-modal');
    if (modal) modal.style.display = 'none';
  }

  spawnObstacles() {
    this.obstacles.forEach(o => this.scene.remove(o.mesh));
    this.obstacles = [];

    const positions = [
      { x: -14, z: -8 }, { x: 14, z: -8 },
      { x: -14, z: 8 }, { x: 14, z: 8 },
      { x: 0, z: 0 },
      { x: -22, z: 0 }, { x: 22, z: 0 }
    ];

    const boxGeo = new THREE.BoxGeometry(4, 3, 4);
    positions.forEach(pos => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.7,
        roughness: 0.3
      });
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(pos.x, 1.5, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.obstacles.push({ mesh, x: pos.x, z: pos.z, radius: 2.5, hp: 3 });
    });
  }

  spawnPracticeDrones() {
    this.clearPracticeDrones();
    for (let i = 0; i < 5; i++) {
      const droneGeo = new THREE.SphereGeometry(1.6, 16, 16);
      const droneMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.4
      });
      const mesh = new THREE.Mesh(droneGeo, droneMat);
      const x = (Math.random() - 0.5) * 40;
      const z = -10 - Math.random() * 20;
      mesh.position.set(x, 3.5, z);
      this.scene.add(mesh);
      this.practiceTargets.push({
        mesh,
        x,
        z,
        baseY: 3.5,
        speedX: (Math.random() - 0.5) * 6,
        radius: 1.8
      });
    }
  }

  clearPracticeDrones() {
    this.practiceTargets.forEach(t => this.scene.remove(t.mesh));
    this.practiceTargets = [];
  }

  fireMissile(tank, isP1) {
    if (tank.reload > 0 || tank.hp <= 0) return;
    tank.reload = tank.maxReload;

    this.audio.missileLaunch();

    const mGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.4, 8);
    const mMat = new THREE.MeshBasicMaterial({ color: isP1 ? 0x38bdf8 : 0xf97316 });
    const mesh = new THREE.Mesh(mGeo, mMat);
    mesh.rotation.x = Math.PI / 2;

    const angle = tank.rot;
    const speed = 36;
    const startX = tank.x + Math.sin(angle) * 3.2;
    const startZ = tank.z + Math.cos(angle) * 3.2;

    mesh.position.set(startX, 1.8, startZ);
    mesh.rotation.y = angle;
    this.scene.add(mesh);

    this.missiles.push({
      mesh,
      x: startX,
      z: startZ,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      isP1,
      life: 2.5
    });
  }

  update(dt, input) {
    // 1. Player 1 Movement & Controls
    const p1In = input.getP1();
    if (this.p1.hp > 0 && !this.matchOver) {
      if (p1In.left) this.p1.rot += 2.4 * dt;
      if (p1In.right) this.p1.rot -= 2.4 * dt;

      const accel = 18;
      if (p1In.up) this.p1.speed = Math.min(14, this.p1.speed + accel * dt);
      else if (p1In.down) this.p1.speed = Math.max(-8, this.p1.speed - accel * dt);
      else this.p1.speed *= Math.max(0, 1 - dt * 4.5);

      this.p1.x += Math.sin(this.p1.rot) * this.p1.speed * dt;
      this.p1.z += Math.cos(this.p1.rot) * this.p1.speed * dt;

      // Arena boundaries
      this.p1.x = Math.max(-36, Math.min(36, this.p1.x));
      this.p1.z = Math.max(-36, Math.min(36, this.p1.z));

      this.p1.mesh.position.set(this.p1.x, 0, this.p1.z);
      this.p1.mesh.rotation.y = this.p1.rot;

      if (p1In.fireJustPressed || p1In.fire) {
        this.fireMissile(this.p1, true);
      }
    }
    this.p1.reload = Math.max(0, this.p1.reload - dt);

    // 2. Player 2 / AI Movement
    if (this.currentMode !== 'Practice') {
      if (this.currentMode === '1P (vs AI)') {
        this.updateAI(dt);
      } else {
        const p2In = input.getP2();
        if (this.p2.hp > 0 && !this.matchOver) {
          if (p2In.left) this.p2.rot += 2.4 * dt;
          if (p2In.right) this.p2.rot -= 2.4 * dt;

          const accel = 18;
          if (p2In.up) this.p2.speed = Math.min(14, this.p2.speed + accel * dt);
          else if (p2In.down) this.p2.speed = Math.max(-8, this.p2.speed - accel * dt);
          else this.p2.speed *= Math.max(0, 1 - dt * 4.5);

          this.p2.x += Math.sin(this.p2.rot) * this.p2.speed * dt;
          this.p2.z += Math.cos(this.p2.rot) * this.p2.speed * dt;

          this.p2.x = Math.max(-36, Math.min(36, this.p2.x));
          this.p2.z = Math.max(-36, Math.min(36, this.p2.z));

          this.p2.mesh.position.set(this.p2.x, 0, this.p2.z);
          this.p2.mesh.rotation.y = this.p2.rot;

          if (p2In.fireJustPressed || p2In.fire) {
            this.fireMissile(this.p2, false);
          }
        }
      }
    }
    this.p2.reload = Math.max(0, this.p2.reload - dt);

    // 3. Practice Targets Update
    if (this.currentMode === 'Practice') {
      this.practiceTargets.forEach(t => {
        t.x += t.speedX * dt;
        if (t.x < -30 || t.x > 30) t.speedX *= -1;
        t.mesh.position.set(t.x, t.baseY + Math.sin(Date.now() * 0.003 + t.x) * 0.6, t.z);
      });
    }

    // 4. Missiles update & collisions
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      m.life -= dt;
      m.mesh.position.set(m.x, 1.8, m.z);

      let exploded = false;

      // Arena walls
      if (Math.abs(m.x) > 38 || Math.abs(m.z) > 38 || m.life <= 0) {
        exploded = true;
      }

      // Check hits on obstacles
      for (let o of this.obstacles) {
        const d = Math.hypot(m.x - o.x, m.z - o.z);
        if (d < o.radius) {
          exploded = true;
          o.hp--;
          if (o.hp <= 0) {
            this.scene.remove(o.mesh);
            this.obstacles = this.obstacles.filter(ob => ob !== o);
            this.createExplosion(o.x, 1.5, o.z, 0x64748b);
          }
          break;
        }
      }

      // Check hits on Practice Targets
      if (this.currentMode === 'Practice' && !exploded) {
        for (let pt of this.practiceTargets) {
          const d = Math.hypot(m.x - pt.x, m.z - pt.z);
          if (d < pt.radius) {
            exploded = true;
            this.createExplosion(pt.x, pt.baseY, pt.z, 0x10b981);
            this.audio.chime();
            // Respawn target
            pt.x = (Math.random() - 0.5) * 40;
            pt.z = -10 - Math.random() * 20;
            break;
          }
        }
      }

      // Check hits on Tanks
      if (this.currentMode !== 'Practice' && !exploded) {
        // Hit on P1
        if (!m.isP1 && this.p1.hp > 0) {
          const d1 = Math.hypot(m.x - this.p1.x, m.z - this.p1.z);
          if (d1 < 2.5) {
            exploded = true;
            this.p1.hp = Math.max(0, this.p1.hp - 35);
            this.audio.hit();
            if (this.p1.hp <= 0) this.onTankDestroyed(this.p1);
          }
        }
        // Hit on P2
        if (m.isP1 && this.p2.hp > 0) {
          const d2 = Math.hypot(m.x - this.p2.x, m.z - this.p2.z);
          if (d2 < 2.5) {
            exploded = true;
            this.p2.hp = Math.max(0, this.p2.hp - 35);
            this.audio.hit();
            if (this.p2.hp <= 0) this.onTankDestroyed(this.p2);
          }
        }
      }

      if (exploded) {
        this.createExplosion(m.x, 1.8, m.z, m.isP1 ? 0x38bdf8 : 0xf97316);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      p.mesh.scale.multiplyScalar(0.96);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  updateAI(dt) {
    if (this.p2.hp <= 0 || this.p1.hp <= 0 || this.matchOver) return;

    const dx = this.p1.x - this.p2.x;
    const dz = this.p1.z - this.p2.z;
    const dist = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dx, dz);

    let diff = targetAngle - this.p2.rot;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    if (Math.abs(diff) > 0.08) {
      this.p2.rot += Math.sign(diff) * 2.2 * dt;
    }

    if (dist > 16) {
      this.p2.speed = Math.min(10, this.p2.speed + 12 * dt);
    } else if (dist < 8) {
      this.p2.speed = Math.max(-6, this.p2.speed - 12 * dt);
    }

    this.p2.x += Math.sin(this.p2.rot) * this.p2.speed * dt;
    this.p2.z += Math.cos(this.p2.rot) * this.p2.speed * dt;
    this.p2.mesh.position.set(this.p2.x, 0, this.p2.z);
    this.p2.mesh.rotation.y = this.p2.rot;

    if (Math.abs(diff) < 0.35 && dist < 34) {
      this.aiFireTimer -= dt;
      if (this.aiFireTimer <= 0) {
        this.fireMissile(this.p2, false);
        this.aiFireTimer = 1.2 + Math.random() * 0.8;
      }
    }
  }

  createExplosion(x, y, z, colorHex) {
    this.audio.explosion();
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.SphereGeometry(0.35, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        Math.random() * 12 + 2,
        (Math.random() - 0.5) * 16
      );
      this.particles.push({ mesh, vel, life: 0.65 });
    }
  }

  onTankDestroyed(tank) {
    this.matchOver = true;
    tank.mesh.visible = false;
    this.createExplosion(tank.x, 1.5, tank.z, 0xff0044);

    let roundWinner = '';
    let isChampion = false;

    if (this.p1.hp > 0 && this.p2.hp <= 0) {
      this.p1Wins++;
      roundWinner = `🔵 PLAYER 1 WINS ROUND ${this.currentRound}!`;
      this.audio.victory();
    } else if (this.p2.hp > 0 && this.p1.hp <= 0) {
      this.p2Wins++;
      roundWinner = (this.currentMode === '1P (vs AI)' ? '🤖 AI BOT' : '🟠 PLAYER 2') + ` WINS ROUND ${this.currentRound}!`;
      this.audio.victory();
    }

    const isMatchComplete = (this.currentRound >= 3);

    setTimeout(() => {
      const modal = document.getElementById('tank-round-modal');
      const title = document.getElementById('tank-modal-title');
      const sub = document.getElementById('tank-modal-sub');
      const actionBtn = document.getElementById('tank-modal-btn');
      if (!modal) return;

      if (isMatchComplete) {
        if (this.p1Wins > this.p2Wins) {
          title.textContent = '🔵 PLAYER 1 IS THE CHAMPION! 🏆';
          sub.textContent = `Match Series Complete (3 Rounds) · Final Score: ${this.p1Wins} - ${this.p2Wins}`;
        } else if (this.p2Wins > this.p1Wins) {
          title.textContent = (this.currentMode === '1P (vs AI)' ? '🤖 AI BOT' : '🟠 PLAYER 2') + ' IS THE CHAMPION! 🏆';
          sub.textContent = `Match Series Complete (3 Rounds) · Final Score: ${this.p2Wins} - ${this.p1Wins}`;
        } else {
          title.textContent = 'SERIES DRAW (3 ROUNDS) 🤝';
          sub.textContent = `Both tanks tied at ${this.p1Wins} - ${this.p2Wins}!`;
        }
        actionBtn.textContent = 'Play New Match (3 Rounds)';
      } else {
        title.textContent = roundWinner;
        sub.textContent = `Round ${this.currentRound} of 3 complete. Series score: P1 [${this.p1Wins}] - [${this.p2Wins}] Rival`;
        actionBtn.textContent = `Next Round (Round ${this.currentRound + 1} of 3) →`;
      }

      modal.style.display = 'flex';
    }, 1000);
  }

  handleNextRound() {
    if (this.currentRound >= 3) {
      this.currentRound = 1;
      this.p1Wins = 0;
      this.p2Wins = 0;
    } else {
      this.currentRound++;
    }
    this.resetRound();
  }

  getHUDHtml() {
    return `
      <div class="tank-hud-container">
        <!-- Top Round Header -->
        <div class="tank-round-bar">
          <div class="tank-round-badge" id="tank-round-badge">
            ${this.currentMode === 'Practice' ? 'FREE PRACTICE RANGE' : `ROUND ${this.currentRound} / 3`}
          </div>
          <div class="tank-series-score" id="tank-series-score">
            ${this.currentMode === 'Practice' ? 'INFINITE TARGET PRACTICE' : `P1 [ ${this.p1Wins} ]  —  [ ${this.p2Wins} ] RIVAL`}
          </div>
        </div>

        <!-- Player 1 Status (Bottom-Left) -->
        <div class="tank-card p1-card">
          <div class="tank-card-name">🔵 PLAYER 1</div>
          <div class="bar-container">
            <div class="bar-fill hp-bar" id="p1-hp-fill" style="width: 100%;"></div>
          </div>
          <div class="tank-reload-text" id="p1-reload-text">READY TO FIRE [SPACE]</div>
        </div>

        <!-- Player 2 / AI Status (Bottom-Right) -->
        <div class="tank-card p2-card" id="p2-hud-card" style="display: ${this.currentMode === 'Practice' ? 'none' : 'block'};">
          <div class="tank-card-name" id="p2-name-label">${this.currentMode === '1P (vs AI)' ? '🤖 AI BOT' : '🟠 PLAYER 2'}</div>
          <div class="bar-container">
            <div class="bar-fill hp-bar p2-hp" id="p2-hp-fill" style="width: 100%;"></div>
          </div>
          <div class="tank-reload-text" id="p2-reload-text">${this.currentMode === '1P (vs AI)' ? 'AI AUTONOMOUS' : 'READY TO FIRE [ENTER]'}</div>
        </div>

        <!-- Round Victory Modal -->
        <div class="tank-modal-overlay" id="tank-round-modal" style="display: none;">
          <div class="tank-modal-box">
            <div style="font-size: 3rem;">🏆</div>
            <h2 id="tank-modal-title">ROUND COMPLETE</h2>
            <p id="tank-modal-sub" style="color: #94a3b8; font-size: 0.95rem; margin: 8px 0 20px;"></p>
            <button class="primary-btn" id="tank-modal-btn">Next Round →</button>
          </div>
        </div>
      </div>
    `;
  }

  updateHUD() {
    const badge = document.getElementById('tank-round-badge');
    const score = document.getElementById('tank-series-score');
    const p1Fill = document.getElementById('p1-hp-fill');
    const p2Fill = document.getElementById('p2-hp-fill');
    const p1Reload = document.getElementById('p1-reload-text');

    if (badge) {
      badge.textContent = this.currentMode === 'Practice' ? 'FREE PRACTICE RANGE' : `ROUND ${this.currentRound} / 3`;
    }
    if (score && this.currentMode !== 'Practice') {
      const rival = this.currentMode === '1P (vs AI)' ? 'AI' : 'P2';
      score.textContent = `P1 [ ${this.p1Wins} ]  —  [ ${this.p2Wins} ] ${rival}`;
    }
    if (p1Fill) {
      p1Fill.style.width = `${Math.max(0, this.p1.hp)}%`;
    }
    if (p2Fill) {
      p2Fill.style.width = `${Math.max(0, this.p2.hp)}%`;
    }
    if (p1Reload) {
      p1Reload.textContent = this.p1.reload > 0 ? `RELOADING... ${(this.p1.reload).toFixed(1)}s` : 'READY TO FIRE [SPACE]';
    }

    // Attach listener for modal button once
    const btn = document.getElementById('tank-modal-btn');
    if (btn && !btn._hasClickListener) {
      btn._hasClickListener = true;
      btn.addEventListener('click', () => {
        this.handleNextRound();
      });
    }
  }

  getControlsGuide() {
    return [
      { label: 'Player 1 Move / Steer', keys: 'W A S D' },
      { label: 'Player 1 Fire Missiles', keys: 'SPACE' },
      { label: 'Player 2 Move / Steer', keys: 'ARROWS' },
      { label: 'Player 2 Fire Missiles', keys: 'ENTER / NUMPAD 0' },
      { label: 'Series Tournament Rule', keys: 'Strictly 3 Rounds per match' },
      { label: 'Practice Mode', keys: 'Infinite solo target practice' }
    ];
  }

  destroy() {
    super.destroy();
    this.missiles.forEach(m => this.scene.remove(m.mesh));
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.obstacles.forEach(o => this.scene.remove(o.mesh));
    this.clearPracticeDrones();
  }
}
