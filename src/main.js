import { Engine } from './framework/Engine.js';
import { UIManager } from './framework/UIManager.js';
import { CyberTanksGame } from './games/cyber-tanks/CyberTanksGame.js';
import { AstroBlasterGame } from './games/astro-blaster/AstroBlasterGame.js';
import { CricketGame } from './games/cricket/CricketGame.js';
import { ShadowOperativeGame } from './games/shadow-operative/ShadowOperativeGame.js';
import { SuperPlumberGame } from './games/super-plumber/SuperPlumberGame.js';

// Bootstrap Arcade Framework
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');
  const engine = new Engine(container);
  const ui = new UIManager(engine);
  engine.ui = ui;

  // Register multi-game suite
  engine.registry.register(CyberTanksGame);
  engine.registry.register(AstroBlasterGame);
  engine.registry.register(CricketGame);
  engine.registry.register(ShadowOperativeGame);
  engine.registry.register(SuperPlumberGame);

  // Start with Landing Page and 3D ambient cyber grid lobby
  ui.showLandingPage();

  // Welcome toast
  ui.toast('WELCOME TO NEXUS ARCADE', 'Select your game below to begin playing!', '#38bdf8');
});
