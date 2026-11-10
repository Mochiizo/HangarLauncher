// Succès Steam d'un jeu (clé API Steam des Réglages) : liste complète, obtenus / à débloquer,
// date d'obtention et rareté (pourcentage de joueurs qui l'ont).
'use strict';

const API = 'https://api.steampowered.com';
const cache = new Map(); // appid → { at, data }

// Les icônes de succès pointent souvent vers l'ancien CDN de Steam (steamcdn-a.akamaihd.net), qui ne répond
// plus pour beaucoup de jeux. On garde le chemin et on passe sur les CDN actuels (le second sert de secours).
const ICON_HOSTS = ['https://cdn.fastly.steamstatic.com', 'https://cdn.akamai.steamstatic.com'];
function iconUrls(url) {
  if (!url) return [];
  const m = String(url).match(/\/steamcommunity\/public\/images\/apps\/.+$/);
  return m ? [...new Set([...ICON_HOSTS.map((h) => h + m[0]), url])] : [url];
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  let body = null;
  try { body = await res.json(); } catch { /* pas de JSON */ }
  return { ok: res.ok, status: res.status, body };
}

async function forGame(apiKey, steamId, appid) {
  appid = Number(appid);
  if (!appid) return { status: 'none', items: [] };
  if (!apiKey) return { status: 'nokey', items: [] };
  if (!steamId) return { status: 'nouser', items: [] };
  const hit = cache.get(appid);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;

  const key = encodeURIComponent(apiKey);
  let data;
  try {
    const [schema, player, global] = await Promise.all([
      getJson(`${API}/ISteamUserStats/GetSchemaForGame/v2/?key=${key}&appid=${appid}&l=french`),
      getJson(`${API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key}&steamid=${steamId}&appid=${appid}&l=french`),
      getJson(`${API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`)
    ]);
    const defs = schema.body?.game?.availableGameStats?.achievements || [];
    if (!defs.length) {
      data = { status: 'none', items: [] };
    } else {
      const err = String(player.body?.playerstats?.error || '');
      const mine = new Map((player.body?.playerstats?.achievements || []).map((a) => [a.apiname, a]));
      const pct = new Map((global.body?.achievementpercentages?.achievements || []).map((a) => [a.name, Number(a.percent)]));
      const items = defs.map((d) => {
        const m = mine.get(d.name);
        return {
          id: d.name,
          name: d.displayName || d.name,
          desc: d.description || '',
          hidden: d.hidden === 1,
          icon: iconUrls(d.icon),
          iconGray: iconUrls(d.icongray || d.icon),
          achieved: m?.achieved === 1,
          unlockTime: m?.unlocktime ? m.unlocktime * 1000 : 0,
          percent: pct.has(d.name) ? pct.get(d.name) : null
        };
      });
      // Profil privé ou jeu jamais lancé : on montre quand même la liste, sans savoir lesquels sont obtenus
      const status = player.ok && player.body?.playerstats?.success !== false ? 'ok'
        : /not public|private/i.test(err) || player.status === 403 ? 'private' : 'partial';
      const unlocked = items.filter((a) => a.achieved).length;
      data = { status, total: items.length, unlocked, items, at: Date.now() };
    }
  } catch (e) {
    return { status: 'error', error: e.message, items: hit?.data?.items || [] };
  }
  cache.set(appid, { at: Date.now(), data });
  return data;
}

module.exports = { forGame };
