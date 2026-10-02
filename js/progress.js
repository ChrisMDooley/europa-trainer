/*
 * progress.js — what Lukas knows, what comes next. No DOM.
 *
 * Storage: one JSON document per child at  europa-trainer:<childId>  (localStorage).
 *   skills  { "c:polen|ort": Stat }        one stat per item + skill
 *   words   { "cap:slowenien": Stat }      spelling per word (+ .miss = misspellings)
 *   hear    { "cap:slowenien": Stat }      listening + writing per word
 *   intro   { groupId: timestamp }         groups already introduced
 *   seen    { itemKey: timestamp }         intro card shown (for items met outside the plan)
 *   log     [Answer]                       last answers (capped), each with an id
 *   sessions[Session]                      finished rounds
 *   settings{ cats, off, examDate, voice, slowRate, font }
 *
 *   Stat { n, ok, box 0…5, due, last, recent:[1,0,…], lastWrongDay, lastRightDay }
 *
 * Simple spaced repetition (brief §14): right → one box up (only when due, or while still
 * new), wrong → two boxes down. Next due after 0 / 10 min / 20 h / 2 / 4 / 8 days.
 * "sicher" = box ≥ 3 and the last answer was right.
 */
(function (root) {
  'use strict';
  var M = root.ET.model, CUR = root.ET.curriculum;
  var MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var INTERVAL = [0, 10 * MIN, 20 * HOUR, 2 * DAY, 4 * DAY, 8 * DAY];
  var PREFIX = 'europa-trainer:';

  function uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function adapter() {
    var ok = false, mem = {};
    try { root.localStorage.setItem('__et', '1'); root.localStorage.removeItem('__et'); ok = true; } catch (e) { ok = false; }
    return {
      persistent: ok,
      read: function (k) { try { return ok ? root.localStorage.getItem(k) : (mem[k] || null); } catch (e) { return mem[k] || null; } },
      write: function (k, v) { try { if (ok) root.localStorage.setItem(k, v); else mem[k] = v; } catch (e) { mem[k] = v; } }
    };
  }

  function emptyDoc(childId) {
    return { schema: 1, childId: childId, createdAt: Date.now(), skills: {}, words: {}, hear: {}, intro: {}, seen: {},
             log: [], sessions: [], settings: { cats: {}, off: {}, examDate: CUR.examDate, slowRate: 0.6, voice: '', font: 'atkinson' } };
  }

  function Progress(childId, ad) {
    this.childId = childId;
    this.ad = ad || adapter();
    this.key = PREFIX + childId;
    var raw = this.ad.read(this.key), d = null;
    try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
    var base = emptyDoc(childId);
    if (!d) d = base;
    for (var k in base) if (!(k in d)) d[k] = base[k];
    for (k in base.settings) if (!(k in d.settings)) d.settings[k] = base.settings[k];
    this.doc = d;
  }
  var P = Progress.prototype;
  P.save = function () { this.ad.write(this.key, JSON.stringify(this.doc)); };
  P.settings = function () { return this.doc.settings; };

  // ---------------------------------------------------------------- stats
  function newStat() { return { n: 0, ok: 0, box: 0, due: 0, last: 0, recent: [], lastWrongDay: '', lastRightDay: '' }; }
  function bump(s, ok, now) {
    s.n++; if (ok) s.ok++;
    s.recent.push(ok ? 1 : 0); if (s.recent.length > 6) s.recent.shift();
    var wasWrongBefore = s.lastWrongDay && s.lastWrongDay !== dayKey(now) && s.recent.length >= 2 && s.recent[s.recent.length - 2] === 0;
    if (ok) {
      if (now >= s.due || s.box < 2) s.box = Math.min(5, s.box + 1);
      s.lastRightDay = dayKey(now);
    } else {
      s.box = Math.max(0, s.box - 2);
      s.lastWrongDay = dayKey(now);
    }
    s.due = now + INTERVAL[s.box];
    s.last = now;
    return { comeback: ok && wasWrongBefore };        // "Das konntest du gestern noch nicht!"
  }
  P.stat = function (itemKey, skill) { return this.doc.skills[itemKey + '|' + skill] || null; };
  P.wordStat = function (wordKey) { return this.doc.words[wordKey] || null; };
  P.hearStat = function (wordKey) { return this.doc.hear[wordKey] || null; };

  // Record an answer. a = { item, skill, ok, verdict, word, mode, q }
  //   verdict 'known' = geography right, spelling wrong → skill right, word spelling wrong.
  P.record = function (a, now) {
    now = now || Date.now();
    var res = {};
    if (a.item && a.skill) {
      var k = a.item + '|' + a.skill, s = this.doc.skills[k] || (this.doc.skills[k] = newStat());
      res = bump(s, !!a.ok, now);
    }
    if (a.word && (a.verdict === 'right' || a.verdict === 'known')) {
      var w = this.doc.words[a.word] || (this.doc.words[a.word] = newStat());
      bump(w, a.verdict === 'right', now);
      if (a.verdict === 'known') w.miss = (w.miss || 0) + 1;
    }
    this.doc.log.push({ id: uid('a'), ts: now, item: a.item || null, skill: a.skill || null, word: a.word || null,
                        ok: !!a.ok, verdict: a.verdict || (a.ok ? 'right' : 'wrong'), mode: a.mode || '', q: a.q || '' });
    if (this.doc.log.length > 2000) this.doc.log = this.doc.log.slice(-2000);
    this.save();
    return res;
  };
  // Spelling / listening practice of one word. usedHelp = a hint or the model was shown.
  P.recordWord = function (wordKey, right, usedHelp, listening, now) {
    now = now || Date.now();
    var store = listening ? this.doc.hear : this.doc.words;
    var s = store[wordKey] || (store[wordKey] = newStat());
    var clean = right && !usedHelp;
    bump(s, clean, now);
    if (!clean) s.miss = (s.miss || 0) + 1;
    if (listening) {                                   // listening also trains the spelling of the word
      var w = this.doc.words[wordKey] || (this.doc.words[wordKey] = newStat());
      bump(w, clean, now); if (!clean) w.miss = (w.miss || 0) + 1;
    }
    this.doc.log.push({ id: uid('a'), ts: now, word: wordKey, ok: clean, verdict: clean ? 'right' : 'known', mode: listening ? 'hoeren' : 'schreiben' });
    this.save();
  };
  P.markIntro = function (groupId, now) { if (!this.doc.intro[groupId]) { this.doc.intro[groupId] = now || Date.now(); this.save(); } };
  P.markSeen = function (itemKey, now) { if (!this.doc.seen[itemKey]) { this.doc.seen[itemKey] = now || Date.now(); this.save(); } };
  P.addSession = function (s) { s.id = s.id || uid('s'); this.doc.sessions.push(s); this.save(); return s; };
  P.reset = function () { var st = this.doc.settings; this.doc = emptyDoc(this.childId); this.doc.settings = st; this.save(); };

  // ---------------------------------------------------------------- mastery
  function secure(s) { return !!s && s.box >= 3 && s.recent[s.recent.length - 1] === 1; }
  function level(s) {                                  // for the parent overview
    if (!s || !s.n) return 'neu';
    if (secure(s)) return 'sicher';
    var r = s.recent.slice(-3), ok = r.filter(function (x) { return x; }).length;
    return s.box >= 2 && ok >= 2 ? 'fast' : 'ueben';
  }
  function strength(s) {                               // 0…1, recent answers weigh most
    if (!s || !s.n) return 0;
    var w = [1, 1.3, 1.7, 2.2, 2.9, 3.7], off = w.length - s.recent.length, num = 0, den = 0;
    s.recent.forEach(function (x, i) { num += w[off + i] * x; den += w[off + i]; });
    return (num / den) * Math.min(1, 0.4 + s.box * 0.15);
  }
  P.secure = function (k, sk) { return secure(this.stat(k, sk)); };

  // ---------------------------------------------------------------- what is open to practise
  P.activeItems = function () {
    var st = this.doc.settings;
    return M.items.filter(function (it) { return M.isActive(it, st); });
  };
  P.introducedGroups = function () {
    var intro = this.doc.intro;
    return M.groups.filter(function (g) { return intro[g.id]; }).map(function (g) { return g.id; });
  };
  P.isIntroduced = function (it) { return !!(this.doc.intro[it.group] || this.doc.seen[it.key]); };
  // Is this skill of this item open? (SEE → FIND → NAME → REMEMBER)
  P.unlocked = function (it, skill) {
    if (!M.skillActive(it, skill, this.doc.settings)) return false;
    if (!this.isIntroduced(it)) return false;
    if (it.kind === 'fact') return true;
    var box = function (sk) { var s = this.stat(it.key, sk); return s ? s.box : 0; }.bind(this);
    if (skill === 'ort') return true;
    if (skill === 'name') return box('ort') >= 1;
    if (skill === 'cap') return box('name') >= 1;
    if (skill === 'rev') return box('cap') >= 1;
    return false;
  };
  // Should the question be typed (true) or multiple choice (false)?
  P.typed = function (it, skill) {
    var s = this.stat(it.key, skill);
    return !!s && s.box >= 2;
  };

  // Lottery weight of one item-skill for the next question (higher = sooner).
  var BOX_W = [9, 6, 4, 2.2, 1, 0.5];
  P.weight = function (it, skill, now, sess) {
    var s = this.stat(it.key, skill), w;
    if (!s || !s.n) w = 5;
    else {
      w = BOX_W[s.box];
      if (s.due <= now && s.box >= 1) w *= 1.5;
      if (s.due > now && s.box >= 2) w *= 0.3;
      if (s.recent.slice(-3).filter(function (x) { return !x; }).length >= 2) w *= 1.6;
    }
    if (it.tier === 'extra') w *= 0.5;
    if (sess) {
      var key = it.key + '|' + skill, idx = sess.asked.lastIndexOf(key), n = sess.asked.length;
      var sameItem = sess.askedItems.lastIndexOf(it.key);
      if (idx >= 0 && n - idx <= 3) return 0;            // rest a little
      if (sameItem >= 0 && n - sameItem <= 1) w *= 0.2;  // not the same country twice in a row
      if (key in sess.wrong) w *= (n - sess.wrong[key] >= 3) ? 4 : 0;   // mistakes come back soon, not at once
      else if (idx >= 0) w *= 0.3;
    }
    return w;
  };

  // ---------------------------------------------------------------- study plan (brief §25)
  P.examDate = function () { return this.doc.settings.examDate || CUR.examDate; };
  P.daysLeft = function (now) {
    var d = this.examDate(); if (!d) return null;
    var t = new Date(d + 'T08:00:00'), n = new Date(now || Date.now());
    return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / DAY);
  };
  P.pendingGroups = function () {
    var self = this, st = this.doc.settings;
    return M.groups.filter(function (g) {
      if (self.doc.intro[g.id]) return false;
      return M.items.some(function (it) { return it.group === g.id && M.isActive(it, st) && it.kind !== 'fact'; });
    });
  };
  // Are the groups introduced so far "sitting" well enough to add a new one?
  P.readyForNew = function () {
    var self = this, st = this.doc.settings, total = 0, good = 0;
    M.items.forEach(function (it) {
      if (it.kind === 'fact' || !self.doc.intro[it.group] || !M.isActive(it, st)) return;
      total++;
      var s = self.stat(it.key, 'ort'), n = self.stat(it.key, 'name');
      if (s && s.box >= 2 && (!n || n.box >= 1)) good++;
    });
    return total === 0 || good / total >= 0.6;
  };
  // How many new groups today?
  P.newGroupsToday = function (now) {
    var pending = this.pendingGroups().length;
    if (!pending) return 0;
    var days = this.daysLeft(now);
    if (days == null) return this.readyForNew() ? 1 : 0;
    var introToday = Object.keys(this.doc.intro).filter(function (g) { return dayKey(this.doc.intro[g]) === dayKey(now || Date.now()); }, this).length;
    var daysForNew = Math.max(1, days - 6);               // last week: no new material if possible
    var perDay = pending / daysForNew;
    var n = perDay > 1.5 ? 2 : perDay > 0.9 ? 1 : (this.readyForNew() ? 1 : 0);
    if (!this.introducedGroups().length) n = Math.max(n, 1);
    return Math.max(0, Math.min(n, 2) - introToday);
  };
  P.phase = function (now) {
    var d = this.daysLeft(now);
    if (d == null) return 'lernen';
    if (d < 0) return 'danach';
    if (d <= 3) return 'endspurt';
    if (d <= 7) return 'wiederholen';
    return 'lernen';
  };

  // ---------------------------------------------------------------- overview for parent + child (brief §16/§22)
  P.overview = function () {
    var self = this, st = this.doc.settings;
    var core = M.items.filter(function (it) { return it.tier === 'core' && M.isActive(it, st); });
    function count(filter, skill) {
      var list = core.filter(filter), sure = 0, seen = 0;
      list.forEach(function (it) { var s = self.stat(it.key, skill); if (s && s.n) seen++; if (secure(s)) sure++; });
      return { sure: sure, seen: seen, total: list.length };
    }
    var isC = function (it) { return it.kind === 'country'; };
    var isF = function (it) { return it.kind === 'feature'; };
    var isW = function (it) { return it.kind === 'fact'; };
    var capC = function (it) { return it.kind === 'country' && it.ref.capital; };
    function merge(a, b) { return { sure: a.sure + b.sure, seen: a.seen + b.seen, total: a.total + b.total }; }
    var coreWords = M.words.filter(function (w) { var it = M.byKey[w.item]; return it.tier === 'core' && M.isActive(it, st); });
    var spell = { sure: 0, seen: 0, total: coreWords.length }, hear = { sure: 0, seen: 0, total: coreWords.length };
    coreWords.forEach(function (w) {
      var s = self.doc.words[w.key], h = self.doc.hear[w.key];
      if (s && s.n) spell.seen++; if (secure(s)) spell.sure++;
      if (h && h.n) hear.seen++; if (secure(h)) hear.sure++;
    });
    return [
      { id: 'karte', label: 'Karte (Länder finden)', v: count(isC, 'ort') },
      { id: 'laender', label: 'Länder erkennen', v: count(isC, 'name') },
      { id: 'hauptstadt', label: 'Land → Hauptstadt', v: count(capC, 'cap') },
      { id: 'rueck', label: 'Hauptstadt → Land', v: count(capC, 'rev') },
      { id: 'physisch', label: 'Meere, Flüsse, Gebirge, Inseln', v: merge(count(isF, 'ort'), count(isF, 'name')) },
      { id: 'wissen', label: 'Europa-Wissen & Grenzen', v: count(isW, 'wissen') },
      { id: 'schreiben', label: 'Rechtschreibung', v: spell },
      { id: 'hoeren', label: 'Hören & Schreiben', v: hear }
    ];
  };

  // Things to practise, most urgent first (brief §15). Only what was really tried and is weak.
  P.problems = function (limit) {
    var self = this, st = this.doc.settings, out = [];
    M.items.forEach(function (it) {
      if (!M.isActive(it, st)) return;
      it.skills.forEach(function (sk) {
        var s = self.stat(it.key, sk);
        if (!s || !s.n || secure(s)) return;
        var wrongs = s.recent.filter(function (x) { return !x; }).length;
        if (!wrongs) return;
        out.push({ kind: 'skill', item: it, skill: sk, score: strength(s) - wrongs * 0.1 });
      });
    });
    M.words.forEach(function (w) {
      var s = self.doc.words[w.key], it = M.byKey[w.item];
      if (!s || !s.miss || secure(s) || !M.isActive(it, st)) return;
      out.push({ kind: 'word', word: w, item: it, score: strength(s) - 0.05 * s.miss });
    });
    out.sort(function (a, b) { return a.score - b.score; });
    // one entry per item+skill, at most one spelling entry per word
    var seen = {}, res = [];
    out.forEach(function (p) {
      var k = p.kind === 'word' ? p.word.key : p.item.key + '|' + p.skill;
      if (seen[k]) return; seen[k] = true; res.push(p);
    });
    return res.slice(0, limit || 7);
  };
  P.problemLabel = function (p) {
    var it = p.item;
    if (p.kind === 'word') return '✏️ „' + p.word.word + '“ schreiben';
    if (it.kind === 'country') {
      var c = it.ref;
      if (p.skill === 'cap' || p.skill === 'rev') return it.icon + ' ' + c.name + ' → ' + c.capital;
      if (p.skill === 'ort') return it.icon + ' ' + c.name + ' auf der Karte';
      return it.icon + ' ' + c.name + ' erkennen';
    }
    if (it.kind === 'feature') return it.icon + ' ' + it.name;
    return '💡 ' + it.ref.q;
  };

  // Words for Schreibtraining: misspelled ones first, then hard words of introduced items.
  P.spellQueue = function (limit, now) {
    var self = this, st = this.doc.settings, out = [];
    now = now || Date.now();
    M.words.forEach(function (w) {
      var it = M.byKey[w.item];
      if (!M.isActive(it, st)) return;
      if (w.key.indexOf('cap:') === 0 && st.cats.hauptstaedte === false) return;
      var s = self.doc.words[w.key];
      var intro = self.isIntroduced(it);
      var score;
      if (s && s.miss && !secure(s)) score = 20 + s.miss * 2 - s.box * 2 + (s.due <= now ? 3 : 0);   // always above words not yet tried (max 6 + 5)
      else if (intro && (!s || !s.n) && w.diff >= 4) score = 6 + w.diff;
      else if (intro && s && !secure(s)) score = 4 - s.box + (s.due <= now ? 2 : 0);
      else if (intro && (!s || !s.n) && w.diff >= 3) score = 3 + w.diff * 0.5;
      else if (intro && s && s.due <= now) score = 1;
      else return;
      out.push({ word: w, score: score + Math.random() * 0.5 });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 5).map(function (x) { return x.word; });
  };

  // Newly "sicher" counts for gentle feedback ("Du kannst jetzt 18 von 37 Hauptstädten sicher.")
  P.secureCount = function (skill, kind) {
    var self = this, st = this.doc.settings, sure = 0, total = 0;
    M.items.forEach(function (it) {
      if (it.kind !== kind || it.tier !== 'core' || !M.isActive(it, st) || it.skills.indexOf(skill) < 0) return;
      total++; if (secure(self.stat(it.key, skill))) sure++;
    });
    return { sure: sure, total: total };
  };

  root.ET.Progress = Progress;
  root.ET.progressUtil = { secure: secure, level: level, strength: strength, dayKey: dayKey, uid: uid, INTERVAL: INTERVAL, adapter: adapter, PREFIX: PREFIX };
})(typeof window !== 'undefined' ? window : globalThis);
