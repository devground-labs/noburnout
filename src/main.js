import { inject } from '@vercel/analytics';

// Self-hosted fonts (latin subset), bundled by Vite so no third-party font requests are made
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-800.css';
import '@fontsource/orbitron/latin-600.css';
import '@fontsource/orbitron/latin-800.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';

import { Engine } from './framework/Engine.js';
import { UIManager } from './framework/UIManager.js';
import { showVisitorCount } from './framework/visitors.js';
import { initLandingMotion } from './framework/landingMotion.js';
import { CyberTanksGame } from './games/cyber-tanks/CyberTanksGame.js';
import { AstroBlasterGame } from './games/astro-blaster/AstroBlasterGame.js';
import { OverdriveGame } from './games/overdrive/OverdriveGame.js';
import { CyberRunnerGame } from './games/cyber-runner/CyberRunnerGame.js';
import { PinballGame } from './games/pinball/PinballGame.js';
import { MazePaintGame } from './games/maze-paint/MazePaintGame.js';
import { PatternRecallGame } from './games/pattern-recall/PatternRecallGame.js';


// Vercel Web Analytics: cookieless visitor and page-view counts (only reports on the deployed site)
inject();

// Bootstrap Arcade Framework
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');
  const engine = new Engine(container);
  const ui = new UIManager(engine);
  engine.ui = ui;

  // Register the live game lineup
  // Order here is the order shown on the landing page and in the Switch game modal
  engine.registry.register(AstroBlasterGame);
  engine.registry.register(OverdriveGame);
  engine.registry.register(CyberRunnerGame);
  engine.registry.register(PinballGame);
  engine.registry.register(MazePaintGame);
  engine.registry.register(PatternRecallGame);
  engine.registry.register(CyberTanksGame);

  initLandingMotion();

  // Start with Landing Page and 3D ambient cyber grid lobby
  ui.showLandingPage();

  // Live visitor count (quietly does nothing if the API is unavailable)
  showVisitorCount();

  // Welcome toast
  ui.toast('WELCOME TO NOBURNOUT', 'Take a break. Pick a game to get started.', '#38bdf8');
});
