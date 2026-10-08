// Shows the live visitor count on the landing page.
//
// The backend (api/visitors.go) counts each anonymous visitor once per day.
// We remember today's date in localStorage so returning tabs just read the
// number instead of POSTing again. Everything here fails quietly: if the API is
// missing (local dev without the Go server) or blocked, the tile keeps showing
// its default content.

const STORAGE_KEY = 'noburnout:counted-on';
const ENDPOINT = '/api/visitors';

const today = () => new Date().toISOString().slice(0, 10);

function alreadyCountedToday() {
  try {
    return localStorage.getItem(STORAGE_KEY) === today();
  } catch {
    return false;
  }
}

function rememberCounted() {
  try {
    localStorage.setItem(STORAGE_KEY, today());
  } catch {
    /* storage unavailable (private mode): the server still dedupes */
  }
}

async function fetchCount() {
  const counted = alreadyCountedToday();
  const res = await fetch(ENDPOINT, {
    method: counted ? 'GET' : 'POST',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`visitors ${res.status}`);
  const data = await res.json();
  if (!counted) rememberCounted();
  if (!Number.isFinite(data.count)) throw new Error('bad payload');
  return data.count;
}

/** Fetches the count and fills the landing-page stat tile. */
export async function showVisitorCount() {
  const tile = document.getElementById('lp-visitors');
  if (!tile) return;
  try {
    const count = await fetchCount();
    tile.querySelector('dt').textContent = new Intl.NumberFormat('en').format(count);
    tile.querySelector('dd').textContent = count === 1 ? 'Visitor' : 'Visitors';
    tile.classList.add('is-live');
  } catch {
    /* leave the default tile in place */
  }
}
