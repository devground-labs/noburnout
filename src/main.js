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

  // Load primary showcase game
  await engine.loadGame('cyber-tanks', '1P (vs AI)');

  // Welcome toast
  ui.toast('NEXUS ARCADE READY', 'Click "Switch Game" to browse the multi-game catalog!', '#38bdf8');
});
