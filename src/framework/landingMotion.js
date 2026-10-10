import { animate, scroll, inView, stagger, motionValue } from 'motion';

/**
 * Landing page motion, built on Motion (the Framer Motion engine, without React):
 * a staggered hero intro, scroll-linked parallax and progress, section reveals,
 * a drifting marquee, and springy 3D tilt cards.
 *
 * Everything is skipped when the visitor prefers reduced motion.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const SPRING = { type: 'spring', stiffness: 170, damping: 13 };
const SOFT = { type: 'spring', stiffness: 120, damping: 14 };

let landing = null;
let stops = [];

// Wrap each word so it can slide up out of a mask. Keeps <em> and <br> intact.
function splitWords(el) {
  if (!el || el.dataset.split) return;
  el.dataset.split = '1';
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
          const outer = document.createElement('span');
          outer.className = 'w';
          const inner = document.createElement('span');
          inner.className = 'wi';
          inner.textContent = part;
          outer.appendChild(inner);
          frag.appendChild(outer);
        });
        n.replaceWith(frag);
      } else if (n.nodeName !== 'BR') {
        walk(n);
      }
    });
  };
  walk(el);
}

/** One-time setup of everything that isn't rebuilt when the cards re-render. */
export function initLandingMotion() {
  landing = document.getElementById('landing-page');
  if (!landing) return;
  splitWords(document.getElementById('lp-title'));

  const nav = document.getElementById('lp-nav');
  landing.addEventListener(
    'scroll',
    () => nav?.classList.toggle('scrolled', landing.scrollTop > 8),
    { passive: true }
  );

  if (reduced) return;
  landing.classList.add('lp-motion');

  // Scroll progress bar
  const bar = document.getElementById('lp-progress-bar');
  scroll(p => bar && (bar.style.transform = `scaleX(${p})`), { container: landing });

  // Hero copy drifts up and fades as you leave it
  const hero = document.getElementById('lp-top');
  const copy = document.getElementById('lp-hero-copy');
  if (hero && copy) {
    scroll(animate(copy, { opacity: [1, 0], y: [0, -70], scale: [1, 0.97] }, { ease: 'linear' }), {
      container: landing,
      target: hero,
      offset: ['start start', 'end start']
    });
  }

  // Section headings, the contribute block and the stats rise into place
  landing.querySelectorAll('[data-reveal]').forEach(el => {
    inView(
      el,
      () => {
        animate(el, { opacity: [0, 1], y: [50, 0], rotateX: [-14, 0] }, SOFT);
      },
      { root: landing, amount: 0.25 }
    );
  });

  const stats = document.querySelectorAll('#lp-stats > div');
  inView(
    '#lp-stats',
    () => {
      animate(stats, { opacity: [0, 1], y: [30, 0], scale: [0.94, 1] }, { ...SPRING, delay: stagger(0.08) });
    },
    { root: landing, amount: 0.4 }
  );

  // Feature tiles: reveal in a wave, then tilt on hover
  const features = [...landing.querySelectorAll('.lp-feature')];
  inView(
    '.lp-features',
    () => {
      animate(features, { opacity: [0, 1], y: [60, 0], rotateX: [-18, 0] }, { ...SOFT, delay: stagger(0.1) });
    },
    { root: landing, amount: 0.25 }
  );
  features.forEach(f => bindTilt(f, f.querySelector('.lp-feature-in'), 8));

  // The marquee drifts sideways as the page scrolls
  const track = document.getElementById('lp-marquee-track');
  if (track) {
    scroll(
      () => {
        const half = track.scrollWidth / 2 || 1;
        track.style.transform = `translate3d(${-((landing.scrollTop * 0.45) % half)}px,0,0)`;
      },
      { container: landing }
    );
  }
}

/** The hero's staggered entrance. Safe to call again each time the landing page is shown. */
export function playLandingIntro() {
  if (reduced || !landing) return;
  const copy = document.getElementById('lp-hero-copy');
  if (!copy) return;
  const words = copy.querySelectorAll('.wi');
  const rest = copy.querySelectorAll('.lp-eyebrow, .lp-lead, .lp-cta');
  animate(copy, { opacity: 1, y: 0, scale: 1 }, { duration: 0 });
  animate(words, { y: ['110%', '0%'], rotate: [6, 0] }, { type: 'spring', stiffness: 230, damping: 11, delay: stagger(0.07, { startDelay: 0.15 }) });
  animate(rest, { opacity: [0, 1], y: [24, 0] }, { ...SOFT, delay: stagger(0.12, { startDelay: 0.55 }) });
  animate('.lp-scrollcue', { opacity: [0, 1] }, { duration: 0.8, delay: 1.4 });
}

/** (Re)builds the motion for the game cards and the marquee after they are rendered. */
export function bindGameCards(grid, names = []) {
  stops.forEach(stop => stop());
  stops = [];

  const track = document.getElementById('lp-marquee-track');
  if (track && names.length) {
    const row = names.map(n => `<span>${n}</span><b>✦</b>`).join('');
    track.innerHTML = row + row + row + row; // wide enough that the loop never shows a seam
  }

  const cards = [...grid.querySelectorAll('.landing-card')];
  cards.forEach(card => bindTilt(card, card.querySelector('.card-tilt'), 9));
  if (reduced || !landing) return;

  const cols = Math.max(1, Math.round(grid.clientWidth / (cards[0]?.offsetWidth || 300)));
  cards.forEach((card, i) => {
    card.style.opacity = 0;
    const stop = inView(
      card,
      () => {
        animate(
          card,
          { opacity: [0, 1], y: [80, 0], rotateX: [-22, 0], scale: [0.92, 1] },
          { ...SOFT, delay: (i % cols) * 0.09 }
        );
      },
      { root: landing, amount: 0.15 }
    );
    stops.push(stop);
  });
}

// Spring-driven 3D tilt: the surface leans toward the pointer and lifts, and a sheen follows it.
function bindTilt(host, surface, maxDeg) {
  if (!surface || reduced || !canHover) return;
  const rx = motionValue(0);
  const ry = motionValue(0);
  const lift = motionValue(0);
  const apply = () => {
    surface.style.transform = `perspective(1100px) rotateX(${rx.get()}deg) rotateY(${ry.get()}deg) translateZ(${lift.get()}px)`;
  };
  [rx, ry, lift].forEach(v => v.on('change', apply));

  host.addEventListener('pointerenter', () => animate(lift, 26, SPRING));
  host.addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    animate(ry, (x - 0.5) * 2 * maxDeg, SPRING);
    animate(rx, -(y - 0.5) * 2 * maxDeg, SPRING);
    surface.style.setProperty('--mx', `${x * 100}%`);
    surface.style.setProperty('--my', `${y * 100}%`);
  });
  host.addEventListener('pointerleave', () => {
    animate(rx, 0, SPRING);
    animate(ry, 0, SPRING);
    animate(lift, 0, SPRING);
  });
}
