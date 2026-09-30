/* node tests/logic.test.js — curriculum, progression, study plan, sessions, mock exam */
'use strict';
global.window = global;
['data/curriculum.js', 'data/map.js', 'js/spelling.js', 'js/model.js', 'js/progress.js', 'js/questions.js', 'js/session.js'].forEach(function (f) { require('../' + f); });
var M = ET.model, fails = 0, n = 0;
function ok(c, msg) { n++; if (!c) { fails++; console.log('FAIL', msg); } }
function mem() { var m = {}; return { persistent: true, read: function (k) { return m[k] || null; }, write: function (k, v) { m[k] = v; } }; }

// ---- data sanity
var C = ET.curriculum;
ok(C.countries.filter(function (c) { return c.tier === 'core'; }).length === 37, '37 core countries');
ok(C.features.filter(function (f) { return f.type === 'river'; }).length === 6, '6 rivers (M4 1–6)');
ok(C.features.filter(function (f) { return f.type === 'sea'; }).length === 8, '7 seas + Nordpolarmeer');
ok(C.features.filter(function (f) { return f.type === 'mountain'; }).length === 8, '8 mountain ranges (M4 A–H)');
ok(C.features.filter(function (f) { return f.type === 'island'; }).length === 9, '9 islands (M4 1–9)');
var ids = {}; M.items.forEach(function (it) { ok(!ids[it.key], 'unique key ' + it.key); ids[it.key] = 1; ok(M.groupOf[it.group], 'group exists for ' + it.key); });
M.items.forEach(function (it) {
  if (it.kind === 'fact') return;
  var all = [].concat(ET_MAP.countries.map(function (c) { return c.id; }), ET_MAP.seas.map(function (x) { return x.id; }), ET_MAP.rivers.map(function (x) { return x.id; }),
    ET_MAP.mountains.map(function (x) { return x.id; }), ET_MAP.islands.map(function (x) { return x.id; }), ET_MAP.places.map(function (x) { return x.id; }));
  ok(all.indexOf(it.mapId) >= 0, 'map shape for ' + it.mapId);
});
M.words.forEach(function (w) { ok(w.syl.replace(/-/g, '') === w.word || w.syl === '', 'syllables spell the word: ' + w.word + ' / ' + w.syl); });

// ---- every question type builds and is answerable
var pr = new ET.Progress('t', mem());
Object.keys(pr.doc.intro); M.groups.forEach(function (g) { pr.doc.intro[g.id] = 1; });
pr.doc.settings.cats.extra = true;
M.items.forEach(function (it) {
  it.skills.forEach(function (sk) {
    [false, true].forEach(function (typed) {
      var q = ET.questions.make(it, sk, { typed: typed, activeIds: {} });
      ok(q && q.prompt, 'question ' + it.key + ' ' + sk);
      if (q.kind === 'choice') {
        var vals = q.options.map(function (o) { return o.value; });
        ok(vals.indexOf(q.answer) >= 0, 'answer among options ' + it.key + ' ' + sk);
        ok(vals.length >= 3 && new Set(vals).size === vals.length, 'options ok ' + it.key + ' ' + sk + ' ' + vals);
      }
      if (q.kind === 'type') ok(ET.spelling.classify(q.answer, q.answer, { alts: q.alts, domain: q.domain }).verdict === 'right', 'own answer accepted ' + q.answer);
    });
  });
});

// ---- progression: SEE → FIND → NAME → REMEMBER → WRITE
pr = new ET.Progress('t2', mem());
var polen = M.country('polen');
ok(!pr.unlocked(polen, 'ort'), 'nothing before intro');
pr.markIntro('mitte');
ok(pr.unlocked(polen, 'ort') && !pr.unlocked(polen, 'name'), 'after intro: only find');
pr.record({ item: polen.key, skill: 'ort', ok: true });
ok(pr.unlocked(polen, 'name') && !pr.unlocked(polen, 'cap'), 'then name');
ok(!pr.typed(polen, 'name'), 'name by choice first');
pr.record({ item: polen.key, skill: 'name', ok: true }); pr.record({ item: polen.key, skill: 'name', ok: true });
ok(pr.typed(polen, 'name'), 'then typed');
ok(pr.unlocked(polen, 'cap') && !pr.unlocked(polen, 'rev'), 'then capital');

// ---- knowledge vs spelling in the records
var slo = M.country('slowenien'); pr.markIntro('suedost');
pr.record({ item: slo.key, skill: 'cap', ok: true, verdict: 'known', word: 'cap:slowenien' });
ok(pr.stat(slo.key, 'cap').ok === 1, '"known" counts as geography right');
ok(pr.wordStat('cap:slowenien').miss === 1, '…and as a spelling miss');
ok(pr.spellQueue(3)[0].key === 'cap:slowenien', 'misspelled word first in Schreibtraining');
ok(pr.problems(7).some(function (p) { return p.kind === 'word' && p.word.key === 'cap:slowenien'; }), 'problem list has the spelling');

// ---- study plan: simulate daily practice until the exam
var start = new Date('2026-09-30T16:00:00').getTime(), day = 86400e3;
pr = new ET.Progress('t3', mem());
var realNow = Date.now; var fake = start;
Date.now = function () { return fake; };
var introDays = {}, doneAt = null;
for (var d = 0; d < 36; d++) {
  fake = start + d * day;
  var s = ET.session.create(pr, { mode: 'heute' });
  var steps = 0, step;
  while ((step = s.next()) && steps < 80) {
    steps++;
    if (step.kind === 'intro') continue;
    var good = Math.random() < 0.8;
    s.record(step, { ok: good, verdict: good ? 'right' : 'wrong', usedHelp: false });
  }
  ok(steps <= 45, 'day ' + d + ': session not too long (' + steps + ')');
  s.newGroups.forEach(function (g) { introDays[g] = d; });
  if (!pr.pendingGroups().length && doneAt === null) doneAt = d;
}
Date.now = realNow;
ok(doneAt !== null && doneAt <= 29, 'all core groups introduced a week before the exam (day ' + doneAt + ')');
ok(Object.keys(introDays).indexOf('extra') < 0, 'extras not introduced by default');
var perDay = {}; Object.keys(introDays).forEach(function (g) { perDay[introDays[g]] = (perDay[introDays[g]] || 0) + 1; });
ok(Object.keys(perDay).every(function (k) { return perDay[k] <= 2; }), 'never more than 2 new groups a day ' + JSON.stringify(perDay));
ok(introDays.mitte === 0, 'starts with Mitteleuropa');

// ---- mistakes come back sooner than known items
var p4 = new ET.Progress('t4', mem()); p4.markIntro('mitte'); var nowT = Date.now();
var dtl = M.country('deutschland'), at = M.country('oesterreich');
for (var i = 0; i < 4; i++) p4.record({ item: dtl.key, skill: 'ort', ok: true }, nowT - (5 - i) * day);
p4.record({ item: at.key, skill: 'ort', ok: false }, nowT - day);
ok(p4.weight(at, 'ort', nowT) > p4.weight(dtl, 'ort', nowT) * 2, 'weak item weighs clearly more');

// ---- mock exam: parts A–E, 22 questions, only core
var p5 = new ET.Progress('t5', mem()); p5.doc.settings.cats.extra = true;
var ex = ET.session.create(p5, { mode: 'exam' });
var parts = {}, q, cnt = 0;
while ((q = ex.next())) { cnt++; parts[q.part] = (parts[q.part] || 0) + 1; ok(M.byKey[q.item].tier === 'core', 'exam only core: ' + q.item); ex.record(q, { ok: true, verdict: 'right' }); }
ok(cnt === 22, 'exam has 22 questions (' + cnt + ')');
ok(parts.A === 5 && parts.B === 5 && parts.C === 5 && parts.D === 4 && parts.E === 3, 'parts ' + JSON.stringify(parts));
ok(ex.summary().right === 22, 'score counted');

// ---- parent switches
var p6 = new ET.Progress('t6', mem()); p6.doc.settings.cats.fluesse = false;
ok(!p6.activeItems().some(function (it) { return it.type === 'river'; }), 'rivers can be switched off');
p6.doc.settings.off['c:polen'] = true;
ok(!p6.activeItems().some(function (it) { return it.key === 'c:polen'; }), 'single items can be switched off');

console.log((n - fails) + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
