/*
 * session.js — rounds of practice. No DOM.
 *
 *   var s = ET.session.create(progress, { mode: 'heute' });
 *   s.next()            → next step (question, intro card or spelling task) or null when done
 *   s.record(q, result) → result = { ok, verdict } — stores progress, returns feedback extras
 *   s.summary()
 *
 * Modes
 *   heute     the daily plan: a little new material (whole small group), spaced repetition,
 *             weak spots, 2–3 spelling words. ~10 minutes (brief §25).
 *   ort | name | cap        Wo liegt …? / Welches Land? / Hauptstädte
 *   physisch  Europa entdecken (opts.types = ['sea', …])
 *   wissen    Das muss ich wissen (quiz)
 *   problem   Meine Problemstellen
 *   spell | listen          Schreibtraining / Hören & Schreiben
 *   exam      Prüfung üben (Teil A–E, no feedback until the end)
 */
(function (root) {
  'use strict';
  var M = root.ET.model, Q = root.ET.questions;

  function create(pr, opts) {
    opts = opts || {};
    var mode = opts.mode || 'heute', now = function () { return Date.now(); };
    var s = { mode: mode, startedAt: Date.now(), asked: [], askedItems: [], wrong: {}, results: [], queue: [], tail: [],
              limit: opts.limit || 20, newGroups: [], streak: 0, bestStreak: 0, opts: opts };
    var activeIds = {};
    pr.activeItems().forEach(function (it) { if (it.kind === 'country') activeIds[it.id] = true; });

    function introduce(groupId, withQuestions) {
      var items = pr.activeItems().filter(function (it) { return it.group === groupId && it.kind !== 'fact'; });
      if (!items.length) return;
      s.newGroups.push(groupId);
      items.forEach(function (it) { s.queue.push({ kind: 'intro', item: it.key, group: groupId }); });
      if (withQuestions) {
        Q.shuffle(items).forEach(function (it) { s.queue.push({ plan: true, item: it.key, skill: 'ort' }); });
        Q.shuffle(items).forEach(function (it) { s.queue.push({ plan: true, item: it.key, skill: 'name' }); });
      }
    }

    // Which item-skills may this mode ask?
    function candidates() {
      var list = [], t = now();
      pr.activeItems().forEach(function (it) {
        if (!pr.isIntroduced(it)) return;
        it.skills.forEach(function (sk) {
          if (!M.skillActive(it, sk, pr.settings())) return;
          var ok;
          if (mode === 'heute' || mode === 'problem') ok = pr.unlocked(it, sk);
          else if (mode === 'ort') ok = it.kind === 'country' && sk === 'ort';
          else if (mode === 'name') ok = it.kind === 'country' && sk === 'name';
          else if (mode === 'cap') ok = it.kind === 'country' && (sk === 'cap' || sk === 'rev');
          else if (mode === 'physisch') ok = it.kind === 'feature' && (!opts.types || opts.types.indexOf(it.type) >= 0) && (sk === 'ort' || pr.unlocked(it, sk));
          else if (mode === 'wissen') ok = it.kind === 'fact';
          if (ok) list.push({ it: it, sk: sk, w: pr.weight(it, sk, t, s) });
        });
      });
      if (mode === 'problem' && s.problemKeys) list = list.filter(function (c) { return s.problemKeys[c.it.key + '|' + c.sk]; });
      return list;
    }

    // ------------------------------------------------ plan the start of the round
    if (mode === 'heute') {
      var phase = pr.phase();
      var n = pr.newGroupsToday();
      pr.pendingGroups().slice(0, n).forEach(function (g) { introduce(g.id, true); });
      // ~10 minutes: planned new-material questions + repetition (more repetition near the exam)
      var planned = s.queue.filter(function (x) { return x.plan; }).length;
      s.limit = planned + (planned ? 12 : (phase === 'lernen' ? 20 : 24));
      pr.spellQueue(phase === 'endspurt' ? 2 : 3).forEach(function (w, i) { s.tail.push(Q.spellQ(w, i === 1)); });
    } else if (mode === 'problem') {
      s.problems = pr.problems(7);
      s.problemKeys = {};
      s.problems.forEach(function (p) {
        if (p.kind === 'skill') s.problemKeys[p.item.key + '|' + p.skill] = true;
        else s.tail.push(Q.spellQ(p.word, false));
      });
      s.limit = Math.min(20, Object.keys(s.problemKeys).length * 2);
    } else if (mode === 'spell' || mode === 'listen') {
      pr.spellQueue(opts.limit || 8).forEach(function (w) { s.queue.push(Q.spellQ(w, mode === 'listen')); });
      s.limit = s.queue.length;
    } else if (mode === 'exam') {
      buildExam();
    } else {
      // A practice mode with too little introduced material: bring in the next group (with intro cards).
      var enough = candidates().length;
      var want = mode === 'physisch' ? 'feature' : mode === 'wissen' ? 'fact' : 'country';
      if (enough < 5 && want !== 'fact') {
        var next = pr.pendingGroups().filter(function (g) {
          return pr.activeItems().some(function (it) { return it.group === g.id && it.kind === want && (!opts.types || opts.types.indexOf(it.type) >= 0); });
        })[0];
        if (next) { introduce(next.id, false); pr.markIntro(next.id); }
      }
      s.limit = opts.limit || 12;
    }

    function buildExam() {
      var act = pr.activeItems().filter(function (it) { return it.tier === 'core'; });
      function pickN(list, n) {
        var intro = Q.shuffle(list.filter(function (it) { return pr.isIntroduced(it); }));
        var rest = Q.shuffle(list.filter(function (it) { return !pr.isIntroduced(it); }));
        return intro.concat(rest).slice(0, n);
      }
      var countries = act.filter(function (it) { return it.kind === 'country'; });
      var used = {};
      function take(list, n) { var out = pickN(list.filter(function (it) { return !used[it.key]; }), n); out.forEach(function (it) { used[it.key] = true; }); return out; }
      var A = take(countries, 5), B = take(countries.filter(function (it) { return it.ref.capital; }), 5), Cc = take(countries, 5);
      var D = pickN(act.filter(function (it) { return it.kind === 'feature' && it.type !== 'place'; }), 4);
      var E = pickN(act.filter(function (it) { return it.kind === 'fact'; }), 3);
      function add(part, title, it, skill, typed) {
        var q = Q.make(it, skill, { typed: typed, activeIds: activeIds });
        q.part = part; q.partTitle = title; q.exam = true;
        if (skill === 'cap') { q.map = null; q.kind = 'type'; q.answer = it.ref.capital; q.alts = it.ref.capAlt; q.domain = M.domains.capital; q.word = 'cap:' + it.id; q.prompt = 'Schreibe die Hauptstadt ' + M.von(it.ref) + '.'; }
        s.queue.push(q);
      }
      A.forEach(function (it) { add('A', 'Länder', it, 'name', true); });
      B.forEach(function (it) { add('B', 'Hauptstädte', it, 'cap', true); });
      Cc.forEach(function (it) { add('C', 'Karte', it, 'ort', false); });
      D.forEach(function (it) { add('D', 'Gewässer und Gebirge', it, 'name', true); });
      E.forEach(function (it) { add('E', 'Europa-Wissen', it, 'wissen', false); });
      s.limit = s.queue.length;
    }

    // ------------------------------------------------ stepping
    s.done = function () {
      if (s.queue.length) return false;
      if (mode === 'exam' || mode === 'spell' || mode === 'listen') return true;
      return s.asked.length >= s.limit && !s.tail.length;
    };
    s.next = function () {
      if (s.queue.length) {
        var step = s.queue.shift();
        if (step.kind === 'intro') { pr.markSeen(step.item); if (step.group) pr.markIntro(step.group); return step; }
        if (step.plan) return build(M.byKey[step.item], step.skill) || s.next();
        return step;
      }
      if (s.asked.length < s.limit) {
        var list = candidates().filter(function (c) { return c.w > 0; });
        if (list.length) {
          var tot = list.reduce(function (a, c) { return a + c.w; }, 0), r = Math.random() * tot, ch = list[list.length - 1];
          for (var i = 0; i < list.length; i++) { r -= list[i].w; if (r <= 0) { ch = list[i]; break; } }
          var q = build(ch.it, ch.sk);
          if (q) return q;
        }
        s.limit = s.asked.length;       // nothing left to ask
      }
      if (s.tail.length) return s.tail.shift();
      return null;
    };
    function build(it, sk) {
      var typed = pr.typed(it, sk);
      if (mode === 'name' && opts.answer === 'choice') typed = false;
      if (mode === 'name' && opts.answer === 'type') typed = true;
      if (mode === 'cap' && opts.answer === 'choice') typed = false;
      if (mode === 'cap' && (opts.answer === 'type' || opts.answer === 'listen')) typed = true;
      var listen = mode === 'cap' && opts.answer === 'listen' && sk === 'cap';
      if (mode === 'heute' && sk === 'cap' && typed && Math.random() < 0.25) listen = true;
      var q = Q.make(it, sk, { typed: typed, listen: listen, activeIds: activeIds });
      if (q && !pr.doc.seen[it.key] && !pr.doc.intro[it.group]) q.firstTime = true;
      return q;
    }

    // result = { ok, verdict, given, tries }
    s.record = function (q, result) {
      var extra = {};
      if (q.kind === 'intro') return extra;
      if (q.kind === 'spell' || q.kind === 'listen' && !q.skill) {
        pr.recordWord(q.word, result.ok, result.usedHelp, q.kind === 'listen');
        s.results.push({ q: q, ok: result.ok && !result.usedHelp, verdict: result.verdict, spelling: true });
        return extra;
      }
      var key = q.item + '|' + q.skill;
      s.asked.push(key); s.askedItems.push(q.item);
      if (!result.ok) s.wrong[key] = s.asked.length; else delete s.wrong[key];
      var r = pr.record({ item: q.item, skill: q.skill, ok: result.ok, verdict: result.verdict, word: q.word, mode: mode });
      s.results.push({ q: q, ok: result.ok, verdict: result.verdict, given: result.given });
      if (result.ok) { s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); } else s.streak = 0;
      extra.comeback = r.comeback;
      extra.streak = s.streak;
      return extra;
    };

    s.summary = function () {
      var qs = s.results.filter(function (r) { return !r.spelling; });
      var right = qs.filter(function (r) { return r.ok; }).length;
      var known = s.results.filter(function (r) { return r.verdict === 'known'; });
      var good = {}, practise = {}, spellList = {};
      s.results.forEach(function (r) {
        var it = M.byKey[r.q.item]; if (!it) return;
        var label = resultLabel(r.q, it);
        if (r.spelling) { if (!r.ok) spellList[r.q.answer] = true; return; }
        if (r.ok) { if (!practise[label]) good[label] = true; } else { practise[label] = true; delete good[label]; }
        if (r.verdict === 'known' && r.q.answer) spellList[r.q.answer] = true;
      });
      return { mode: mode, total: qs.length, right: right, known: known.length, spelling: s.results.length - qs.length,
               good: Object.keys(good), practise: Object.keys(practise), spell: Object.keys(spellList),
               newGroups: s.newGroups, bestStreak: s.bestStreak, startedAt: s.startedAt, endedAt: Date.now(),
               parts: partScores() };
    };
    function partScores() {
      if (mode !== 'exam') return null;
      var out = {};
      s.results.forEach(function (r) { var p = r.q.part; if (!p) return; var o = out[p] || (out[p] = { title: r.q.partTitle, n: 0, ok: 0 }); o.n++; if (r.ok) o.ok++; });
      return out;
    }
    s.finish = function () {
      var sum = s.summary();
      pr.addSession({ mode: mode, startedAt: sum.startedAt, endedAt: sum.endedAt, total: sum.total, right: sum.right, known: sum.known, newGroups: sum.newGroups });
      return sum;
    };
    return s;
  }

  function resultLabel(q, it) {
    if (it.kind === 'country') {
      var c = it.ref;
      if (q.skill === 'cap' || q.skill === 'rev') return c.name + ' → ' + c.capital;
      return c.name;
    }
    if (it.kind === 'feature') return it.name;
    return it.ref.q.replace(/\?$/, '');
  }

  root.ET.session = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
