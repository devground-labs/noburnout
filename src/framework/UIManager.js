/**
 * UIManager - High-tech cyberpunk arcade shell and overlay manager.
 */
export class UIManager {
  constructor(engine) {
    this.engine = engine;
    this.hudContainer = document.getElementById('game-hud');
    this.gamesModal = document.getElementById('modal-games');
    this.helpModal = document.getElementById('modal-help');
    this.toastContainer = document.getElementById('toast-container');
    this.fpsEl = document.getElementById('hud-fps');
    this.titleEl = document.getElementById('current-game-title');
    this.badgeEl = document.getElementById('current-game-badge');
    this.soundBtn = document.getElementById('btn-sound-toggle');

    this._bindShellEvents();
  }

  _bindShellEvents() {
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

    // Sound Toggle
    this.soundBtn?.addEventListener('click', () => {
      const enabled = this.engine.audio.toggleSound();
      this.soundBtn.textContent = enabled ? '🔊' : '🔇';
      this.toast('AUDIO', enabled ? 'Sound Enabled' : 'Sound Muted', enabled ? '#38bdf8' : '#ef4444');
    });

    // Fullscreen Toggle
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
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
    const guide = game ? game.getControlsGuide() : [];
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
      btn.addEventListener('click', (e) => {
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
