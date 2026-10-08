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
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';

import { Engine } from './framework/Engine.js';
import { UIManager } from './framework/UIManager.js';
import { CyberTanksGame } from './games/cyber-tanks/CyberTanksGame.js';
import { AstroBlasterGame } from './games/astro-blaster/AstroBlasterGame.js';
import { NeonOverdriveGame } from './games/neon-overdrive/NeonOverdriveGame.js';
import { CyberRunnerGame } from './games/cyber-runner/CyberRunnerGame.js';


// Vercel Web Analytics: cookieless visitor and page-view counts (only reports on the deployed site)
inject();

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
