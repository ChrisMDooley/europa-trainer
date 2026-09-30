/*
 * questions.js — builds one question for (item, skill). No DOM.
 *
 * Question = { item, skill, kind, prompt, sub?, map?, options?, answer, alts?, domain?, word?,
 *              speak?, reveal?, rightText, knownText?, wrongText(given) }
 *   kind  'find'    tap it on the map (map.pick = 'country' | 'sea' | …; retry allowed)
 *         'choice'  multiple choice (options: [{value, label}])
 *         'type'    type the answer (spelling judged separately from knowledge)
 *         'listen'  hear it, then type it
 *         'intro'   "Neu:" card — look, no answer
 * Wording follows the brief: "Wo liegt Polen?", "Welches Land ist das?",
 * "Wie heißt die Hauptstadt von …?", "Berlin ist die Hauptstadt von welchem Land?".
 */
(function (root) {
  'use strict';
  var M = root.ET.model, CUR = root.ET.curriculum;

  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function dist(a, b) { var dx = (a[0] - b[0]) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }
  // Good wrong answers: neighbours on the map (the ones he could really mix up), then same group.
  function nearCountries(c, n, filter) {
    return CUR.countries.filter(function (o) { return o.id !== c.id && (!filter || filter(o)); })
      .sort(function (a, b) { return dist(a.capLL, c.capLL) - dist(b.capLL, c.capLL); }).slice(0, n);
  }
  // Pairs children confuse by name, whatever the map says.
  var CONFUSE = { slowakei: ['slowenien'], slowenien: ['slowakei'], lettland: ['litauen', 'estland'], litauen: ['lettland'],
                  estland: ['lettland'], schweden: ['schweiz'], schweiz: ['schweden'],
                  rumaenien: ['bulgarien'], bulgarien: ['rumaenien'], serbien: ['albanien'], irland: ['island'], island: ['irland'],
                  niederlande: ['belgien'], belgien: ['niederlande'], montenegro: ['mazedonien'], mazedonien: ['montenegro'] };

  function options(answer, candidates, label, n) {
    n = n || 4;
    var seen = {}, list = [answer];
    seen[answer] = true;
    candidates.forEach(function (c) { if (list.length < n && !seen[c]) { list.push(c); seen[c] = true; } });
    return shuffle(list).map(function (v) { return { value: v, label: label(v) }; });
  }

  function countryOpts(c, activeIds) {
    var near = nearCountries(c, 6, function (o) { return o.tier === 'core' || activeIds[o.id]; }).map(function (o) { return o.id; });
    var conf = (CONFUSE[c.id] || []).filter(function (id) { return CUR.countries.some(function (o) { return o.id === id; }); });
    return conf.concat(shuffle(near.slice(0, 3)).concat(shuffle(near.slice(3))));
  }
  function capitalOf(id) { return CUR.countries.filter(function (c) { return c.id === id; })[0].capital; }
  function countryOf(id) { return CUR.countries.filter(function (c) { return c.id === id; })[0]; }

  // ---------------------------------------------------------------- countries
  function countryQ(it, skill, ctx) {
    var c = it.ref, typed = ctx.typed, activeIds = ctx.activeIds || {};
    var q = { item: it.key, skill: skill };
    if (skill === 'ort') {
      q.kind = 'find'; q.prompt = 'Wo ' + M.liegt(c) + ' ' + M.cn(c) + '?'; q.sub = 'Tippe das Land auf der Karte an.';
      q.map = { pick: 'country', layers: {}, target: it.mapId };
      q.answer = it.mapId;
      q.rightText = 'Richtig! ' + it.icon + ' ' + c.name;
      q.after = c.capital ? 'Hauptstadt: ' + c.capital : '';
      return q;
    }
    if (skill === 'name') {
      q.prompt = 'Welches Land ist das?'; q.map = { highlight: [it.mapId], zoomTo: it.mapId };
      if (typed) {
        q.kind = 'type'; q.answer = c.name; q.alts = c.alt; q.domain = M.domains.country; q.word = 'name:' + c.id;
        q.sub = 'Schreibe den Namen.';
      } else {
        q.kind = 'choice'; q.answer = c.id;
        q.options = options(c.id, countryOpts(c, activeIds).filter(function (id) { return activeIds[id] || countryOf(id).tier === 'core'; }), function (id) { return countryOf(id).name; });
      }
      q.rightText = 'Richtig! ' + it.icon + ' ' + c.name;
      q.wrongText = function () { return 'Das ist ' + M.cn(c) + '.'; };
      q.showName = it.mapId;
      return q;
    }
    if (skill === 'cap') {
      q.prompt = 'Wie heißt die Hauptstadt ' + M.von(c) + '?';
      q.map = { highlight: [it.mapId], zoomTo: it.mapId, noLabels: true };
      if (typed) {
        q.kind = ctx.listen ? 'listen' : 'type'; q.answer = c.capital; q.alts = c.capAlt; q.domain = M.domains.capital; q.word = 'cap:' + c.id;
        if (ctx.listen) { q.prompt = 'Hör gut zu und schreibe die Hauptstadt.'; q.speak = 'Die Hauptstadt ' + M.von(c) + ' ist ' + (c.capSay || c.capital) + '.'; q.map = null; }
      } else {
        q.kind = 'choice'; q.answer = c.capital;
        q.options = options(c.capital, countryOpts(c, activeIds).map(capitalOf).filter(Boolean), function (v) { return v; });
      }
      q.rightText = 'Richtig! ' + c.capital + ' ist die Hauptstadt ' + M.von(c) + '.';
      q.wrongText = function (given) {
        var other = CUR.countries.filter(function (o) { return o.capital === given && o.id !== c.id; })[0];
        return 'Die Hauptstadt ' + M.von(c) + ' ist ' + c.capital + '.' + (other ? ' ' + given + ' liegt in ' + M.cn(other, 'dat') + '.' : '');
      };
      q.revealCapital = c.id;
      return q;
    }
    if (skill === 'rev') {
      q.prompt = c.capital + ' ist die Hauptstadt von welchem Land?';
      if (typed && Math.random() < 0.5) {
        q.kind = 'find'; q.sub = 'Tippe das Land auf der Karte an.'; q.map = { pick: 'country', layers: {}, target: it.mapId }; q.answer = it.mapId;
      } else if (typed) {
        q.kind = 'type'; q.answer = c.name; q.alts = c.alt; q.domain = M.domains.country; q.word = 'name:' + c.id; q.sub = 'Schreibe das Land.';
      } else {
        q.kind = 'choice'; q.answer = c.id;
        q.options = options(c.id, countryOpts(c, activeIds).filter(function (id) { return countryOf(id).capital; }), function (id) { return countryOf(id).name; });
      }
      q.rightText = 'Richtig! ' + c.capital + ' liegt in ' + M.cn(c, 'dat') + ' ' + it.icon + '.';
      q.wrongText = function () { return c.capital + ' ist die Hauptstadt ' + M.von(c) + '.'; };
      q.revealCapital = c.id;
      return q;
    }
    return null;
  }

  // ---------------------------------------------------------------- seas, rivers, mountains, islands, places
  var FIND_VERB = { sea: 'Wo liegt', river: 'Zeige', mountain: 'Wo liegen', island: 'Wo liegt', place: 'Wo liegt' };
  function featureQ(it, skill, ctx) {
    var f = it.ref, q = { item: it.key, skill: skill }, type = f.type;
    var layer = {}; layer[type] = true;
    var same = CUR.features.filter(function (o) { return o.type === type && o.id !== f.id; }).map(function (o) { return o.id; });
    if (skill === 'ort') {
      q.kind = 'find'; q.map = { pick: type, layers: layer, target: it.mapId };
      q.answer = it.mapId;
      if (type === 'river') q.prompt = 'Zeige ' + M.withArt(f, 'akk') + '.';
      else if (type === 'mountain') q.prompt = (f.article === 'die' ? 'Wo liegen ' : 'Wo liegt ') + M.withArt(f) + '?';
      else q.prompt = 'Wo liegt ' + M.withArt(f) + '?';
      q.sub = { sea: 'Tippe das Meer an.', river: 'Tippe den Fluss an.', mountain: 'Tippe das Gebirge an.', island: 'Tippe die Insel an.', place: 'Tippe den richtigen Punkt an.' }[type];
      q.rightText = 'Richtig! ' + it.icon + ' ' + f.name;
      q.after = f.fact;
      return q;
    }
    if (skill === 'name') {
      var what = { sea: 'Welches Meer ist markiert?', river: 'Welcher Fluss ist markiert?', mountain: 'Welches Gebirge ist markiert?',
                   island: 'Welche Insel ist markiert?', place: 'Welcher Ort ist markiert?' }[type];
      q.prompt = what; q.map = { highlight: [it.mapId], layers: layer, zoomTo: type === 'island' || type === 'place' ? it.mapId : null };
      if (ctx.typed) {
        q.kind = 'type'; q.answer = f.name; q.alts = f.alt; q.domain = M.domains.feature; q.word = 'feat:' + f.id; q.sub = 'Schreibe den Namen.';
      } else {
        q.kind = 'choice'; q.answer = f.id;
        q.options = options(f.id, shuffle(same), function (id) { return CUR.features.filter(function (o) { return o.id === id; })[0].name; });
      }
      q.rightText = 'Richtig! ' + it.icon + ' ' + f.name;
      q.wrongText = function () { return 'Das ist ' + M.withArt(f) + '.'; };
      q.after = f.fact;
      return q;
    }
    return null;
  }

  // ---------------------------------------------------------------- facts
  function factQ(it) {
    var w = it.ref;
    return { item: it.key, skill: 'wissen', kind: 'choice', prompt: w.q, answer: w.a,
             options: shuffle([w.a].concat(w.opts)).map(function (v) { return { value: v, label: v }; }),
             map: w.show ? { highlight: w.show.map(function (id) { var f = M.feature(id); return f ? f.mapId : null; }).filter(Boolean), layers: layersFor(w.show) } : null,
             rightText: 'Richtig! ' + cap(w.a) + '.', wrongText: function () { return 'Richtig ist: ' + w.a + '.'; }, after: w.note || '' };
  }
  function layersFor(ids) {
    var l = {}; (ids || []).forEach(function (id) { var f = M.feature(id); if (f) l[f.type] = true; }); return l;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function make(it, skill, ctx) {
    ctx = ctx || {};
    if (it.kind === 'country') return countryQ(it, skill, ctx);
    if (it.kind === 'feature') return featureQ(it, skill, ctx);
    if (it.kind === 'fact') return factQ(it);
    return null;
  }

  // Spelling task for one word (Schreibtraining / Hören & Schreiben)
  function spellQ(w, listen) {
    return { kind: listen ? 'listen' : 'spell', word: w.key, answer: w.word, alts: w.alts, syl: w.syl, speak: w.say,
             prompt: listen ? 'Hör gut zu und schreibe:' : 'Wie schreibt man das?', what: w.what, item: w.item };
  }

  root.ET.questions = { make: make, spellQ: spellQ, shuffle: shuffle, pick: pick, layersFor: layersFor };
})(typeof window !== 'undefined' ? window : globalThis);
