import { Engine } from './framework/Engine.js';
import { UIManager } from './framework/UIManager.js';
import { CyberTanksGame } from './games/cyber-tanks/CyberTanksGame.js';
import { AstroBlasterGame } from './games/astro-blaster/AstroBlasterGame.js';

// Bootstrap Arcade Framework
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');
  const engine = new Engine(container);
  const ui = new UIManager(engine);
  engine.ui = ui;

  // Register multi-game suite
  engine.registry.register(CyberTanksGame);
  engine.registry.register(AstroBlasterGame);

  // Start with Landing Page and 3D ambient cyber grid lobby
  ui.showLandingPage();

  // Welcome toast
  ui.toast('WELCOME TO NEXUS ARCADE', 'Select your game below to begin playing!', '#38bdf8');
});
