// Parseur du format texte VDF de Valve ("clé" "valeur" et "clé" { ... }).
'use strict';

function parse(text) {
  let i = 0;
  const n = text.length;

  function skip() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      break;
    }
  }

  function str() {
    if (text[i] === '"') {
      i++;
      let s = '';
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) { const e = text[i + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; i += 2; continue; }
        s += text[i++];
      }
      i++;
      return s;
    }
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    return s;
  }

  function obj() {
    const o = {};
    for (;;) {
      skip();
      if (i >= n) return o;
      if (text[i] === '}') { i++; return o; }
      const key = str();
      skip();
      if (text[i] === '{') { i++; o[key] = obj(); } else o[key] = str();
      skip();
      if (text[i] === '[') { while (i < n && text[i] !== ']') i++; i++; } // conditions [$WIN32]
    }
  }

  return obj();
}

// Accès insensible à la casse : get(o, 'Software', 'Valve', 'Steam', 'apps')
function get(o, ...keys) {
  let cur = o;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    const found = Object.keys(cur).find((x) => x.toLowerCase() === k.toLowerCase());
    cur = found === undefined ? undefined : cur[found];
  }
  return cur;
}

module.exports = { parse, get };
