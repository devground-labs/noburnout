/**
 * Account - optional Google sign-in and the leaderboards.
 *
 * The games work fine without it. A signed-in player can put their best scores on the boards.
 * Scores earned before signing in are kept in localStorage (best per board) and sent once the
 * player signs in and has a nickname. Everything talks to our own /api, so the strict CSP is unchanged.
 */

// One entry per leaderboard. `asc` boards rank lower values first (times, in milliseconds).
export const BOARDS = {
  'pinball/Classic': { game: 'Pinball', mode: 'Classic', asc: false, fmt: 'num' },
  'cyber-runner/1 Player': { game: 'Cyber-Runner', mode: '1 Player', asc: false, fmt: 'num' },
  'overdrive/Endless': { game: 'Overdrive', mode: 'Endless', asc: false, fmt: 'num' },
  'overdrive/Rush Race': { game: 'Overdrive', mode: 'Rush Race', asc: true, fmt: 'time' },
  'bit-merge/Classic': { game: 'Bit Merge', mode: 'Classic', asc: false, fmt: 'num' },
  'bit-merge/Roomy': { game: 'Bit Merge', mode: 'Roomy', asc: false, fmt: 'num' }
};

export function formatScore(value, fmt) {
  if (fmt === 'time') {
    const m = Math.floor(value / 60000);
    return `${m}:${((value % 60000) / 1000).toFixed(1).padStart(4, '0')}`;
  }
  return value.toLocaleString();
}

export function boardsForGame(gameId) {
  return Object.keys(BOARDS).filter(k => k.startsWith(`${gameId}/`));
}

const PENDING_KEY = 'nb_pending_scores';

function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function writePending(p) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // Pending scores are a convenience; losing them is fine.
  }
}

export class Account {
  constructor() {
    this.me = { loaded: false, signedIn: false, configured: false, nickname: '', needsNickname: false };
    this.notice = null; // set when we come back from the Google redirect
    this.ui = null; // the UIManager, for toasts (set by main.js)
    this.listeners = new Set();
    this._nudged = false;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.listeners.forEach(fn => fn(this.me));
  }

  get signedIn() {
    return this.me.signedIn;
  }

  /** Reads the session and the sign-in redirect result. Never throws: the site works without the API. */
  async load() {
    const params = new URLSearchParams(location.search);
    if (params.has('signin') || params.has('auth')) {
      this.notice = params.get('auth') || 'signin';
      params.delete('signin');
      params.delete('auth');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) this.me = { ...(await res.json()), loaded: true };
    } catch {
      // API unavailable (for example the plain static dev server): leave sign-in off
    }
    this.me.loaded = true;
    this.emit();
    if (this.me.signedIn && !this.me.needsNickname) this.flushPending();
  }

  signIn() {
    location.href = `/api/auth/google?return=${encodeURIComponent(location.pathname)}`;
  }

  async post(path, body = {}) {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      // empty body
    }
    return { ok: res.ok, status: res.status, data };
  }

  async signOut() {
    await this.post('/api/auth/logout');
    this.me = { ...this.me, signedIn: false, nickname: '', needsNickname: false };
    this.emit();
  }

  async setNickname(nickname) {
    const r = await this.post('/api/me/nickname', { nickname });
    if (r.ok) {
      this.me = { ...this.me, nickname: r.data.nickname, needsNickname: false };
      this.emit();
      this.flushPending();
    }
    return r;
  }

  async deleteAccount() {
    const r = await this.post('/api/me/delete');
    if (r.ok) {
      this.me = { ...this.me, signedIn: false, nickname: '', needsNickname: false };
      writePending({});
      this.emit();
    }
    return r;
  }

  async leaderboard(board) {
    const res = await fetch(`/api/leaderboard?board=${encodeURIComponent(board)}&limit=25`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('leaderboard unavailable');
    return res.json();
  }

  // ---- scores --------------------------------------------------------------
  queue(board, value) {
    const cfg = BOARDS[board];
    if (!cfg) return;
    const p = readPending();
    const cur = p[board];
    if (cur === undefined || (cfg.asc ? value < cur : value > cur)) p[board] = value;
    writePending(p);
  }

  async flushPending() {
    const p = readPending();
    for (const [board, value] of Object.entries(p)) {
      const r = await this.post('/api/scores', { board, value });
      // Keep it only if we should try again later (offline / server trouble); a rejection is final.
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429 && r.status !== 409)) delete p[board];
    }
    writePending(p);
  }

  /** Called by the games at the end of a run. Shows a toast with the outcome. */
  async report(board, value) {
    const cfg = BOARDS[board];
    if (!cfg || !this.me.loaded || !this.me.configured || !Number.isFinite(value) || value <= 0) return;
    const name = `${cfg.game}${cfg.mode ? ` · ${cfg.mode}` : ''}`;

    if (!this.me.signedIn || this.me.needsNickname) {
      this.queue(board, Math.round(value));
      if (!this._nudged) {
        this._nudged = true;
        this.ui?.toast('LEADERBOARD', this.me.signedIn ? 'Choose a nickname to put this score on the board' : 'Sign in to put this score on the leaderboard', '#ffd23f');
        if (this.me.signedIn) this.onNeedNickname?.();
      }
      return;
    }
    try {
      const r = await this.post('/api/scores', { board, value: Math.round(value) });
      if (!r.ok) return;
      const rank = r.data.rank ? `#${r.data.rank}` : '';
      this.ui?.toast(
        'LEADERBOARD',
        r.data.improved ? `New best! You're ${rank} on ${name}` : `Your best on ${name} is ${rank}`,
        r.data.improved ? '#5ee0a0' : '#38bdf8'
      );
    } catch {
      this.queue(board, Math.round(value)); // offline: try again next time
    }
  }
}
