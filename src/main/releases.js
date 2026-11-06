// Calendrier des sorties : jeux récemment sortis et à venir sur Steam.
// Sources publiques (sans clé) :
//  - store.steampowered.com/api/featuredcategories → « À venir » et « Nouveautés »
//  - IWishlistService/GetWishlist → liste de souhaits (si elle est publique)
//  - store.steampowered.com/api/appdetails → date de sortie, description, genres, image
'use strict';

const DETAILS_TTL = 12 * 3600_000;
const LIST_TTL = 3 * 3600_000;
let listCache = { at: 0, key: '', data: null };

const MONTHS = {
  // français (Steam en l=french)
  'janv': 1, 'févr': 2, 'fevr': 2, 'mars': 3, 'avr': 4, 'mai': 5, 'juin': 6, 'juil': 7, 'août': 8, 'aout': 8, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12, 'dec': 12,
  // anglais (repli)
  'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9
};

// « 2 nov. 2026 », « 24 sept. 2026 », « Sep 24, 2026 » → « 2026-11-02 » ; dates vagues (« T1 2027 », « Bientôt ») → null
function parseDate(text) {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\./g, '').trim();
  let m = t.match(/^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/);           // 2 nov 2026
  let day, mon, year;
  if (m) { day = +m[1]; mon = MONTHS[m[2]] || MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)]; year = +m[3]; }
  else if ((m = t.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/))) { mon = MONTHS[m[1].slice(0, 3)]; day = +m[2]; year = +m[3]; } // sep 24, 2026
  else if ((m = t.match(/^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/))) { day = +m[1]; mon = MONTHS[m[2].slice(0, 3)]; year = +m[3]; }
  if (!day || !mon || !year) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function featuredIds() {
  const j = await getJson('https://store.steampowered.com/api/featuredcategories?cc=FR&l=french');
  const ids = [];
  for (const k of ['coming_soon', 'new_releases']) for (const it of j?.[k]?.items || []) if (it.type === 0 && it.id) ids.push(String(it.id));
  return ids;
}

async function wishlistIds(steamId) {
  if (!/^\d{17}$/.test(String(steamId || ''))) return [];
  try {
    const j = await getJson(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`);
    return (j?.response?.items || []).map((i) => String(i.appid)).filter(Boolean);
  } catch { return []; }
}

async function details(id, cache) {
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
        comingSoon: !!d.release_date?.coming_soon,
        image: /^https:\/\//.test(d.header_image || '') ? d.header_image : null,
        description: String(d.short_description || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").slice(0, 320),
        genres: (d.genres || []).map((g) => g.description).slice(0, 5),
        url: `https://store.steampowered.com/app/${id}/`
      };
    }
  } catch { return hit?.data || null; } // hors ligne : on garde l'ancienne version
  cache[id] = { at: Date.now(), data };
  return data;
}

// Exécute fn sur chaque élément, `limit` à la fois (évite de saturer l'API de la boutique)
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function getReleases({ steamId, cache, ownedIds = new Set() }) {
  const key = String(steamId || '');
  if (listCache.data && listCache.key === key && Date.now() - listCache.at < LIST_TTL) return listCache.data;

  const [feat, wish] = await Promise.all([featuredIds().catch(() => []), wishlistIds(steamId)]);
  const wishSet = new Set(wish);
  const ids = [...new Set([...wish.slice(0, 80), ...feat])].filter((id) => !ownedIds.has(id));
  const all = (await pool(ids, 4, (id) => details(id, cache))).filter(Boolean);

  // Fenêtre : 10 jours en arrière → 60 jours devant
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10).toLocaleDateString('sv-SE');
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60).toLocaleDateString('sv-SE');
  const games = all.filter((g) => g.date && g.date >= from && g.date <= to)
    .map((g) => ({ ...g, wishlist: wishSet.has(g.id) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (b.wishlist - a.wishlist));

  const data = { games, wishlist: wish.length > 0, at: Date.now() };
  listCache = { at: Date.now(), key, data };
  return data;
}

module.exports = { getReleases, parseDate };
