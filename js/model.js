/*
 * model.js — turns the curriculum into learnable ITEMS and SKILLS. No DOM, no storage.
 *
 * Item keys:  c:<country>   f:<feature>   w:<fact>
 * Skills (tracked separately, brief §14/§16):
 *   country  ort  – find it on the map            (Karte)
 *            name – say which country is shown     (Länder)       choice first, later typing
 *            cap  – country → capital              (Hauptstadt →)
 *            rev  – capital → country              (Hauptstadt ←)
 *   feature  ort  – find the sea/river/…           (Physische Geographie)
 *            name – name the marked feature
 *   fact     wissen                                 (Europa-Wissen)
 * Spelling is tracked per WORD (Rechtschreibung), listening per word (Hören & Schreiben).
 *
 * Learning order inside an item (brief §8): SEE → FIND → NAME → REMEMBER → WRITE
 *   ort is open after the item was introduced; name opens after ort was right once;
 *   cap after name; rev after cap. Typing replaces choices once a skill is secure (box ≥ 2).
 */
(function (root) {
  'use strict';
  var C = root.ET.curriculum;

  var TYPE_LABEL = { sea: 'Meer', river: 'Fluss', mountain: 'Gebirge', island: 'Insel', place: 'Ort' };
  var TYPE_PLURAL = { sea: 'Meere', river: 'Flüsse', mountain: 'Gebirge', island: 'Inseln', place: 'Orte' };
  var TYPE_ICON = { sea: '🌊', river: '〰️', mountain: '🏔️', island: '🏝️', place: '📍', country: '🗺️', fact: '💡' };
  var TYPE_CAT = { sea: 'meere', river: 'fluesse', mountain: 'gebirge', island: 'inseln', place: 'grenzen' };

  function flag(iso2) {
    if (!iso2 || iso2.length !== 2 || iso2 === 'XK') return '🏳️';
    return String.fromCodePoint(0x1F1E6 + iso2.charCodeAt(0) - 65, 0x1F1E6 + iso2.charCodeAt(1) - 65);
  }

  var items = [], byKey = {}, groupOf = {};
  C.groups.forEach(function (g) { groupOf[g.id] = g; });

  C.countries.forEach(function (c) {
    var skills = ['ort', 'name'];
    if (c.capital) skills.push('cap', 'rev');
    var it = { key: 'c:' + c.id, id: c.id, kind: 'country', type: 'country', group: c.group, tier: c.tier,
               name: c.name, ref: c, skills: skills, icon: flag(c.iso2), mapId: 'country-' + c.id,
               cat: c.tier === 'extra' ? 'extra' : 'laender' };
    items.push(it); byKey[it.key] = it;
  });
  C.features.forEach(function (f) {
    var it = { key: 'f:' + f.id, id: f.id, kind: 'feature', type: f.type, group: f.group, tier: f.tier,
               name: f.name, ref: f, skills: ['ort', 'name'], icon: TYPE_ICON[f.type],
               mapId: f.type + '-' + f.id, cat: TYPE_CAT[f.type] };
    items.push(it); byKey[it.key] = it;
  });
  C.facts.forEach(function (w) {
    var it = { key: 'w:' + w.id, id: w.id, kind: 'fact', type: 'fact', group: w.group, tier: 'core',
               name: w.q, ref: w, skills: ['wissen'], icon: '💡', cat: w.border ? 'grenzen' : 'wissen' };
    items.push(it); byKey[it.key] = it;
  });

  // Words that can be spelled / heard. Each word belongs to one item.
  var words = [];
  items.forEach(function (it) {
    if (it.kind === 'country') {
      var c = it.ref;
      words.push({ key: 'name:' + c.id, item: it.key, word: c.name, alts: c.alt, syl: c.syl, diff: c.diff, say: c.say || c.name, what: 'Land', tier: it.tier });
      if (c.capital) words.push({ key: 'cap:' + c.id, item: it.key, word: c.capital, alts: c.capAlt, syl: c.capSyl, diff: c.capDiff, say: c.capSay || c.capital, what: 'Hauptstadt', tier: it.tier });
    } else if (it.kind === 'feature') {
      var f = it.ref;
      words.push({ key: 'feat:' + f.id, item: it.key, word: f.name, alts: f.alt, syl: f.syl, diff: f.diff, say: f.say || f.name, what: TYPE_LABEL[f.type], tier: it.tier });
    }
  });
  var wordByKey = {}; words.forEach(function (w) { wordByKey[w.key] = w; });

  // Answer domains for the spelling check: everything of the same kind.
  var domains = {
    country: C.countries.map(function (c) { return { id: c.id, label: c.name, forms: [c.name].concat(c.alt) }; }),
    capital: C.countries.filter(function (c) { return c.capital; }).map(function (c) { return { id: c.id, label: c.capital, forms: [c.capital].concat(c.capAlt) }; })
  };
  ['sea', 'river', 'mountain', 'island', 'place'].forEach(function (t) {
    domains[t] = C.features.filter(function (f) { return f.type === t; }).map(function (f) { return { id: f.id, label: f.name, forms: [f.name].concat(f.alt) }; });
  });
  // Rivers and mountains share names (Ural) — also compare against the other kind.
  domains.feature = C.features.map(function (f) { return { id: f.id, label: f.name, forms: [f.name].concat(f.alt) }; });

  // German articles for feature questions: "Wo liegt die Ostsee?" / "Zeige den Rhein."
  function withArt(f, kasus) {
    var a = f.article || 'der';
    if (a.indexOf('die Insel') === 0) return (kasus === 'dat' ? 'der Insel ' : 'die Insel ') + f.name;
    if (a === 'die Inseln') return (kasus === 'dat' ? 'den ' : 'die ') + f.name;
    if (kasus === 'akk') return ({ der: 'den', die: 'die', das: 'das' }[a] || a) + ' ' + f.name;
    if (kasus === 'dat') return ({ der: 'dem', die: 'der', das: 'dem' }[a] || a) + ' ' + f.name;
    return a + ' ' + f.name;
  }

  function isActive(it, settings) {
    settings = settings || {};
    var cats = settings.cats || {};
    var off = settings.off || {};
    if (off[it.key]) return false;
    if (it.tier === 'extra') return cats.extra === true;
    if (cats[it.cat] === false) return false;
    return true;
  }

  function skillActive(it, skill, settings) {
    var cats = (settings && settings.cats) || {};
    if ((skill === 'cap' || skill === 'rev') && cats.hauptstaedte === false) return false;
    return true;
  }

  // Countries that take an article in German: [nominative, dative (after von/in)], plural?
  var ARTICLE = {
    schweiz: ['die Schweiz', 'der Schweiz'], tschechien: ['die Tschechische Republik', 'der Tschechischen Republik'],
    slowakei: ['die Slowakei', 'der Slowakei'], ukraine: ['die Ukraine', 'der Ukraine'], tuerkei: ['die Türkei', 'der Türkei'],
    niederlande: ['die Niederlande', 'den Niederlanden', true], vatikan: ['die Vatikanstadt', 'der Vatikanstadt']
  };
  // "Wo liegt die Schweiz?" · "die Hauptstadt von der Schweiz" · "liegt in den Niederlanden"
  function cn(c, kasus) {
    var a = ARTICLE[c.id];
    if (!a) return c.name;
    return kasus === 'dat' ? a[1] : a[0];
  }
  // "die Hauptstadt der Schweiz" / "der Niederlande" / "von Polen"
  function von(c) {
    var a = ARTICLE[c.id];
    if (!a) return 'von ' + c.name;
    return a[2] ? 'der Niederlande' : a[1];
  }
  function cnCap(c) { var s = cn(c); return s.charAt(0).toUpperCase() + s.slice(1); }
  function liegt(c) { return ARTICLE[c.id] && ARTICLE[c.id][2] ? 'liegen' : 'liegt'; }
  function phrase(mapId) {                 // "die Schweiz", "das Mittelmeer", "Polen" for any map id
    var parts = String(mapId || '').split('-'), kind = parts.shift(), key = parts.join('-');
    if (kind === 'country') { var it = byKey['c:' + key]; return it ? cn(it.ref) : ''; }
    var f = byKey['f:' + key]; return f ? withArt(f.ref) : '';
  }

  root.ET.model = {
    cn: cn, cnCap: cnCap, von: von, liegt: liegt, phrase: phrase, ARTICLE: ARTICLE,
    items: items, byKey: byKey, words: words, wordByKey: wordByKey, domains: domains, groups: C.groups, groupOf: groupOf,
    flag: flag, withArt: withArt, isActive: isActive, skillActive: skillActive,
    TYPE_LABEL: TYPE_LABEL, TYPE_PLURAL: TYPE_PLURAL, TYPE_ICON: TYPE_ICON,
    country: function (id) { return byKey['c:' + id]; },
    feature: function (id) { return byKey['f:' + id]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
