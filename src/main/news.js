// Activité d'un jeu Steam : la même source que l'onglet Activité de la bibliothèque Steam,
// c.-à-d. les événements/annonces publiés par le développeur (images « capsule » comprises).
// Repli : flux officiel des annonces via ISteamNews si la première source échoue.
'use strict';

const CLAN_IMG = 'https://clan.akamai.steamstatic.com/images';
const cache = new Map();
const TTL = 30 * 60_000;
// Langues Steam : 2 = français, 0 = anglais (repli)
const LANG = '2_0';

const TYPE_LABEL = { 12: 'Notes de patch', 13: 'Mise à jour', 14: 'Mise à jour majeure', 28: 'Actualités', 11: 'Diffusion en direct', 9: 'Événement', 15: 'Promotion', 21: 'Promotion', 22: 'Promotion', 31: 'Promotion' };

function excerpt(text) {
  return String(text || '')
    .replace(/\[img[^\]]*\][^\[]*\[\/img\]/gi, ' ')
    .replace(/\[(previewyoutube|video)[^\]]*\][^\[]*\[\/\1\]/gi, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 220);
}

function bodyImage(text) {
  const m = String(text || '').match(/\{STEAM_CLAN_IMAGE\}(\/[^\s"\]\[]+)/) || String(text || '').match(/(https:\/\/[^\s"\]\[]+\.(?:png|jpe?g|gif|webp))/i);
  if (!m) return null;
  return m[0].startsWith('{') ? CLAN_IMG + m[1] : m[1];
}

const firstOf = (arr) => (Array.isArray(arr) ? arr.find(Boolean) : null);

async function fromEvents(appid) {
  const url = `https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/?appid=${appid}&count_before=0&count_after=12&lang_list=${LANG}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.success || !Array.isArray(j.events)) throw new Error('réponse inattendue');

  return j.events.map((e) => {
    let data = e.jsondata;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = {}; } }
    const body = e.announcement_body || {};
    const clanid = body.clanid;
    const capsule = firstOf(data?.localized_capsule_image) || firstOf(data?.localized_title_image);
    return {
      id: e.gid,
      title: body.headline || e.event_name,
      url: `https://store.steampowered.com/news/app/${appid}/view/${body.gid || e.gid}`,
      date: (e.rtime32_start_time || body.posttime || 0) * 1000,
      source: TYPE_LABEL[e.event_type] || 'Actualités',
      image: capsule && clanid ? `${CLAN_IMG}/${clanid}/${capsule}` : bodyImage(body.body),
      excerpt: excerpt(body.body)
    };
  }).sort((a, b) => b.date - a.date);
}

async function fromNewsFeed(appid) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=12&feeds=steam_community_announcements&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json())?.appnews?.newsitems || []).map((n) => ({
    id: n.gid, title: n.title, url: /^https:\/\//.test(n.url) ? n.url : null, date: n.date * 1000,
    source: 'Actualités', image: bodyImage(n.contents), excerpt: excerpt(n.contents)
  }));
}

async function steamNews(appid) {
  const id = String(appid);
  if (!/^\d+$/.test(id)) return [];
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  let items;
  try { items = await fromEvents(id); } catch { items = await fromNewsFeed(id); }
  cache.set(id, { at: Date.now(), items });
  return items;
}

module.exports = { steamNews };
