/**
 * UIManager - High-tech cyberpunk arcade shell, landing page, and overlay manager.
 */
// Per-game accent colour + line icon for the landing page cards.
const GAME_THEMES = {
  'cyber-tanks': {
    accent: '#38bdf8',
    icon: '<svg viewBox="0 0 32 32"><rect x="5" y="17" width="22" height="8" rx="4"/><path d="M10 17v-3h10v3M20 15.5h8"/><circle cx="10" cy="21" r="1"/><circle cx="16" cy="21" r="1"/><circle cx="22" cy="21" r="1"/></svg>'
  },
  'astro-blaster': {
    accent: '#a78bfa',
    icon: '<svg viewBox="0 0 32 32"><path d="M16 3c4 3 6 8 6 13v6h-12v-6c0-5 2-10 6-13z"/><circle cx="16" cy="13" r="2.2"/><path d="M10 19l-4 5 4-1M22 19l4 5-4-1M14 25l2 4 2-4"/></svg>'
  },
  'overdrive': {
    accent: '#f472b6',
    icon: '<svg viewBox="0 0 32 32"><path d="M5 20l2-6c.4-1.2 1.4-2 2.7-2h12.6c1.3 0 2.3.8 2.7 2l2 6v4H5z"/><circle cx="10" cy="24" r="2.2"/><circle cx="22" cy="24" r="2.2"/><path d="M9 17h14"/></svg>'
  },
  'cyber-runner': {
    accent: '#34d399',
    icon: '<svg viewBox="0 0 32 32"><circle cx="19" cy="6" r="2.4"/><path d="M15 12l4-1.5 3 4 4 1M15 12l-3 5 5 3-1 7M17 20l4 2.5 1.5 4.5M12 17l-5 1.5"/></svg>'
  },
  'pinball': {
    accent: '#e11d48',
    icon: '<svg viewBox="0 0 32 32"><circle cx="16" cy="9" r="3.2"/><circle cx="9" cy="14" r="2.2"/><circle cx="23" cy="14" r="2.2"/><path d="M6 25l7 2.5M26 25l-7 2.5M5 5v18M27 5v18"/></svg>'
  },
  'maze-paint': {
    accent: '#fb923c',
    icon: '<svg viewBox="0 0 32 32"><rect x="5" y="5" width="9" height="9" rx="2"/><rect x="18" y="5" width="9" height="9" rx="2"/><rect x="5" y="18" width="9" height="9" rx="2"/><path d="M14 9.5h4M9.5 14v4M22.5 14v8M14 22.5h4"/></svg>'
  },
  default: {
    accent: '#38bdf8',
    icon: '<svg viewBox="0 0 32 32"><rect x="4" y="10" width="24" height="13" rx="6"/><path d="M10 14v5M7.5 16.5h5M21 15.5h.01M24 18.5h.01"/></svg>'
  }
};

export class UIManager {
  constructor(engine) {
    this.engine = engine;
    this.landingPage = document.getElementById('landing-page');
    this.navbar = document.getElementById('arcade-navbar');
    this.hudContainer = document.getElementById('game-hud');
    this.gamesModal = document.getElementById('modal-games');
    this.helpModal = document.getElementById('modal-help');
    this.toastContainer = document.getElementById('toast-container');
    this.fpsEl = document.getElementById('hud-fps');
    this.titleEl = document.getElementById('current-game-title');
    this.badgeEl = document.getElementById('current-game-badge');
    this.soundBtn = document.getElementById('btn-sound-toggle');
    this.landingSoundBtn = document.getElementById('landing-sound-toggle');

    this.selectedModes = {
      'cyber-tanks': '1P (vs AI)',
      'astro-blaster': 'Standard',
      'cyber-runner': '1 Player',
      'pinball': 'Classic'
    };

    this._bindShellEvents();
  }

  _bindShellEvents() {
    // Return to Lobby / Landing Page
    document.getElementById('btn-return-lobby')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.engine.returnToLobby();
    });

    document.getElementById('nav-brand-home')?.addEventListener('click', () => {
      this.engine.returnToLobby();
    });

    // Open Games Modal
    document.getElementById('btn-open-games')?.addEventListener('click', () => {
      this.openGamesModal();
    });

    // Close Games Modal
    document.getElementById('btn-close-games')?.addEventListener('click', () => {
      this.closeGamesModal();
    });

    // Open Help Modal
    document.getElementById('btn-open-help')?.addEventListener('click', () => {
      this.openHelpModal();
    });

    // Close Help Modal
    document.getElementById('btn-close-help')?.addEventListener('click', () => {
      this.closeHelpModal();
    });

    // Sound Toggles
    const toggleSoundHandler = () => {
      const enabled = this.engine.audio.toggleSound();
      this.soundBtn?.classList.toggle('is-muted', !enabled);
      this.landingSoundBtn?.classList.toggle('is-muted', !enabled);
      this.toast('AUDIO', enabled ? 'Sound Enabled' : 'Sound Muted', enabled ? '#38bdf8' : '#ef4444');
    };

    this.soundBtn?.addEventListener('click', toggleSoundHandler);
    this.landingSoundBtn?.addEventListener('click', toggleSoundHandler);

    // Fullscreen Toggles
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.engine.toggleFullscreen();
    });
    document.getElementById('landing-fullscreen')?.addEventListener('click', () => {
      this.engine.toggleFullscreen();
    });

    // Landing page smooth-scroll links
    document.querySelectorAll('#landing-page [data-scroll]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(el.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Close modals on escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeGamesModal();
        this.closeHelpModal();
      }
    });
  }

  showLandingPage() {
    if (this.landingPage) {
      this.landingPage.style.display = 'flex';
      this.landingPage.classList.add('visible');
    }
    if (this.navbar) {
      this.navbar.style.display = 'none';
    }
    if (this.hudContainer) {
      this.hudContainer.innerHTML = '';
    }
    this.renderLandingGames();
  }

  hideLandingPage() {
    if (this.landingPage) {
      this.landingPage.classList.remove('visible');
      this.landingPage.style.display = 'none';
    }
    if (this.navbar) {
      this.navbar.style.display = 'flex';
    }
  }

  renderLandingGames() {
    const container = document.getElementById('landing-games-grid');
    if (!container) return;

    const games = this.engine.registry.getAll();
    const countEl = document.getElementById('lp-game-count');
    if (countEl) countEl.textContent = games.length;

    container.innerHTML = games.map(g => {
      const currentSelectedMode = this.selectedModes[g.id] || g.modes[0];
      const theme = GAME_THEMES[g.id] || GAME_THEMES.default;

      return `
        <article class="landing-card" data-game="${g.id}" style="--card-glow: ${theme.accent};">
          <div class="card-hero-banner">
            <div class="card-icon-wrap" aria-hidden="true">${theme.icon}</div>
            <div class="card-badge-row">
              <span class="card-badge">${g.badge}</span>
              <span class="card-badge meta">${g.players}</span>
            </div>
          </div>

          <div class="card-body">
            <h3 class="card-title">${g.name}</h3>
            <h4 class="card-subtitle">${g.subtitle}</h4>
            <p class="card-desc">${g.description}</p>

            <div class="card-mode-selector">
              <span class="mode-label">Mode</span>
              <div class="mode-options" id="modes-${g.id}" role="group" aria-label="Game mode">
                ${g.modes.map(mode => `
                  <button type="button" class="mode-chip ${mode === currentSelectedMode ? 'active' : ''}" data-game="${g.id}" data-mode="${mode}">${mode}</button>
                `).join('')}
              </div>
            </div>

            <div class="card-actions">
              <button class="launch-card-btn" data-game="${g.id}">
                <span>Play now</span>
                <svg class="btn-arrow" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10h12m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Mode chips click handler
    container.querySelectorAll('.mode-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const gameId = chip.getAttribute('data-game');
        const mode = chip.getAttribute('data-mode');
        this.selectedModes[gameId] = mode;

        // Update active class within that game's options
        const parent = document.getElementById(`modes-${gameId}`);
        if (parent) {
          parent.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
      });
    });

    // Launch game button click handler
    container.querySelectorAll('.launch-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const gameId = btn.getAttribute('data-game');
        const mode = this.selectedModes[gameId] || '1P (vs AI)';
        this.engine.loadGame(gameId, mode);
        this.toast('LAUNCHING', `${gameId.toUpperCase()} (${mode})`, '#10b981');
      });
    });
  }

  openGamesModal() {
    if (!this.gamesModal) return;
    this.renderGameCards();
    this.gamesModal.classList.add('active');
  }

  closeGamesModal() {
    if (!this.gamesModal) return;
    this.gamesModal.classList.remove('active');
  }

  openHelpModal() {
    if (!this.helpModal) return;
    const game = this.engine.currentGame;
    const guide = game ? game.getControlsGuide() : [
      { label: 'Return to Lobby', keys: '🏠 Lobby Button' },
      { label: 'Switch Games', keys: 'ESC or Games Button' },
      { label: 'Fullscreen', keys: 'F or ⛶ Button' }
    ];
    const container = document.getElementById('help-controls-list');
    if (container) {
      container.innerHTML = guide.map(item => `
        <div class="control-row">
          <span class="control-label">${item.label}</span>
          <span class="control-keys">${item.keys}</span>
        </div>
      `).join('');
    }
    this.helpModal.classList.add('active');
  }

  closeHelpModal() {
    if (!this.helpModal) return;
    this.helpModal.classList.remove('active');
  }

  renderGameCards() {
    const listEl = document.getElementById('games-list-grid');
    if (!listEl) return;

    const games = this.engine.registry.getAll();
    listEl.innerHTML = games.map(g => {
      const isCurrent = this.engine.currentGame?.id === g.id;
      return `
        <div class="game-card ${isCurrent ? 'selected' : ''}" data-id="${g.id}">
          <div class="game-card-header">
            <span class="game-icon">${(GAME_THEMES[g.id] || GAME_THEMES.default).icon}</span>
            <span class="game-badge">${g.badge}</span>
          </div>
          <h3 class="game-card-title">${g.name}</h3>
          <p class="game-card-sub">${g.subtitle}</p>
          <p class="game-card-desc">${g.description}</p>
          <div class="game-card-meta">
            <span>${g.players}</span>
            <span>${g.genre}</span>
          </div>
          <div class="game-card-actions">
            ${g.modes.map(mode => `
              <button class="action-btn launch-mode-btn" data-id="${g.id}" data-mode="${mode}">
                ${mode}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners
    listEl.querySelectorAll('.launch-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const mode = btn.getAttribute('data-mode');
        this.engine.loadGame(id, mode);
        this.closeGamesModal();
        this.toast('LAUNCHING GAME', `${id.toUpperCase()} (${mode})`, '#10b981');
      });
    });
  }

  setGameHUD(html) {
    if (this.hudContainer) {
      this.hudContainer.innerHTML = html;
    }
  }

  updateActiveGameInfo(entry) {
    if (this.titleEl) this.titleEl.textContent = entry.name;
    if (this.badgeEl) this.badgeEl.textContent = entry.badge;

    // Prefill the game (and mode) on the GitHub bug-report form
    const report = document.getElementById('btn-report-issue');
    if (report) {
      const params = new URLSearchParams({ template: 'bug_report.yml', game: entry.name });
      report.href = `https://github.com/devground-labs/noburnout/issues/new?${params}`;
    }
  }

  updateFPS(fps) {
    if (this.fpsEl) this.fpsEl.textContent = `${fps} FPS`;
  }

  toast(title, message, color = '#38bdf8') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'arcade-toast';
    toast.style.borderColor = color;
    toast.innerHTML = `
      <div style="font-weight: 800; font-size: 0.75rem; letter-spacing: 0.1em; color: ${color};">${title}</div>
      <div style="font-size: 0.85rem; color: #f1f5f9; margin-top: 2px;">${message}</div>
    `;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
}
