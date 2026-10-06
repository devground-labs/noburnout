import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { AudioManager } from './AudioManager.js';
import { InputManager } from './InputManager.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { GameRegistry } from './GameRegistry.js';

/**
 * Master Game Engine Orchestrator
 */
export class Engine {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.registry = new GameRegistry();
    this.audio = new AudioManager();
    this.input = new InputManager();
    this.physics = new PhysicsWorld();

    this.clock = new THREE.Clock();
    this.currentGame = null;
    this.ui = null; // Assigned by bootstrap
    this.fps = 60;
    this._frameCount = 0;
    this._fpsTimer = 0;

    this._initThree();
    this._bindEvents();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913);
    this.scene.fog = new THREE.FogExp2(0x060913, 0.012);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.camera.position.set(0, 25, 30);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.container.appendChild(this.renderer.domElement);
  }

  _bindEvents() {
    this._onResize = () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      if (this.currentGame && typeof this.currentGame.onResize === 'function') {
        this.currentGame.onResize(width, height);
      }
    };
    window.addEventListener('resize', this._onResize);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  async loadGame(gameId, mode = null) {
    const entry = this.registry.get(gameId);
    if (!entry) {
      console.error();
      return;
    }

    // 1. Destroy and cleanup existing game
    if (this.currentGame) {
      try {
        this.currentGame.destroy();
      } catch (err) {
        console.warn('Error during game destroy:', err);
      }
      this.currentGame = null;
    }

    // 2. Clear Scene & Physics
    this._clearScene();
    this.physics.clear();

    // 3. Instantiate & initialize new game
    const game = new entry.GameClass();
    await game.init(this);
    this.currentGame = game;

    // 4. Update UI HUD
    if (this.ui) {
      this.ui.setGameHUD(game.getHUDHtml());
      this.ui.updateActiveGameInfo(entry);
    }

    // 5. Start game
    game.start(mode || entry.modes[0]);
    this.clock.start();
  }

  _clearScene() {
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // FPS Meter
    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 0.5) {
      this.fps = Math.round((this._frameCount / this._fpsTimer));
      this._frameCount = 0;
      this._fpsTimer = 0;
      if (this.ui) this.ui.updateFPS(this.fps);
    }

    TWEEN.update();

    if (this.currentGame && this.currentGame.isRunning && !this.currentGame.isPaused) {
      this.physics.step(dt);
      this.currentGame.update(dt, this.input);
      this.currentGame.updateHUD();
    }

    if (this.currentGame && typeof this.currentGame.render === 'function') {
      this.currentGame.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.input.update();
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    if (this.currentGame) this.currentGame.destroy();
    this.input.destroy();
    this.renderer.dispose();
  }
}
