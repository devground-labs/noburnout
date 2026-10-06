/**
 * UIManager - High-tech cyberpunk arcade shell, landing page, and overlay manager.
 */
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

    // Selected game mode state per game ID
    this.selectedModes = {
      'cyber-tanks': '1P (vs AI)',
      'astro-blaster': 'Standard'
    };

    this._bindShellEvents();
  }

  _bindShellEvents() {
    // Return to Lobby / Landing Page
    document.getElementById('btn-return-lobby')?.addEventListener('click', () => {
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
      const text = enabled ? '🔊' : '🔇';
      if (this.soundBtn) this.soundBtn.textContent = text;
      if (this.landingSoundBtn) this.landingSoundBtn.textContent = text;
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
    container.innerHTML = games.map(g => {
      const currentSelectedMode = this.selectedModes[g.id] || g.modes[0];
      const isTank = g.id === 'cyber-tanks';
      const glowColor = isTank ? '#38bdf8' : '#a855f7';
      const themeGradient = isTank 
        ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(2, 132, 199, 0.05))'
        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(217, 70, 239, 0.05))';

      return `
        <div class="landing-card" data-game="${g.id}" style="--card-glow: ${glowColor};">
          <div class="card-hero-banner" style="background: ${themeGradient};">
            <div class="card-icon-wrap">
              <span class="card-large-icon">${g.icon}</span>
            </div>
            <div class="card-badge-row">
              <span class="card-badge">${g.badge}</span>
              <span class="card-badge meta">👥 ${g.players}</span>
            </div>
          </div>

          <div class="card-body">
            <h2 class="card-title">${g.name}</h2>
            <h4 class="card-subtitle">${g.subtitle}</h4>
            <p class="card-desc">${g.description}</p>

            <!-- Mode Selection Radio Buttons -->
            <div class="card-mode-selector">
              <span class="mode-label">SELECT MODE:</span>
              <div class="mode-options" id="modes-${g.id}">
                ${g.modes.map(mode => `
                  <button type="button" class="mode-chip ${mode === currentSelectedMode ? 'active' : ''}" data-game="${g.id}" data-mode="${mode}">
                    ${mode === 'Practice' ? '🎯' : mode.includes('2P') ? '👥' : '⚡'} ${mode}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="card-actions">
              <button class="launch-card-btn ${isTank ? 'cyan-btn' : 'purple-btn'}" data-game="${g.id}">
                <span>PLAY NOW</span>
                <span class="btn-arrow">➔</span>
              </button>
            </div>
          </div>
        </div>
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
            <span class="game-icon">${g.icon}</span>
            <span class="game-badge">${g.badge}</span>
          </div>
          <h3 class="game-card-title">${g.name}</h3>
          <p class="game-card-sub">${g.subtitle}</p>
          <p class="game-card-desc">${g.description}</p>
          <div class="game-card-meta">
            <span>👥 ${g.players}</span>
            <span>🕹️ ${g.genre}</span>
          </div>
          <div class="game-card-actions">
            ${g.modes.map(mode => `
              <button class="action-btn launch-mode-btn" data-id="${g.id}" data-mode="${mode}">
                ${mode === 'Practice' ? '🎯' : '⚡'} ${mode}
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
