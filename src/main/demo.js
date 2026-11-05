// Jeux inventés affichés quand aucun jeu Steam/Epic n'est trouvé sur la machine.
'use strict';
const { dayKey } = require('./store');

const RAW = [
  ['tides', 'Hollow Tides', 2772, 0, true, 18.4], ['garrison', 'Néon Garrison', 6768, 1, true, 32.1],
  ['orme', "Les Cendres d'Orme", 1710, 3, true, 24.7], ['kiln', 'Kiln & Keel', 4020, 5, true, 6.2],
  ['couriers', 'Rift Couriers', 1158, 14, false, 14.9], ['orbit', 'Pale Orbit', 5286, 21, true, 41],
  ['mire', 'Mirebound', 444, 32, false, 22.3], ['cartel', 'Starfall Cartel', 3276, 60, false, 78.5],
  ['echoes', 'Tavern of Echoes', 8412, 90, true, 2.1], ['derby', 'Grimstone Derby', 660, 150, false, 9.8]
];

const games = () => RAW.map(([id, title, minutes, ago, installed, gb], i) => ({
  key: `demo-${id}`, source: i % 3 === 2 ? 'epic' : 'steam', id, title, minutes, minutes2w: 0,
  lastPlayed: Date.now() - ago * 86400000, installed, sizeBytes: gb * 1e9, images: {}, launchUrl: null, installUrl: null
}));

function week() {
  const plan = [[['kiln', 80]], [['kiln', 130], ['tides', 65]], [['garrison', 180], ['tides', 90]],
    [['orme', 135]], [], [['garrison', 100], ['tides', 45]], [['tides', 110]]];
  const out = {};
  plan.forEach((s, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); out[dayKey(d)] = Object.fromEntries(s.map(([k, m]) => [`demo-${k}`, m])); });
  return out;
}

module.exports = { games, week };
