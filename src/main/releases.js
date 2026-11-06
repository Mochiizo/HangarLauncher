// Calendrier des sorties : jeux récemment sortis et à venir sur Steam.
// Sources publiques (sans clé ni connexion) :
//  - la recherche du Steam Store (résultats HTML avec nom, date de sortie et image, 100 jeux par page)
//      · « À venir populaires », triées par date      → les prochaines semaines
//      · « Nouveautés populaires », les plus récentes  → la semaine passée
//  - IWishlistService/GetWishlist → liste de souhaits (si elle est publique)
//  - store.steampowered.com/api/appdetails → fiche détaillée (liste de souhaits, et bulle d'info au survol)
'use strict';

const DETAILS_TTL = 12 * 3600_000;
const LIST_TTL = 2 * 3600_000;
let listCache = { at: 0, key: '', data: null };

const MONTHS = {
  'janv': 1, 'févr': 2, 'fevr': 2, 'mars': 3, 'avr': 4, 'mai': 5, 'juin': 6, 'juil': 7, 'août': 8, 'aout': 8, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12, 'dec': 12,
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9
};

// « 2 nov. 2026 », « 24 sept. 2026 », « Sep 24, 2026 » → « 2026-11-02 » ; dates vagues (« novembre 2026 », « T1 2027 ») → null
function parseDate(text) {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\./g, '').trim();
  let m = t.match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/);
  let day, mon, year;
  if (m) { day = +m[1]; mon = MONTHS[m[2]] || MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)]; year = +m[3]; }
  else if ((m = t.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/))) { mon = MONTHS[m[1].slice(0, 3)]; day = +m[2]; year = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/))) { day = +m[1]; mon = MONTHS[m[2].slice(0, 3)]; year = +m[3]; }
  if (!day || !mon || !year) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Images d'un jeu : la capsule large (même dossier que la petite capsule de la recherche), puis l'en-tête, puis la petite capsule
function imagesFor(id, smallCapsule) {
  const list = [];
  if (smallCapsule && /capsule_231x87/.test(smallCapsule)) list.push(smallCapsule.replace('capsule_231x87', 'capsule_616x353'));
  list.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`);
  if (smallCapsule) list.push(smallCapsule);
  return list;
}

// Une page de la recherche du Steam Store (jeux uniquement : category1=998)
async function searchPage(filter, sort, start) {
  const url = `https://store.steampowered.com/search/results/?filter=${filter}&sort_by=${sort}&category1=998&infinite=1&count=100&start=${start}&cc=FR&l=french`;
  const j = await getJson(url);
  const html = String(j?.results_html || '');
  const rows = [];
  // une ligne de résultat = un <a … class="search_result_row …">, quel que soit l'ordre des attributs
  for (const chunk of html.split(/<a\s/).slice(1)) {
    if (!/search_result_row/.test(chunk.slice(0, 1500)) && !/store\.steampowered\.com\/app\//.test(chunk.slice(0, 300))) continue;
    const id = (chunk.match(/data-ds-appid="(\d+)"/) || [])[1];
    if (!id) continue;
    const name = decode((chunk.match(/<span class="title">([\s\S]*?)<\/span>/) || [])[1]);
    const dateText = decode((chunk.match(/<div class="search_released[^"]*">([\s\S]*?)<\/div>/) || [])[1]);
    const img = (chunk.match(/<img src="([^"]+)"/) || [])[1];
    const date = parseDate(dateText);
    if (!name || !date) continue;
    rows.push({ id, name, date, dateText, images: imagesFor(id, img && img.startsWith('https://') ? img : null), url: `https://store.steampowered.com/app/${id}/` });
  }
  return rows;
}

async function wishlistIds(steamId) {
  if (!/^\d{17}$/.test(String(steamId || ''))) return [];
  try {
    const j = await getJson(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`);
    return (j?.response?.items || []).map((i) => String(i.appid)).filter(Boolean);
  } catch { return []; }
}

// Fiche détaillée d'un jeu (description, genres, date) — mise en cache
async function details(id, cache) {
  id = String(id);
  if (!/^\d+$/.test(id)) return null;
  const hit = cache[id];
  if (hit && Date.now() - hit.at < DETAILS_TTL) return hit.data;
  let data = null;
  try {
    const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&l=french&cc=FR`);
    const d = j?.[id]?.success ? j[id].data : null;
    if (d && d.type === 'game') {
      data = {
        id,
        name: d.name,
        date: parseDate(d.release_date?.date),
        dateText: d.release_date?.date || '',
        images: [d.header_image].filter((u) => /^https:\/\//.test(u || '')),
        description: decode(String(d.short_description || '').replace(/<[^>]+>/g, '')).slice(0, 320),
        genres: (d.genres || []).map((g) => g.description).slice(0, 5),
        url: `https://store.steampowered.com/app/${id}/`
      };
    }
  } catch { return hit?.data || null; }
  cache[id] = { at: Date.now(), data };
  return data;
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function getReleases({ steamId, cache, ownedIds = new Set() }) {
  const key = String(steamId || '');
  if (listCache.data && listCache.key === key && Date.now() - listCache.at < LIST_TTL) return listCache.data;

  // Fenêtre de 5 semaines : la semaine dernière, celle-ci et les 3 suivantes (du lundi au dimanche)
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7).toLocaleDateString('sv-SE');
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 27).toLocaleDateString('sv-SE');

  const safe = (p) => p.catch(() => []);
  const [up1, up2, up3, new1, new2, wish] = await Promise.all([
    safe(searchPage('popularcomingsoon', 'Released_ASC', 0)),
    safe(searchPage('popularcomingsoon', 'Released_ASC', 100)),
    safe(searchPage('popularcomingsoon', 'Released_ASC', 200)),
    safe(searchPage('popularnew', 'Released_DESC', 0)),
    safe(searchPage('popularnew', 'Released_DESC', 100)),
    wishlistIds(steamId)
  ]);
  if (![up1, up2, up3, new1, new2].some((r) => r.length) && !wish.length) throw new Error('Steam Store injoignable');

  const byId = new Map();
  for (const g of [...up1, ...up2, ...up3, ...new1, ...new2]) if (!byId.has(g.id)) byId.set(g.id, g);

  // Liste de souhaits : on récupère la fiche des jeux absents de la recherche (50 max)
  const wishSet = new Set(wish);
  const missing = wish.filter((id) => !byId.has(id)).slice(0, 50);
  for (const g of (await pool(missing, 4, (id) => details(id, cache))).filter(Boolean)) byId.set(g.id, g);

  const games = [...byId.values()]
    .filter((g) => g.date && g.date >= from && g.date <= to && !ownedIds.has(g.id))
    .map((g) => ({ ...g, wishlist: wishSet.has(g.id) }))
    // dans une même journée : liste de souhaits d'abord, puis l'ordre de popularité de Steam
    .sort((a, b) => a.date.localeCompare(b.date) || (b.wishlist - a.wishlist));

  const data = { games, wishlist: wish.length > 0, from, to, at: Date.now() };
  listCache = { at: Date.now(), key, data };
  return data;
}

module.exports = { getReleases, details, parseDate };
