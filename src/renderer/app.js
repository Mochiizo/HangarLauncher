'use strict';
/* global api */
const $ = (sel) => document.querySelector(sel);

const state = { games: [], status: {}, week: null, updates: {}, running: new Set(), launching: {}, filter: 'all', source: 'all', sort: 'recent', query: '', selected: null };

// ---------- Formatage ----------
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const hours = (m) => nf.format(m / 60);
function duration(m) {
  if (m == null) return 'Durée inconnue';
  if (m <= 0) return '—';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h} h${r ? ' ' + String(r).padStart(2, '0') + ' min' : ''}` : `${r} min`;
}
function relative(ts) {
  if (!ts) return 'Jamais lancé';
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(new Date(ts))) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 14) return `Il y a ${days} jours`;
  if (days < 60) return `Il y a ${Math.round(days / 7)} semaines`;
  if (days < 365) return `Il y a ${Math.round(days / 30)} mois`;
  return new Date(ts).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}
const size = (b) => (b ? `${nf.format(b / 1e9)} Go` : '—');
const mono = (t) => t.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
function hue(key) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const svg = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const SOURCES = {
  steam: { name: 'Steam', long: 'Steam', chip: 'STEAM' },
  epic: { name: 'Epic', long: 'Epic Games', chip: 'EPIC' }
};
const ICONS = {
  update: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>',
  image: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  undo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>',
  install: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  star: (on) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`,
  clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};

// Visuel d'un jeu : essaie les images dans l'ordre, sinon dégradé + initiales
function art(game, order = ['cover', 'header']) {
  const h = hue(game.key);
  const box = el('span', { class: 'art', style: `--fallback: linear-gradient(155deg, hsl(${h} 45% 34%), hsl(${(h + 30) % 360} 50% 12%))` },
    el('span', { class: 'art-text' }, el('span', { class: 'mono' }, mono(game.title)), el('span', { class: 't' }, game.title)));
  const urls = [...new Set(order.flatMap((k) => [].concat(game.images?.[k] || [])).filter(Boolean))];
  if (urls.length) {
    const img = el('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    let i = 0;
    img.addEventListener('load', () => {
      // Le CDN Steam renvoie parfois une image minuscule au lieu d'une 404
      if (img.naturalWidth < 60) return img.dispatchEvent(new Event('error'));
      box.classList.add('has-img');
    });
    img.addEventListener('error', () => { i++; if (i < urls.length) img.src = urls[i]; else img.remove(); });
    img.src = urls[0];
    box.prepend(img);
  }
  return box;
}

// ---------- Données dérivées ----------
const byKey = () => new Map(state.games.map((g) => [g.key, g]));
function visibleGames() {
  const q = state.query.trim().toLocaleLowerCase('fr');
  const list = state.games.filter((g) =>
    (state.filter === 'all' || (state.filter === 'installed' && g.installed) || (state.filter === 'fav' && g.favorite)) &&
    (state.source === 'all' || g.source === state.source) &&
    (!q || g.title.toLocaleLowerCase('fr').includes(q)));
  const sorters = {
    recent: (a, b) => b.lastPlayed - a.lastPlayed || a.title.localeCompare(b.title, 'fr'),
    alpha: (a, b) => a.title.localeCompare(b.title, 'fr'),
    hours: (a, b) => b.minutes - a.minutes
  };
  return list.sort(sorters[state.sort]);
}
const selectedGame = () => state.games.find((g) => g.key === state.selected) || visibleGames()[0] || state.games[0];

function select(key) {
  if (state.selected === key) return;
  state.selected = key;
  render();
  const h = $('#hero');
  h.classList.remove('enter'); void h.offsetWidth; h.classList.add('enter');
}

// ---------- Rendu ----------
function pills(container, defs, current, onPick) {
  container.replaceChildren(...defs.map(([id, label]) =>
    el('button', { type: 'button', class: 'pill', 'aria-pressed': String(current === id), onclick: () => onPick(id) }, label)));
}

function renderSidebar(list) {
  pills($('#filters'), [['all', 'Tous'], ['installed', 'Installés'], ['fav', 'Favoris']], state.filter, (v) => { state.filter = v; render(); });
  const present = Object.entries(SOURCES).filter(([id]) => state.games.some((g) => g.source === id));
  const srcBox = $('#sources');
  srcBox.hidden = present.length < 2;
  if (!srcBox.hidden) pills(srcBox, [['all', 'Toutes plateformes'], ...present.map(([id, s]) => [id, s.name])], state.source, (v) => { state.source = v; render(); });

  const names = { all: 'Tous les jeux', installed: 'Jeux installés', fav: 'Favoris' };
  $('#list-title').textContent = `${names[state.filter]} (${list.length})`;
  $('#grid-title').textContent = names[state.filter];
  const sel = selectedGame();
  $('#game-list').replaceChildren(...(list.length ? list.map((g) => el('li', {},
    el('button', { type: 'button', class: 'row' + (g.installed ? '' : ' not-installed'), 'aria-current': String(g.key === sel?.key), onclick: () => select(g.key) },
      el('span', { class: 'thumb' }, art(g, ['header', 'cover'])),
      el('span', { class: 'name-wrap' }, el('span', { class: 'name' }, g.title), statusLine(g)),
      g.favorite ? svg(ICONS.star(true).replace('width="18" height="18"', 'width="13" height="13"').replace('currentColor', 'var(--accent)')) : null,
      el('span', { class: 'src' }, SOURCES[g.source]?.chip || 'JEU')))) : [el('li', { class: 'empty' }, 'Aucun jeu ne correspond.')]));
}

// ---------- Mises à jour ----------
const pct = (p) => `${Math.floor((p || 0) * 100)} %`;
function statusText(u) {
  if (!u) return null;
  if (u.state === 'updating') return u.phase === 'install' ? `Installation · ${pct(u.progress)}` : u.phase === 'validate' ? 'Vérification des fichiers' : `Mise à jour · ${pct(u.progress)}`;
  if (u.state === 'paused') return 'Mise à jour en pause';
  if (u.state === 'pending') return 'Mise à jour en attente';
  if (u.running) return 'En cours';
  return null;
}
function statusLine(g) {
  if (state.running.has(g.key)) return el('span', { class: 'status-line running' }, 'Lancé');
  if (state.launching[g.key]) return el('span', { class: 'status-line running' }, 'Lancement…');
  const t = statusText(state.updates[g.key]);
  return t ? el('span', { class: 'status-line ' + (state.updates[g.key].running && !state.updates[g.key].state ? 'running' : 'update') }, t) : null;
}

function updateBlock(g, u) {
  const label = u.state === 'updating' ? (u.phase === 'install' ? 'Installation en cours' : 'Mise à jour en cours')
    : u.state === 'paused' ? 'Mise à jour en pause' : 'Mise à jour en attente';
  return el('div', { class: 'update-info' },
    el('span', { class: 'k' }, label),
    el('span', { class: 'v' }, `Progression : ${pct(u.progress)}`),
    el('span', { class: 'bar' }, el('span', { style: `width: ${pct(u.progress).replace(' ', '')}` })));
}

function renderDownloadBar() {
  const box = $('#dlbar');
  const games = byKey();
  const active = Object.entries(state.updates).filter(([k, u]) => (u.state === 'updating' || (u.state === 'paused' && u.total > 0)) && games.has(k))
    .sort((a, b) => (a[1].state === 'updating' ? -1 : 1) - (b[1].state === 'updating' ? -1 : 1));
  box.hidden = !active.length;
  if (!active.length) return;
  const [key, u] = active[0];
  const g = games.get(key);
  const phase = u.state === 'paused' ? 'En pause' : u.phase === 'install' ? 'Installation' : u.phase === 'validate' ? 'Vérification' : 'Téléchargement';
  box.replaceChildren(
    el('span', { class: 'dl-thumb' }, art(g, ['header', 'cover'])),
    el('div', { class: 'dl-main' },
      el('div', { class: 'dl-top' },
        el('span', { class: 'dl-title' }, g.title),
        el('span', { class: 'dl-pct' }, u.progress == null ? phase : `${phase} · ${pct(u.progress)}`)),
      el('span', { class: 'bar' + (u.state === 'paused' ? ' paused' : '') }, el('span', { style: `width: ${pct(u.progress).replace(' ', '')}` })),
      el('span', { class: 'dl-sub' }, u.total ? `${size(u.done)} sur ${size(u.total)}` : '', active.length > 1 ? ` · ${active.length - 1} autre${active.length > 2 ? 's' : ''} en file` : '')),
    el('button', { type: 'button', class: 'pill', onclick: () => api.openDownloads() }, 'Téléchargements'));
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 9000);
}

let pollTimer = null;
async function pollUpdates() {
  clearTimeout(pollTimer);
  try {
    const [next, running] = await Promise.all([api.updates(), api.running ? api.running() : []]);
    const runSet = new Set(running);
    // Un jeu détecté comme lancé n'est plus « en cours de lancement » ; abandon après 60 s
    for (const [k, t] of Object.entries(state.launching)) {
      if (runSet.has(k)) delete state.launching[k];
      else if (Date.now() - t > 60000) { delete state.launching[k]; toast("Le jeu ne semble pas avoir démarré. Vérifie la fenêtre de Steam ou d'Epic."); }
    }
    const runChanged = [...runSet].sort().join() !== [...state.running].sort().join();
    state.running = runSet;
    if (runChanged || JSON.stringify(next) !== JSON.stringify(state.updates) || Object.keys(state.launching).length) {
      state.updates = next;
      const list = visibleGames(), sel = selectedGame();
      renderSidebar(list);
      renderHero(sel);
      renderDownloadBar();
    }
  } catch { /* ignoré */ }
  const busy = Object.values(state.updates).some((u) => u.state === 'updating') || Object.keys(state.launching).length > 0 || state.running.size > 0;
  pollTimer = setTimeout(pollUpdates, busy ? 2000 : 8000);
}

async function play(g) {
  if (state.launching[g.key] || state.running.has(g.key)) return;
  state.launching[g.key] = Date.now();
  const hero = $('#hero');
  hero.classList.remove('launch-fx'); void hero.offsetWidth; hero.classList.add('launch-fx');
  renderSidebar(visibleGames());
  renderHero(g);
  const ok = await api.launch(g.key, 'play');
  if (!ok) { delete state.launching[g.key]; toast("Impossible de lancer ce jeu."); renderHero(g); return; }
  setTimeout(pollUpdates, 1500);
}

function renderHero(g) {
  const hero = $('#hero');
  if (!g) { hero.replaceChildren(); return; }
  const u = state.updates[g.key];
  const needsUpdate = g.installed && u && (u.state === 'pending' || u.state === 'paused');
  const updating = g.installed && u?.state === 'updating';
  const action = needsUpdate
    ? el('button', { type: 'button', class: 'btn btn-update', title: 'Ouvre les téléchargements Steam', onclick: async () => { await api.launch(g.key, 'update'); toast(`Steam s'ouvre sur Téléchargements : clique sur le bouton de téléchargement à côté de ${g.title} pour lancer la mise à jour. La progression s'affichera ici.`); setTimeout(pollUpdates, 1500); } }, svg(ICONS.update), u.state === 'paused' ? 'Reprendre' : 'Mettre à jour')
    : updating
    ? el('button', { type: 'button', class: 'btn btn-update', onclick: () => api.openDownloads() }, svg(ICONS.update), 'Mise à jour…')
    : state.running.has(g.key)
    ? el('button', { type: 'button', class: 'btn btn-running', 'aria-disabled': 'true' }, el('span', { class: 'live-dot', 'aria-hidden': 'true' }), 'Lancé')
    : state.launching[g.key]
    ? el('button', { type: 'button', class: 'btn btn-play btn-launching', 'aria-disabled': 'true' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Lancement…')
    : g.installed
    ? el('button', { type: 'button', class: 'btn btn-play', 'aria-disabled': String(!g.launchUrl), onclick: () => play(g) }, svg(ICONS.play), 'Jouer')
    : el('button', { type: 'button', class: 'btn btn-install', 'aria-disabled': String(!g.installUrl), onclick: () => api.launch(g.key, 'install') }, svg(ICONS.install), g.installUrl ? 'Installer' : `Installer depuis ${SOURCES[g.source]?.name || 'le launcher'}`);
  const coverBtn = el('button', {
    type: 'button', class: 'btn-ghost', 'aria-label': "Changer l'image du jeu", title: "Changer l'image du jeu",
    onclick: async () => { if (await api.pickCover(g.key)) load(); }
  }, svg(ICONS.image));
  const resetBtn = g.customCover ? el('button', {
    type: 'button', class: 'btn-ghost', 'aria-label': "Revenir à l'image d'origine", title: "Revenir à l'image d'origine",
    onclick: async () => { await api.resetCover(g.key); load(); }
  }, svg(ICONS.undo)) : null;
  const fav = el('button', {
    type: 'button', class: 'btn-ghost', 'aria-label': g.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
    onclick: async () => { g.favorite = await api.toggleFavorite(g.key); render(); }
  }, svg(ICONS.star(g.favorite)));
  hero.replaceChildren(
    art(g, ['hero', 'header', 'cover']),
    el('div', { class: 'hero-inner' },
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        el('span', { class: 'kicker' }, SOURCES[g.source]?.long || ''),
        el('h1', {}, g.title)),
      el('div', { class: 'hero-actions' }, action, (needsUpdate || updating) ? updateBlock(g, u) : null, fav, coverBtn, resetBtn)));
}

function renderStats(g) {
  if (!g) return $('#stats').replaceChildren();
  const stat = (k, v) => el('div', { class: 'stat' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
  $('#stats').replaceChildren(
    stat('Temps de jeu', g.minutes ? `${hours(g.minutes)} h` : '—'),
    stat('Dernière session', relative(g.lastPlayed)),
    stat('Deux dernières semaines', g.minutes2w ? `${hours(g.minutes2w)} h` : '—'),
    stat('Espace disque', g.installed ? size(g.sizeBytes) : 'Non installé'));
}

// ---------- Activité (actualités Steam) ----------
const newsCache = new Map();
const activityState = { key: null, expanded: false };

function activityItem(n) {
  const thumb = n.image
    ? el('span', { class: 'news-img' }, el('img', { src: n.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.parentElement.remove() }))
    : null;
  const body = el('span', { class: 'news-body' },
    el('span', { class: 'news-src' }, n.source),
    el('span', { class: 'news-title' }, n.title),
    n.excerpt ? el('span', { class: 'news-ex' }, n.excerpt + (n.excerpt.length >= 220 ? '…' : '')) : null);
  return n.url
    ? el('a', { class: 'news', href: n.url, target: '_blank', rel: 'noreferrer' }, thumb, body)
    : el('div', { class: 'news' }, thumb, body);
}

function paintActivity(g, data) {
  const box = $('#activity');
  if (data === 'loading') return box.replaceChildren(el('p', { class: 'muted' }, 'Chargement des actualités…'));
  if (data.error) return box.replaceChildren(el('p', { class: 'muted' }, "Impossible de charger les actualités pour l'instant."));
  if (!data.items.length) return box.replaceChildren(el('p', { class: 'muted' }, 'Aucune actualité récente pour ce jeu.'));
  const items = activityState.expanded ? data.items : data.items.slice(0, 4);
  const groups = [];
  for (const n of items) {
    const label = new Date(n.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: new Date(n.date).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    if (groups.at(-1)?.label === label) groups.at(-1).items.push(n); else groups.push({ label, items: [n] });
  }
  const nodes = groups.map((grp) => el('div', { class: 'news-group' }, el('div', { class: 'news-date' }, grp.label), ...grp.items.map(activityItem)));
  if (data.items.length > 4) nodes.push(el('button', { type: 'button', class: 'pill', onclick: () => { activityState.expanded = !activityState.expanded; paintActivity(g, data); } },
    activityState.expanded ? 'Afficher moins' : `Afficher plus (${data.items.length - 4})`));
  box.replaceChildren(...nodes);
}

async function renderActivity(g) {
  if (!g) return $('#activity').replaceChildren();
  if (activityState.key === g.key && newsCache.has(g.key)) return; // déjà affiché
  activityState.key = g.key;
  activityState.expanded = false;
  if (g.source !== 'steam' || state.status.demo) {
    return $('#activity').replaceChildren(el('p', { class: 'muted' },
      state.status.demo ? 'Les actualités apparaissent pour tes vrais jeux Steam.' : `${SOURCES[g.source]?.long || 'Cette plateforme'} ne propose pas d'actualités publiques par jeu.`));
  }
  if (newsCache.has(g.key)) return paintActivity(g, newsCache.get(g.key));
  paintActivity(g, 'loading');
  const data = await api.news(g.id);
  if (!data.error) newsCache.set(g.key, data);
  if (activityState.key === g.key) paintActivity(g, data);
}

function renderWeek(sel) {
  const w = state.week;
  if (!w) return;
  const games = byKey();
  const today = new Date().toLocaleDateString('sv-SE');
  let total = 0;
  $('#week').replaceChildren(...w.days.map((d) => {
    const date = new Date(d.date + 'T12:00:00');
    const sessions = d.sessions.filter((s) => games.has(s.gameKey));
    const mins = sessions.reduce((t, s) => t + (s.minutes || 0), 0);
    total += mins;
    const isToday = d.date === today;
    return el('div', { class: 'day' + (isToday ? ' today' : '') },
      el('div', { class: 'day-head' },
        el('span', { class: 'd' }, isToday ? "Aujourd'hui" : date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')),
        el('span', { class: 'n' }, date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '')),
        el('span', { class: 'muted small' }, sessions.length ? (mins ? duration(mins) : `${sessions.length} jeu${sessions.length > 1 ? 'x' : ''}`) : 'Pas joué')),
      el('div', { class: 'day-sessions' }, sessions.length ? sessions.map((s) => {
        const g = games.get(s.gameKey);
        return el('button', { type: 'button', class: 'session' + (g.key === sel?.key ? ' selected' : ''), 'aria-label': `${g.title}, ${duration(s.minutes)}`, onclick: () => select(g.key) },
          art(g), el('span', { class: 'dur' }, svg(ICONS.clock), s.minutes == null ? '—' : duration(s.minutes)));
      }) : el('div', { class: 'no-session' }, 'Aucune session')));
  }));
  $('#week-total').textContent = total ? `${duration(total)} de jeu sur 7 jours` : '';
  const note = $('#week-note');
  const since = w.trackingSince;
  note.hidden = state.status.demo || (since && since <= w.days[0].date);
  if (!note.hidden) note.textContent = "Les durées par jour se remplissent à partir du moment où l'appli tourne : elle compare chaque jour ton temps de jeu total avec celui de la veille. En attendant, chaque jeu apparaît le jour de sa dernière session. Laisse l'appli ouverte en arrière-plan (ou lancée au démarrage) pour un suivi complet.";
}

function renderGrid(list, sel) {
  pills($('#sorts'), [['recent', 'Récents'], ['alpha', 'A → Z'], ['hours', 'Temps de jeu']], state.sort, (v) => { state.sort = v; render(); });
  $('#grid').replaceChildren(...list.map((g) =>
    el('button', { type: 'button', class: 'card' + (g.installed ? '' : ' not-installed') + (g.key === sel?.key ? ' selected' : ''), onclick: () => { select(g.key); ($('.content').scrollHeight > $('.content').clientHeight ? $('.content') : window).scrollTo({ top: 0, behavior: 'smooth' }); } },
      art(g),
      el('span', { class: 'card-meta' }, el('span', {}, g.installed ? 'Installé' : 'Non installé'), el('span', {}, g.minutes ? `${hours(g.minutes)} h` : '')))));
}

function renderBanner() {
  const s = state.status, b = $('#banner');
  let msg = null;
  if (s.demo) msg = 'Aucun jeu Steam ou Epic trouvé sur cet ordinateur : voici des jeux de démonstration. Vérifie les dossiers dans les Réglages.';
  else if (s.steam?.api === 'error') msg = `Steam : ${s.steam.error}. Les jeux installés restent affichés.`;
  b.hidden = !msg;
  b.textContent = msg || '';
}

// ---------- Ambiance : fond flou + couleur tirée de l'image du jeu ----------
const ambience = { key: null, layer: 0, tints: new Map() };
const cssUrl = (u) => `url("${String(u).replace(/["\\\n]/g, encodeURIComponent)}")`;

function firstLoadable(urls) {
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= urls.length) return resolve(null);
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => (img.naturalWidth > 60 ? resolve(urls[i]) : (i++, next()));
      img.onerror = () => { i++; next(); };
      img.src = urls[i];
    };
    next();
  });
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// Couleur dominante « vivante » : moyenne pondérée par la saturation, sur une miniature 32×32
function extractTint(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 32);
        const px = ctx.getImageData(0, 0, 32, 32).data;
        let hx = 0, hy = 0, wsum = 0;
        for (let i = 0; i < px.length; i += 4) {
          const [h, sat, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
          const w = sat * sat * (1 - Math.abs(l - .5) * 2);
          hx += Math.cos(h * Math.PI / 180) * w; hy += Math.sin(h * Math.PI / 180) * w; wsum += w;
        }
        if (wsum < 2) return resolve(null);
        resolve(((Math.atan2(hy, hx) * 180 / Math.PI) + 360) % 360);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function applyTint(h) {
  const root = document.documentElement.style;
  root.setProperty('--tint', `hsl(${h} 70% 62%)`);
  root.setProperty('--tint-soft', `hsl(${h} 70% 62% / .28)`);
  root.setProperty('--tint-faint', `hsl(${h} 60% 55% / .12)`);
}

async function setAmbience(g) {
  if (!g || ambience.key === g.key) return;
  ambience.key = g.key;
  const urls = [...new Set(['hero', 'header', 'cover'].flatMap((k) => [].concat(g.images?.[k] || [])).filter(Boolean))];
  applyTint(ambience.tints.get(g.key) ?? hue(g.key));
  const url = urls.length ? await firstLoadable(urls) : null;
  if (ambience.key !== g.key) return;
  const layers = document.querySelectorAll('#backdrop .bd-layer');
  const next = layers[ambience.layer ^ 1], prev = layers[ambience.layer];
  const h = hue(g.key);
  next.style.backgroundImage = url ? cssUrl(url) : `radial-gradient(circle at 30% 20%, hsl(${h} 50% 30%), hsl(${(h + 40) % 360} 50% 8%))`;
  next.classList.add('on'); prev.classList.remove('on');
  ambience.layer ^= 1;
  if (url && !ambience.tints.has(g.key)) {
    const t = await extractTint(url);
    if (t != null) ambience.tints.set(g.key, t);
    if (ambience.key === g.key && t != null) applyTint(t);
  }
}

function render() {
  const list = visibleGames();
  const sel = selectedGame();
  const installed = state.games.filter((g) => g.installed).length;
  $('#count').textContent = `${state.games.length} jeux · ${installed} installés`;
  renderBanner();
  renderSidebar(list);
  renderHero(sel);
  setAmbience(sel);
  renderStats(sel);
  renderActivity(sel);
  renderWeek(sel);
  renderGrid(list, sel);
  renderDownloadBar();
}

// ---------- Chargement ----------
async function load(force = false) {
  const btn = $('#refresh');
  btn.classList.add('spin');
  try {
    const lib = await api.library(force);
    state.games = lib.games;
    state.status = lib.status;
    state.week = await api.week();
    state.updates = await api.updates().catch(() => ({}));
    if (!state.selected) state.selected = [...state.games].sort((a, b) => b.lastPlayed - a.lastPlayed)[0]?.key || null;
    render();
  } finally { btn.classList.remove('spin'); }
}

// ---------- Réglages ----------
async function openSettings() {
  const s = await api.getSettings();
  const f = $('#settings-form');
  f.steamPath.value = s.steamPath; f.steamPath.placeholder = s.defaults.steamPath;
  f.epicPath.value = s.epicPath; f.epicPath.placeholder = s.defaults.epicPath || 'Non disponible sur ce système';
  f.steamApiKey.value = s.steamApiKey;
  f.openAtLogin.checked = s.openAtLogin;
  const st = state.status.steam || {}, ep = state.status.epic || {};
  $('#steam-detected').className = 'small ' + (st.found ? 'ok' : 'warn');
  $('#steam-detected').textContent = st.found ? `Steam détecté${st.user ? ` · compte ${st.user.name}` : ''}` : 'Steam introuvable à cet emplacement.';
  $('#epic-detected').className = 'small ' + (ep.found ? 'ok' : 'warn');
  $('#epic-detected').textContent = ep.found ? `Launcher Epic détecté · ${ep.count} jeu${ep.count > 1 ? 'x' : ''} installé${ep.count > 1 ? 's' : ''}` : 'Launcher Epic introuvable à cet emplacement.';
  $('#settings').showModal();
}

$('#settings-form').addEventListener('submit', async () => {
  const f = $('#settings-form');
  await api.setSettings({ steamPath: f.steamPath.value, epicPath: f.epicPath.value, steamApiKey: f.steamApiKey.value, openAtLogin: f.openAtLogin.checked });
  load(true);
});
$('#settings-cancel').addEventListener('click', () => $('#settings').close());
document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
  const p = await api.pickFolder();
  if (p) $('#settings-form')[b.dataset.pick].value = p;
}));
$('#open-settings').addEventListener('click', openSettings);
$('#refresh').addEventListener('click', () => load(true));
$('#search').addEventListener('input', (e) => { state.query = e.target.value; render(); });

// ---------- Mise à jour de Hangar ----------
const UPD_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const RESTART_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
let lastUpdErr = null;
function renderAppUpdate(u) {
  const b = $('#app-update');
  if (!b || !u) return;
  b.hidden = !['available', 'downloading', 'ready'].includes(u.status);
  b.className = 'app-update ' + u.status;
  b.style.setProperty('--p', `${u.percent || 0}%`);
  if (u.status === 'available') { b.replaceChildren(svg(UPD_ICON), `Mise à jour ${u.version}`); b.title = `Hangar ${u.version} est disponible : clique pour la télécharger`; }
  else if (u.status === 'downloading') { b.replaceChildren(el('span', { class: 'ring', 'aria-hidden': 'true' }), `Téléchargement ${u.percent || 0} %`); b.title = 'Téléchargement de la mise à jour'; }
  else if (u.status === 'ready') { b.replaceChildren(svg(RESTART_ICON), 'Redémarrer et installer'); b.title = `Hangar ${u.version} est prêt : redémarre pour l'installer`; }
  if (u.error && u.error !== lastUpdErr && u.manual) toast(`Mise à jour impossible : ${u.error}`);
  lastUpdErr = u.error;
}
if (api.appUpdate) {
  api.appUpdate.onChange(renderAppUpdate);
  api.appUpdate.state().then((u) => { renderAppUpdate(u); const v = $('#app-version'); if (v) v.textContent = `Version ${u.current}`; });
  $('#app-update').addEventListener('click', async () => {
    const u = await api.appUpdate.state();
    if (u.status === 'available') api.appUpdate.download();
    else if (u.status === 'ready') api.appUpdate.install();
  });
  $('#check-update').addEventListener('click', async () => {
    const btn = $('#check-update');
    btn.textContent = 'Recherche…';
    const u = await api.appUpdate.check();
    if (!u.enabled) toast("Les mises à jour ne fonctionnent que dans l'appli installée.");
    else if (u.status === 'available' || u.status === 'ready' || u.status === 'downloading') toast(`Hangar ${u.version} est disponible : utilise le bouton en haut à droite.`);
    else if (u.error) toast(`Recherche impossible : ${u.error}`);
    else toast('Hangar est à jour.');
    btn.textContent = 'Rechercher une mise à jour';
  });
}

if (api.info) api.info().then((i) => {
  if (!i.preview) return;
  $('#preview-badge').hidden = false;
  $('#preview-badge').title = `Version d'aperçu ${i.version} : rien n'est installé, tes données sont une copie`;
  document.title = 'Hangar — Aperçu';
});

load().then(pollUpdates);
