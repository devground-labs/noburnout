/**
 * BaseGame - Foundation class for all games built in the Arcade framework.
 */
export class BaseGame {
  constructor(metadata = {}) {
    this.id = metadata.id || 'unnamed-game';
    this.name = metadata.name || 'Unnamed Game';
    this.subtitle = metadata.subtitle || '';
    this.description = metadata.description || '';
    this.icon = metadata.icon || '🎮';
    this.badge = metadata.badge || '3D WebGL';
    this.genre = metadata.genre || 'Arcade';
    this.players = metadata.players || '1-2 Players';
    this.modes = metadata.modes || ['Standard'];
    this.currentMode = this.modes[0];

    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.physics = null;
    this.audio = null;
    this.input = null;
    this.ui = null;

    this.isPaused = false;
    this.isRunning = false;
  }

  /**
   * Called once when the game is loaded by the engine.
   */
  async init(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.physics = engine.physics;
    this.audio = engine.audio;
    this.input = engine.input;
    this.ui = engine.ui;
  }

  /**
   * Called to start or restart gameplay with a chosen mode.
   */
  start(mode = this.modes[0]) {
    this.currentMode = mode;
    this.isRunning = true;
    this.isPaused = false;
  }

  /**
   * Per-frame logic update.
   */
  update(dt, input) {
    // Override in derived game
  }

  /**
   * Optional custom render pass. If omitted, engine renders standard camera & scene.
   */
  render() {
    // Default handles through engine.render()
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  /**
   * Cleans up all objects, meshes, physics bodies, and listeners created by this game.
   */
  destroy() {
    this.isRunning = false;
    this.isPaused = false;
  }

  /**
   * Returns HTML string for this game's custom HUD overlay.
   */
  getHUDHtml() {
    return '';
  }

  /**
   * Called during update to refresh DOM elements in this game's HUD.
   */
  updateHUD() {}

  /**
   * Returns an array of control instructions for the Help modal.
   * Format: [{ label: 'Move', keys: 'W A S D' }]
   */
  getControlsGuide() {
    return [];
  }
}
