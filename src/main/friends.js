// Liste d'amis Steam (nécessite la clé API Steam des Réglages).
// GetFriendList → identifiants, puis GetPlayerSummaries (100 par appel) → pseudo, avatar, statut, jeu en cours.
'use strict';

const API = 'https://api.steampowered.com';
// personastate Steam : 0 hors ligne, 1 en ligne, 2 occupé, 3 absent, 4 sieste, 5 cherche échange, 6 cherche à jouer
const STATES = { 0: 'offline', 1: 'online', 2: 'busy', 3: 'away', 4: 'away', 5: 'online', 6: 'online' };

let cache = { at: 0, key: '', data: null };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (res.status === 401 || res.status === 403) { const e = new Error('private'); e.code = 'private'; throw e; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function list(apiKey, steamId) {
  if (!apiKey) return { status: 'nokey', friends: [] };
  if (!steamId) return { status: 'nouser', friends: [] };
  const ck = `${apiKey.slice(-6)}:${steamId}`;
  if (cache.data && cache.key === ck && Date.now() - cache.at < 45_000) return cache.data;
  let data;
  try {
    const fl = await getJson(`${API}/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&relationship=friend`);
    const ids = (fl?.friendslist?.friends || []).map((f) => f.steamid);
    const friends = [];
    for (let i = 0; i < ids.length; i += 100) {
      const ps = await getJson(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${ids.slice(i, i + 100).join(',')}`);
      for (const p of ps?.response?.players || []) {
        const playing = p.gameextrainfo || null;
        friends.push({
          id: p.steamid,
          name: p.personaname || 'Ami Steam',
          avatar: p.avatarmedium || p.avatar || null,
          state: playing ? 'playing' : STATES[p.personastate] || 'offline',
          game: playing,
          gameId: p.gameid || null,
          lastOnline: p.lastlogoff ? p.lastlogoff * 1000 : 0
        });
      }
    }
    // En jeu, puis en ligne, absent / occupé, hors ligne (récents d'abord) ; ordre alphabétique à égalité
    const rank = { playing: 0, online: 1, busy: 2, away: 2, offline: 3 };
    friends.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'offline' ? b.lastOnline - a.lastOnline : 0) || a.name.localeCompare(b.name, 'fr'));
    data = { status: 'ok', friends, at: Date.now() };
  } catch (e) {
    data = { status: e.code === 'private' ? 'private' : 'error', error: e.message, friends: cache.data?.friends || [] };
  }
  cache = { at: Date.now(), key: ck, data };
  return data;
}

module.exports = { list };
