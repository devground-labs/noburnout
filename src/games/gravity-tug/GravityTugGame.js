import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BaseGame } from '../../framework/BaseGame.js';
import PeerJS from 'peerjs';
const Peer = PeerJS.Peer || PeerJS;

export class GravityTugGame extends BaseGame {
  constructor() {
    super({
      id: 'gravity-tug',
      name: 'Gravity Tug-o-War',
      subtitle: 'P2P Physics Combat',
      description: 'Connect with a friend! Use your ship\'s gravity tether to pull the massive central asteroid into your opponent\'s goal before they pull it into yours.',
      icon: '☄️',
      badge: 'Multiplayer P2P',
      genre: 'Physics Multiplayer',
      players: '2 Players',
      modes: ['Host Game', 'Join Game']
    });

    this.peer = null;
    this.connection = null;
    this.isHost = false;
    this.networkState = 'disconnected'; // disconnected, connecting, waiting, connected
    this.joinCode = '';
    
    // Game state
    this.asteroid = null;
    this.playerShip = null;
    this.enemyShip = null;
    
    this.playerScore = 0;
    this.enemyScore = 0;

    // We will sync these coordinates
    this.syncData = {
      asteroid: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      p1: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, pulling: false },
      p2: { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, pulling: false },
      score: { p1: 0, p2: 0 }
    };

    // Client inputs to send to Host
    this.clientInput = {
      up: false, down: false, left: false, right: false, pull: false
    };

    this.p1Input = { up: false, down: false, left: false, right: false, pull: false };
    this.p2Input = { up: false, down: false, left: false, right: false, pull: false };

    this.tethers = [];
  }

  async init(engine) {
    await super.init(engine);
    
    // Setup camera
    this.camera.position.set(0, 60, 70);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 1.5);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(20, 50, 20);
    this.scene.add(dir);

    // Setup Physics
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, 0, 0)
    });

    // Create Arena Boundaries & Entities
    this.createArena();
    this.createAsteroid();
    this.createShips();
  }

  start(mode) {
    super.start(mode);
    
    if (this.currentMode === 'Host Game') {
      this.initHost();
    } else {
      this.initJoinUI();
    }
    
    this.updateHUD();
  }

  createArena() {
    // Visual grid
    const grid = new THREE.GridHelper(100, 20, 0x00ff00, 0x004400);
    grid.position.y = -5;
    this.scene.add(grid);

    // Physics walls (invisible)
    const wallGeo = new THREE.BoxGeometry(100, 10, 2);
    const wallMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false });

    const createWall = (x, y, z, mass = 0) => {
      const mesh = new THREE.Mesh(wallGeo, wallMat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const shape = new CANNON.Box(new CANNON.Vec3(50, 5, 1));
      const body = new CANNON.Body({ mass, position: new CANNON.Vec3(x, y, z) });
      body.addShape(shape);
      this.world.addBody(body);
    };

    createWall(0, 0, -50); // Top
    createWall(0, 0, 50);  // Bottom
    
    // Goals
    const goalGeo = new THREE.BoxGeometry(20, 5, 5);
    
    this.goal1Mesh = new THREE.Mesh(goalGeo, new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 }));
    this.goal1Mesh.position.set(0, -2.5, 45);
    this.scene.add(this.goal1Mesh);
    
    this.goal2Mesh = new THREE.Mesh(goalGeo, new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.5 }));
    this.goal2Mesh.position.set(0, -2.5, -45);
    this.scene.add(this.goal2Mesh);
  }

  createAsteroid() {
    const radius = 4;
    const geo = new THREE.DodecahedronGeometry(radius, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
    this.asteroidMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.asteroidMesh);

    const shape = new CANNON.Sphere(radius);
    this.asteroidBody = new CANNON.Body({
      mass: 50,
      position: new CANNON.Vec3(0, 0, 0),
      linearDamping: 0.1,
      angularDamping: 0.1
    });
    this.asteroidBody.addShape(shape);
    this.world.addBody(this.asteroidBody);
  }

  createShips() {
    const geo = new THREE.ConeGeometry(2, 6, 8);
    geo.rotateX(Math.PI / 2);
    
    const p1Mat = new THREE.MeshStandardMaterial({ color: 0x00aaff });
    this.p1Mesh = new THREE.Mesh(geo, p1Mat);
    this.scene.add(this.p1Mesh);

    const p2Mat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.p2Mesh = new THREE.Mesh(geo, p2Mat);
    this.scene.add(this.p2Mesh);

    // Host physics bodies
    const shape = new CANNON.Cylinder(2, 2, 6, 8);
    
    this.p1Body = new CANNON.Body({ mass: 10, position: new CANNON.Vec3(0, 0, 30), linearDamping: 0.5 });
    this.p1Body.addShape(shape, new CANNON.Vec3(0,0,0), new CANNON.Quaternion().setFromEuler(Math.PI/2, 0, 0));
    this.world.addBody(this.p1Body);

    this.p2Body = new CANNON.Body({ mass: 10, position: new CANNON.Vec3(0, 0, -30), linearDamping: 0.5 });
    this.p2Body.addShape(shape, new CANNON.Vec3(0,0,0), new CANNON.Quaternion().setFromEuler(Math.PI/2, 0, 0));
    this.world.addBody(this.p2Body);

    // Tethers (visual lines)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 });
    this.p1TetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.p1Tether = new THREE.Line(this.p1TetherGeo, lineMat);
    this.scene.add(this.p1Tether);

    this.p2TetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.p2Tether = new THREE.Line(this.p2TetherGeo, lineMat);
    this.scene.add(this.p2Tether);
    
    this.updateVisuals();
  }

  // --- Networking ---

  initHost() {
    this.isHost = true;
    this.networkState = 'connecting';
    this.updateHUD();
    
    this.peer = new Peer();
    
    this.peer.on('open', (id) => {
      this.joinCode = id;
      this.networkState = 'waiting';
      this.updateHUD();
    });

    this.peer.on('connection', (conn) => {
      this.connection = conn;
      this.networkState = 'connected';
      this.updateHUD();
      this.engine.ui.toast('PLAYER JOINED', 'Game Starting!', '#10b981');

      conn.on('data', (data) => {
        if (data.type === 'input') {
          this.p2Input = data.input;
        }
      });
      
      conn.on('close', () => {
        this.engine.ui.toast('DISCONNECTED', 'Player 2 left', '#ef4444');
        this.networkState = 'waiting';
        this.connection = null;
        this.updateHUD();
      });
    });
  }

  initJoinUI() {
    this.isHost = false;
    this.networkState = 'disconnected';
    
    const uiStr = `
      <div style="position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); text-align:center; background:rgba(0,0,0,0.8); padding:2rem; border:2px solid #38bdf8; border-radius:8px; pointer-events:auto;">
        <h2 style="color:#38bdf8; margin-bottom:1rem;">JOIN A GAME</h2>
        <input type="text" id="tug-join-input" placeholder="Enter Host Code" style="padding:0.5rem; width:250px; text-align:center; margin-bottom:1rem; border-radius:4px; border:none; background:#1e293b; color:#fff;" />
        <br>
        <button id="tug-join-btn" class="cyan-btn" style="padding:0.5rem 2rem; cursor:pointer;">CONNECT</button>
      </div>
    `;
    this.engine.ui.setGameHUD(uiStr);
    
    // Give DOM a frame to update
    requestAnimationFrame(() => {
      const btn = document.getElementById('tug-join-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const code = document.getElementById('tug-join-input').value.trim();
          if(code) this.joinGame(code);
        });
      }
    });
  }

  joinGame(code) {
    this.networkState = 'connecting';
    this.engine.ui.setGameHUD('<div style="color:#fff; text-align:center; margin-top:20vh; font-size:1.5rem;">CONNECTING TO HOST...</div>');
    
    this.peer = new Peer();
    this.peer.on('open', (id) => {
      const conn = this.peer.connect(code);
      
      conn.on('open', () => {
        this.connection = conn;
        this.networkState = 'connected';
        this.updateHUD();
        this.engine.ui.toast('CONNECTED', 'Joined Game Successfully!', '#10b981');
      });

      conn.on('data', (data) => {
        if (data.type === 'sync') {
          this.syncData = data.state;
        }
      });
      
      conn.on('close', () => {
        this.engine.ui.toast('DISCONNECTED', 'Host closed connection', '#ef4444');
        this.initJoinUI();
      });
      
      conn.on('error', (err) => {
        this.engine.ui.toast('CONNECTION ERROR', err.message, '#ef4444');
        this.initJoinUI();
      });
    });
  }

  // --- Game Loop ---

  update(dt, input) {
    if (this.networkState !== 'connected') return;

    if (this.isHost) {
      this.updateHostPhysics(dt);
      this.broadcastState();
    } else {
      this.sendInput();
      this.applySyncData();
    }

    this.updateVisuals();
  }

  updateHostPhysics(dt) {
    this.world.step(1 / 60, dt, 3);

    const speed = 40;
    const pullForce = 400;

    // Apply P1 Inputs directly from input manager
    const keys = this.engine.input.keys;
    this.p1Input.up = keys['ArrowUp'] || keys['KeyW'];
    this.p1Input.down = keys['ArrowDown'] || keys['KeyS'];
    this.p1Input.left = keys['ArrowLeft'] || keys['KeyA'];
    this.p1Input.right = keys['ArrowRight'] || keys['KeyD'];
    this.p1Input.pull = keys['Space'];

    this.applyForces(this.p1Body, this.p1Input, speed, pullForce, 1);
    this.applyForces(this.p2Body, this.p2Input, speed, pullForce, -1);

    // Goals Check (Host only)
    if (this.asteroidBody.position.z > 40) {
      this.playerScore++;
      this.engine.ui.toast('GOAL!', 'Player 1 Scored', '#00aaff');
      this.resetPositions();
    } else if (this.asteroidBody.position.z < -40) {
      this.enemyScore++;
      this.engine.ui.toast('GOAL!', 'Player 2 Scored', '#ff4444');
      this.resetPositions();
    }

    // Pack Sync Data
    this.syncData = {
      asteroid: { x: this.asteroidBody.position.x, y: this.asteroidBody.position.y, z: this.asteroidBody.position.z,
                  qx: this.asteroidBody.quaternion.x, qy: this.asteroidBody.quaternion.y, qz: this.asteroidBody.quaternion.z, qw: this.asteroidBody.quaternion.w },
      p1: { x: this.p1Body.position.x, y: this.p1Body.position.y, z: this.p1Body.position.z,
            qx: this.p1Body.quaternion.x, qy: this.p1Body.quaternion.y, qz: this.p1Body.quaternion.z, qw: this.p1Body.quaternion.w, pulling: !!this.p1Input.pull },
      p2: { x: this.p2Body.position.x, y: this.p2Body.position.y, z: this.p2Body.position.z,
            qx: this.p2Body.quaternion.x, qy: this.p2Body.quaternion.y, qz: this.p2Body.quaternion.z, qw: this.p2Body.quaternion.w, pulling: !!this.p2Input.pull },
      score: { p1: this.playerScore, p2: this.enemyScore }
    };
  }

  applyForces(body, input, speed, pullForce, directionMultiplier) {
    if (!input) return;
    
    // Movement
    if (input.left) body.applyForce(new CANNON.Vec3(-speed, 0, 0), body.position);
    if (input.right) body.applyForce(new CANNON.Vec3(speed, 0, 0), body.position);
    if (input.up) body.applyForce(new CANNON.Vec3(0, 0, -speed), body.position);
    if (input.down) body.applyForce(new CANNON.Vec3(0, 0, speed), body.position);

    // Boundary constraints softly via force
    if (body.position.x < -40) body.applyForce(new CANNON.Vec3(100, 0, 0), body.position);
    if (body.position.x > 40) body.applyForce(new CANNON.Vec3(-100, 0, 0), body.position);
    if (body.position.z < -45) body.applyForce(new CANNON.Vec3(0, 0, 100), body.position);
    if (body.position.z > 45) body.applyForce(new CANNON.Vec3(0, 0, -100), body.position);

    // Pulling the asteroid
    if (input.pull) {
      const p = body.position;
      const a = this.asteroidBody.position;
      const dir = new CANNON.Vec3(p.x - a.x, p.y - a.y, p.z - a.z);
      const dist = dir.length();
      if (dist < 40 && dist > 2) {
        dir.normalize();
        const f = dir.scale(pullForce);
        this.asteroidBody.applyForce(f, this.asteroidBody.position);
        body.applyForce(f.scale(-0.5), body.position); // Opposite reaction
      }
    }
    
    // Look at asteroid
    const dirToA = new CANNON.Vec3(this.asteroidBody.position.x - body.position.x, 0, this.asteroidBody.position.z - body.position.z);
    dirToA.normalize();
    const targetRot = Math.atan2(dirToA.x, dirToA.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), targetRot);
  }

  resetPositions() {
    this.asteroidBody.position.set(0, 0, 0);
    this.asteroidBody.velocity.set(0, 0, 0);
    this.asteroidBody.angularVelocity.set(0, 0, 0);
    
    this.p1Body.position.set(0, 0, 30);
    this.p1Body.velocity.set(0,0,0);
    this.p1Body.angularVelocity.set(0,0,0);
    
    this.p2Body.position.set(0, 0, -30);
    this.p2Body.velocity.set(0,0,0);
    this.p2Body.angularVelocity.set(0,0,0);
  }

  broadcastState() {
    if (this.connection && this.connection.open) {
      this.connection.send({ type: 'sync', state: this.syncData });
    }
  }

  sendInput() {
    const keys = this.engine.input.keys;
    const input = {
      up: keys['ArrowUp'] || keys['KeyW'],
      down: keys['ArrowDown'] || keys['KeyS'],
      left: keys['ArrowLeft'] || keys['KeyA'],
      right: keys['ArrowRight'] || keys['KeyD'],
      pull: keys['Space']
    };
    
    if (this.connection && this.connection.open) {
      this.connection.send({ type: 'input', input });
    }
    
    // Assume local pulling for visual feedback
    this.syncData.p2.pulling = input.pull; 
  }

  applySyncData() {
    if (this.playerScore !== this.syncData.score.p1 || this.enemyScore !== this.syncData.score.p2) {
      this.updateHUD();
    }
    this.playerScore = this.syncData.score.p1;
    this.enemyScore = this.syncData.score.p2;
    
    this.asteroidMesh.position.set(this.syncData.asteroid.x, this.syncData.asteroid.y, this.syncData.asteroid.z);
    this.asteroidMesh.quaternion.set(this.syncData.asteroid.qx, this.syncData.asteroid.qy, this.syncData.asteroid.qz, this.syncData.asteroid.qw);

    this.p1Mesh.position.set(this.syncData.p1.x, this.syncData.p1.y, this.syncData.p1.z);
    this.p1Mesh.quaternion.set(this.syncData.p1.qx, this.syncData.p1.qy, this.syncData.p1.qz, this.syncData.p1.qw);

    this.p2Mesh.position.set(this.syncData.p2.x, this.syncData.p2.y, this.syncData.p2.z);
    this.p2Mesh.quaternion.set(this.syncData.p2.qx, this.syncData.p2.qy, this.syncData.p2.qz, this.syncData.p2.qw);
  }

  updateVisuals() {
    if (this.isHost) {
      this.asteroidMesh.position.copy(this.asteroidBody.position);
      this.asteroidMesh.quaternion.copy(this.asteroidBody.quaternion);
      this.p1Mesh.position.copy(this.p1Body.position);
      this.p1Mesh.quaternion.copy(this.p1Body.quaternion);
      this.p2Mesh.position.copy(this.p2Body.position);
      this.p2Mesh.quaternion.copy(this.p2Body.quaternion);
    }
    
    // Update Tethers using Float32Array directly
    const updateTether = (geo, start, end) => {
      const positions = new Float32Array([
        start.x, start.y, start.z,
        end.x, end.y, end.z
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    };

    if (this.syncData.p1.pulling) {
      updateTether(this.p1TetherGeo, this.p1Mesh.position, this.asteroidMesh.position);
      this.p1Tether.visible = true;
    } else {
      this.p1Tether.visible = false;
    }

    if (this.syncData.p2.pulling) {
      updateTether(this.p2TetherGeo, this.p2Mesh.position, this.asteroidMesh.position);
      this.p2Tether.visible = true;
    } else {
      this.p2Tether.visible = false;
    }
  }

  updateHUD() {
    let html = '';
    
    if (this.networkState === 'waiting') {
      html = `
        <div style="position:absolute; top:20vh; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); padding:2rem; border:2px solid #10b981; border-radius:8px; text-align:center; pointer-events:auto;">
          <h2 style="color:#10b981; margin:0 0 10px 0;">WAITING FOR PLAYER 2</h2>
          <p style="color:#fff; margin:0;">Share this join code with your friend:</p>
          <div style="font-size:2rem; font-family:monospace; color:#38bdf8; letter-spacing:2px; margin-top:15px; user-select:all; background:#1e293b; padding:10px; border-radius:4px;">${this.joinCode}</div>
        </div>
      `;
    } else if (this.networkState === 'connected') {
      const isP1 = this.isHost;
      html = `
        <div style="position:absolute; top:20px; left:20px; color:#00aaff; font-size:1.5rem; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px; border-radius:5px; border:${isP1 ? '2px solid #00aaff' : 'none'}; pointer-events:none;">
          P1 (Blue): ${this.playerScore} ${isP1 ? '(YOU)' : ''}
        </div>
        <div style="position:absolute; top:20px; right:20px; color:#ff4444; font-size:1.5rem; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px; border-radius:5px; border:${!isP1 ? '2px solid #ff4444' : 'none'}; pointer-events:none;">
          P2 (Red): ${this.enemyScore} ${!isP1 ? '(YOU)' : ''}
        </div>
        <div style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); color:#fff; text-align:center; background:rgba(0,0,0,0.5); padding:10px; border-radius:5px; pointer-events:none;">
          WASD/Arrows to Move | SPACE to Pull Asteroid
        </div>
      `;
    }
    
    // Disconnected state UI is handled in initJoinUI
    if (this.networkState !== 'disconnected') {
      if (this._lastHudState !== html) {
        this._lastHudState = html;
        this.engine.ui.setGameHUD(html);
      }
    }
  }

  getControlsGuide() {
    return [
      { label: 'Move Ship', keys: 'WASD or Arrows' },
      { label: 'Gravity Pull', keys: 'SPACE' },
      { label: 'Return to Lobby', keys: 'ESC or Lobby Button' }
    ];
  }

  destroy() {
    super.destroy();
    if (this.connection) {
      this.connection.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    
    // Clean up scene
    if (this.p1Tether) this.scene.remove(this.p1Tether);
    if (this.p2Tether) this.scene.remove(this.p2Tether);
    if (this.p1TetherGeo) this.p1TetherGeo.dispose();
    if (this.p2TetherGeo) this.p2TetherGeo.dispose();
  }
}
