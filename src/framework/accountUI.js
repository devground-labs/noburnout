import { BOARDS, boardsForGame, formatScore } from './account.js';

/**
 * Wires the sign-in, nickname and leaderboard UI: the nav buttons on the landing page and in
 * games, the Leaderboards modal and the Account modal. All player-supplied text (nicknames) is
 * written with textContent, never as HTML.
 */

const G_LOGO =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.3h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7.1l3.8 3C6.5 6.8 9 4.8 12 4.8z"/></svg>';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function initAccountUI({ engine, account, ui }) {
  const $ = id => document.getElementById(id);
  const boardModal = $('modal-board');
  const accountModal = $('modal-account');
  let boardKey = Object.keys(BOARDS)[0];
  let boardToken = 0; // ignore a slow response if the player already switched tabs

  const open = m => m.classList.add('active');
  const close = m => m.classList.remove('active');

  // ---- nav buttons ------------------------------------------------------
  const syncNav = me => {
    const label = me.signedIn ? me.nickname || 'Choose name' : 'Sign in';
    const show = me.configured;
    ['lp-account-btn', 'btn-account'].forEach(id => ($(id).hidden = !show));
    $('lp-account-label').textContent = label;
    $('lp-account-btn').title = me.signedIn ? 'Your account' : 'Sign in with Google';
    $('btn-account').title = me.signedIn ? `Signed in as ${me.nickname || '...'}` : 'Sign in with Google';
  };
  account.onChange(syncNav);

  // ---- leaderboard ------------------------------------------------------
  function currentGameBoards() {
    const id = engine.currentGame?.id;
    return id ? boardsForGame(id) : [];
  }

  function openBoard(preferred) {
    const mine = currentGameBoards();
    const wantMode = engine.currentGame?.currentMode;
    boardKey =
      preferred ||
      mine.find(k => BOARDS[k].mode === wantMode) ||
      mine[0] ||
      boardKey;
    renderTabs();
    open(boardModal);
    loadBoard();
  }

  function renderTabs() {
    const tabs = $('lb-tabs');
    tabs.textContent = '';
    for (const key of Object.keys(BOARDS)) {
      const b = BOARDS[key];
      const t = el('button', 'lb-tab' + (key === boardKey ? ' active' : ''), `${b.game} · ${b.mode}`);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.addEventListener('click', () => {
        boardKey = key;
        renderTabs();
        loadBoard();
      });
      tabs.appendChild(t);
    }
    tabs.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  async function loadBoard() {
    const token = ++boardToken;
    const list = $('lb-list');
    const me = $('lb-me');
    const foot = $('lb-foot');
    const cfg = BOARDS[boardKey];
    list.textContent = '';
    me.textContent = '';
    list.appendChild(el('li', 'lb-empty', 'Loading...'));
    foot.textContent = cfg.asc ? 'Fastest times first.' : 'Highest scores first.';
    try {
      const data = await account.leaderboard(boardKey);
      if (token !== boardToken) return;
      list.textContent = '';
      if (!data.entries.length) {
        list.appendChild(el('li', 'lb-empty', 'No scores yet. Be the first!'));
      }
      for (const e of data.entries) {
        const li = el('li', 'lb-row' + (e.you ? ' you' : ''));
        li.appendChild(el('span', 'lb-rank', e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : String(e.rank)));
        li.appendChild(el('span', 'lb-name', e.nickname + (e.you ? ' (you)' : '')));
        li.appendChild(el('span', 'lb-score', formatScore(e.score, cfg.fmt)));
        list.appendChild(li);
      }
      if (data.me && !data.entries.some(e => e.you)) {
        me.appendChild(el('span', null, `Your best: #${data.me.rank} · ${formatScore(data.me.score, cfg.fmt)}`));
      } else if (!account.signedIn && account.me.configured) {
        const row = el('div', 'lb-cta');
        row.appendChild(el('span', null, 'Sign in to put your score here.'));
        const b = el('button', 'mp-btn primary', 'Sign in');
        b.type = 'button';
        b.addEventListener('click', () => {
          close(boardModal);
          openAccount();
        });
        row.appendChild(b);
        me.appendChild(row);
      }
      foot.textContent += ' Scores are submitted by the browser and are not verified.';
    } catch {
      if (token !== boardToken) return;
      list.textContent = '';
      list.appendChild(el('li', 'lb-empty', 'The leaderboard is unavailable right now.'));
    }
  }

  // ---- account ----------------------------------------------------------
  function openAccount() {
    renderAccount();
    open(accountModal);
  }

  function renderAccount(message) {
    const body = $('account-body');
    const me = account.me;
    body.textContent = '';
    if (message) body.appendChild(el('p', 'acct-msg', message));

    if (!me.signedIn) {
      $('account-title').textContent = 'Sign in';
      $('account-sub').textContent = 'Optional. Sign in to put your best scores on the leaderboards.';
      const g = el('button', 'g-btn');
      g.type = 'button';
      g.innerHTML = `${G_LOGO}<span>Continue with Google</span>`;
      g.addEventListener('click', () => account.signIn());
      body.appendChild(g);
      body.appendChild(
        el(
          'p',
          'acct-fine',
          'We keep an anonymous ID made from your Google account and the nickname you choose. No email, name or photo is stored. You can delete it any time.'
        )
      );
      return;
    }

    $('account-title').textContent = me.needsNickname ? 'Pick a nickname' : 'Your account';
    $('account-sub').textContent = me.needsNickname
      ? 'This is the name shown on the leaderboards.'
      : `Signed in as ${me.nickname}`;
    const form = el('form', 'acct-form');
    const input = el('input', 'acct-input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'Nickname (3 to 16 characters)';
    input.value = me.nickname || '';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Nickname');
    const save = el('button', 'mp-btn primary', me.needsNickname ? 'Save nickname' : 'Change nickname');
    save.type = 'submit';
    const err = el('p', 'acct-err');
    form.append(input, save, err);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      save.disabled = true;
      const r = await account.setNickname(input.value);
      save.disabled = false;
      if (r.ok) {
        ui?.toast('NICKNAME', `You are ${r.data.nickname} on the leaderboards`, '#5ee0a0');
        renderAccount('Saved.');
      } else {
        err.textContent = r.data?.error || 'Could not save that nickname.';
      }
    });
    body.appendChild(form);

    const actions = el('div', 'acct-actions');
    const out = el('button', 'mp-btn', 'Sign out');
    out.type = 'button';
    out.addEventListener('click', async () => {
      await account.signOut();
      renderAccount();
    });
    const del = el('button', 'mp-btn danger', 'Delete my data');
    del.type = 'button';
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        del.textContent = 'Tap again to delete everything';
        setTimeout(() => {
          armed = false;
          del.textContent = 'Delete my data';
        }, 4000);
        return;
      }
      await account.deleteAccount();
      renderAccount('Your account and scores were deleted.');
    });
    actions.append(out, del);
    body.appendChild(actions);
    body.appendChild(el('p', 'acct-fine', 'Deleting removes your nickname and every leaderboard entry. Your local progress stays on this device.'));
    if (me.needsNickname) setTimeout(() => input.focus(), 50);
  }

  account.onNeedNickname = openAccount;

  // ---- wiring -----------------------------------------------------------
  $('lp-board-btn').addEventListener('click', () => openBoard('pinball/Classic'));
  $('btn-open-board').addEventListener('click', () => openBoard());
  $('lp-account-btn').addEventListener('click', openAccount);
  $('btn-account').addEventListener('click', openAccount);
  $('btn-close-board').addEventListener('click', () => close(boardModal));
  $('btn-close-account').addEventListener('click', () => close(accountModal));
  [boardModal, accountModal].forEach(m => m.addEventListener('click', e => e.target === m && close(m)));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') [boardModal, accountModal].forEach(close);
  });

  // The in-game button only makes sense for games that have a board
  ui.onGameChange = entry => {
    $('btn-open-board').hidden = !boardsForGame(entry.id).length;
  };

  // ---- after the Google redirect ----------------------------------------
  return {
    afterLoad() {
      syncNav(account.me);
      const n = account.notice;
      if (!n) return;
      if (n === 'signin') {
        if (account.me.signedIn) {
          ui?.toast('SIGNED IN', account.me.needsNickname ? 'One more step: pick a nickname' : `Welcome back, ${account.me.nickname}`, '#5ee0a0');
          if (account.me.needsNickname) openAccount();
        }
      } else if (n === 'cancelled') {
        ui?.toast('SIGN IN', 'Sign-in was cancelled', '#38bdf8');
      } else {
        ui?.toast('SIGN IN', 'Sign-in is not available right now. Please try again later.', '#ef4444');
      }
    }
  };
}
