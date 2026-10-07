import { Engine } from './framework/Engine.js';
import { UIManager } from './framework/UIManager.js';
import { CyberTanksGame } from './games/cyber-tanks/CyberTanksGame.js';
import { AstroBlasterGame } from './games/astro-blaster/AstroBlasterGame.js';
import { NeonOverdriveGame } from './games/neon-overdrive/NeonOverdriveGame.js';
import { CyberRunnerGame } from './games/cyber-runner/CyberRunnerGame.js';

// Hidden for now (code kept in src/games/, re-enable by importing + registering):
// import { CricketGame } from './games/cricket/CricketGame.js';
// import { ShadowOperativeGame } from './games/shadow-operative/ShadowOperativeGame.js';
// import { SuperPlumberGame } from './games/super-plumber/SuperPlumberGame.js';
// import { GravityTugGame } from './games/gravity-tug/GravityTugGame.js';

// Bootstrap Arcade Framework
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');
  const engine = new Engine(container);
  const ui = new UIManager(engine);
  engine.ui = ui;

  // Register the live game lineup
  engine.registry.register(CyberTanksGame);
  engine.registry.register(AstroBlasterGame);
  engine.registry.register(NeonOverdriveGame);
  engine.registry.register(CyberRunnerGame);

  // Start with Landing Page and 3D ambient cyber grid lobby
  ui.showLandingPage();

  // Welcome toast
  ui.toast('WELCOME TO NOBURNOUT', 'Take a break. Pick a game to get started.', '#38bdf8');
});
