/*
 * practice.js — shows one step at a time and gives feedback.
 *
 * Feedback philosophy (brief §5, §18):
 *   - finding on the map allows another try; a hint ring after the second miss
 *   - typed answers: right / "✓ Du kennst die richtige Antwort – Schreibweise üben" / not right
 *   - spelling practice teaches (hints, chunks, copy once), it never punishes
 *   - in the mock exam nothing is shown until the end
 */
(function (root) {
  'use strict';
  var U = root.ET.ui, h = U.h, M = root.ET.model, S = root.ET.spelling, MV = root.ET.mapview;
  var PRAISE = ['Richtig!', 'Super!', 'Genau!', 'Stimmt!', 'Klasse!'];

  function run(app, session, opts) {
    opts = opts || {};
    var exam = session.mode === 'exam';
    var view = h('section', { class: 'run' + (exam ? ' is-exam' : '') });
    var head = h('div', { class: 'run-head' });
    var title = h('div', { class: 'run-title', text: opts.title || '' });
    var count = h('div', { class: 'run-count' });
    var prog = h('div', { class: 'run-prog' }, [h('div', { class: 'run-prog-fill' })]);
    head.appendChild(h('div', { class: 'run-row' }, [title, count]));
    head.appendChild(prog);
    var body = h('div', { class: 'run-body' });
    view.appendChild(head); view.appendChild(body);
    app.setView(view, { back: true, onBack: function () { root.ET.speech.stop(); } });
    var stepNo = 0, current = null;
    var examAnswers = [];

    function total() { return session.queue.length + session.asked.length + session.tail.length + (exam ? 0 : Math.max(0, session.limit - session.asked.length)); }
    function next() {
      root.ET.speech.stop();
      var step = session.next();
      if (!step) return end();
      stepNo++;
      var tot = exam ? session.limit : Math.max(stepNo, stepNo + session.queue.length + session.tail.length + Math.max(0, session.limit - session.asked.length) - 1);
      count.textContent = exam ? 'Aufgabe ' + stepNo + ' von ' + session.limit : '';
      prog.firstChild.style.width = Math.min(100, Math.round((stepNo - 1) / Math.max(tot, 1) * 100)) + '%';
      body.innerHTML = '';
      current = step;
      if (step.kind === 'intro') return intro(step);
      if (step.kind === 'spell' || (step.kind === 'listen' && !step.skill)) return spell(step);
      return question(step);
    }

    // ------------------------------------------------------------ intro card (SEE)
    function intro(step) {
      var it = M.byKey[step.item];
      var map = MV.create({ layers: it.kind === 'feature' ? layerOf(it) : {} });
      map.mark(it.mapId, 'hl'); map.showLabel(it.mapId);
      if (it.kind === 'country' && it.ref.capital) { map.setLayers({ capitals: true }); map.showLabel('cap-' + it.id); }
      var card = h('div', { class: 'card intro' }, [
        h('span', { class: 'tag new', text: 'Neu' }),
        h('h2', { class: 'big-name' }, [it.icon + ' ', h('span', { text: it.name })]),
        it.kind === 'country' && it.ref.capital ? h('p', { class: 'cap-line' }, ['Hauptstadt: ', h('b', { text: it.ref.capital })]) : null,
        it.kind === 'feature' ? h('p', { class: 'fact-line', text: it.ref.fact }) : null,
        it.kind === 'country' && it.ref.note ? h('p', { class: 'note', text: it.ref.note }) : null,
        h('div', { class: 'row' }, [U.speakButtons(it.kind === 'country' && it.ref.capital ? it.name + '. Hauptstadt: ' + (it.ref.capSay || it.ref.capital) : (it.ref.say || it.name))]),
        h('button', { class: 'btn primary', type: 'button', text: 'Weiter ›', onclick: next })
      ]);
      body.appendChild(h('div', { class: 'q-layout' }, [map.el, card]));
      setTimeout(function () { map.zoomTo(it.mapId); }, 0);
      setTimeout(function () { U.speak(it.kind === 'country' ? it.name : (it.ref.say || it.name)); }, 250);
      session.record(step, {});
    }
    function activeMapIds() {
      var o = {}; app.progress.activeItems().forEach(function (it) { if (it.mapId) o[it.mapId] = true; }); return o;
    }
    function layerOf(it) { var l = {}; l[it.type] = true; return l; }

    // ------------------------------------------------------------ questions
    function question(q) {
      var it = M.byKey[q.item];
      var card = h('div', { class: 'card q' });
      var topic = { country: '🗺️ Länder', sea: '🌊 Meere', river: '〰️ Flüsse', mountain: '🏔️ Gebirge', island: '🏝️ Inseln', place: '📍 Orte', fact: '💡 Wissen' }[it.type];
      if (q.part) topic = 'Teil ' + q.part + ' – ' + q.partTitle;
      card.appendChild(h('span', { class: 'tag', text: topic }));
      card.appendChild(h('h2', { class: 'prompt', text: q.prompt }));
      if (q.sub) card.appendChild(h('p', { class: 'sub', text: q.sub }));
      var answers = h('div', { class: 'answers' });
      var fb = h('div', { class: 'fb', 'aria-live': 'polite' });
      card.appendChild(answers); card.appendChild(fb);
      var map = null;
      if (q.map) {
        map = MV.create({ layers: q.map.layers || {}, pick: q.kind === 'find' ? q.map.pick : null, active: activeMapIds() });
        (q.map.highlight || []).forEach(function (id) { map.mark(id, 'hl'); });
        body.appendChild(h('div', { class: 'q-layout' }, [map.el, card]));
        root.__etMap = map;
        if (q.map.zoomTo) setTimeout(function () { map.zoomTo(q.map.zoomTo); }, 0);
      } else {
        body.appendChild(h('div', { class: 'q-single' }, [card]));
      }
      var done = false;

      function finish(result) {
        if (done) return; done = true;
        var extra = session.record(q, result);
        if (exam) { examAnswers.push({ q: q, result: result }); return setTimeout(next, 120); }
        if (result.ok || result.verdict === 'known') setTimeout(function () { app.coinTick(fb.firstChild || card); }, 30);
        // after-text: reveal on the map
        if (map) {
          if (q.map.target) { map.mark(q.map.target, result.ok ? 'right' : 'reveal'); map.showLabel(q.map.target); }
          if (!q.revealCapital) (q.map.highlight || []).forEach(function (id) { map.showLabel(id); });
          if (q.revealCapital) { map.setLayers({ capitals: true }); map.showLabel('cap-' + q.revealCapital); }
        }
        feedback(result, extra);
      }

      function feedback(result, extra) {
        fb.innerHTML = '';
        var box = h('div', { class: 'fb-box ' + (result.verdict === 'known' || (result.found && !result.ok) ? 'known' : result.ok ? 'ok' : 'no') });
        var hintEl = answers.querySelector('.hint'); if (hintEl) hintEl.textContent = '';
        if (result.found && !result.ok) {
          box.appendChild(h('p', { class: 'fb-main', text: 'Gefunden! ' + it.icon + ' ' + it.name }));
          box.appendChild(h('p', { text: 'Nächstes Mal klappt es bestimmt beim ersten Versuch.' }));
          if (q.after) box.appendChild(h('p', { class: 'fb-after', text: q.after }));
        } else if (result.verdict === 'known') {
          box.appendChild(h('p', { class: 'fb-main', text: '✓ Du kennst die richtige Antwort!' }));
          box.appendChild(h('p', { text: 'Fast richtig geschrieben. Schau dir die Schreibweise noch einmal an:' }));
          box.appendChild(h('div', { class: 'fb-word' }, [U.wordDiff(q.answer, result.given), U.speakButtons(q.speak ? q.answer : q.answer)]));
          box.appendChild(copyOnce(q.answer, q.alts));
        } else if (result.ok) {
          var msg = q.rightText.replace(/^Richtig!/, pick(PRAISE));
          if (result.note === 'gross') msg += ' (Namen schreibt man groß.)';
          box.appendChild(h('p', { class: 'fb-main', text: msg }));
          if (q.after) box.appendChild(h('p', { class: 'fb-after', text: q.after }));
        } else {
          box.appendChild(h('p', { class: 'fb-main', text: result.tries > 1 ? 'Hier ist es.' : 'Nicht ganz.' }));
          var txt = q.wrongText ? q.wrongText(result.label || result.given) : '';
          if (q.kind === 'find' && !txt) txt = 'Hier ' + (it.kind === 'country' ? M.liegt(it.ref) : 'liegt') + ' ' + M.phrase(it.mapId) + '.';
          if (txt) box.appendChild(h('p', { text: txt }));
          if (result.other) box.appendChild(h('p', { class: 'note', text: '„' + result.given + '“ ist auch ein richtiger Name – aber für etwas anderes.' }));
          if ((q.kind === 'type' || q.kind === 'listen') && q.answer) box.appendChild(h('div', { class: 'fb-word' }, [h('span', { class: 'wdiff plain', text: q.answer }), U.speakButtons(q.answer)]));
        }
        var line = robinLine(result, extra);
        if (line) box.appendChild(U.robinSays(app.robin(line.pose, 40), line.text));
        var btn = h('button', { class: 'btn primary', type: 'button', text: 'Weiter ›', onclick: next });
        box.appendChild(btn);
        fb.appendChild(box);
        setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); } box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
      }

      // --- find on the map (with retries; first try counts)
      if (q.kind === 'find') {
        var tries = 0, hintP = h('p', { class: 'hint', 'aria-live': 'polite' });
        answers.appendChild(hintP);
        var chosen = null;
        map.onPick(function (id) {
          if (done) return;
          if (!id) { hintP.textContent = 'Tippe genau auf ' + { country: 'ein Land', sea: 'ein Meer', river: 'einen Fluss', mountain: 'ein Gebirge', island: 'eine Insel', place: 'einen Punkt' }[q.map.pick] + '.'; return; }
          if (id === 'bg') { hintP.textContent = 'Dieses Land gehört nicht zu deiner Liste. Versuch ein anderes.'; return; }
          if (exam) {
            if (chosen) map.mark(chosen, 'chosen', false);
            chosen = id; map.mark(id, 'chosen');
            examNext(function () { finish({ ok: id === q.answer, verdict: id === q.answer ? 'right' : 'wrong', given: map.nameOf(id), tries: 1 }); });
            return;
          }
          tries++;
          if (id === q.answer) { map.mark(id, 'right'); return finish({ ok: tries === 1, verdict: tries === 1 ? 'right' : 'wrong', tries: tries, found: true }); }
          map.mark(id, 'wrong'); map.showLabel(id);
          (function (x) { setTimeout(function () { map.mark(x, 'wrong', false); map.showLabel(x, false); }, 1600); })(id);
          if (tries === 1) hintP.textContent = 'Das ist ' + M.phrase(id) + '. Versuch es noch einmal.';
          else if (tries === 2) { hintP.textContent = 'Das ist ' + M.phrase(id) + '. Tipp: Schau im Kreis.'; map.hintAround(q.answer); }
          else { map.mark(q.answer, 'reveal'); finish({ ok: false, verdict: 'wrong', tries: tries, label: map.nameOf(id) }); }
        });
      }

      // --- multiple choice
      if (q.kind === 'choice') {
        var grid = h('div', { class: 'opts' });
        q.options.forEach(function (o) {
          var b = h('button', { class: 'opt', type: 'button', 'data-value': o.value, text: o.label });
          b.addEventListener('click', function () {
            if (done) return;
            if (exam) {
              grid.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('chosen'); });
              b.classList.add('chosen');
              return examNext(function () { finish({ ok: o.value === q.answer, verdict: o.value === q.answer ? 'right' : 'wrong', given: o.label }); });
            }
            var right = o.value === q.answer;
            grid.querySelectorAll('.opt').forEach(function (x) { x.disabled = true; if (x.getAttribute('data-value') === String(q.answer)) x.classList.add('right'); });
            if (!right) b.classList.add('wrong');
            finish({ ok: right, verdict: right ? 'right' : 'wrong', given: o.label });
          });
          grid.appendChild(b);
        });
        answers.appendChild(grid);
      }

      // --- typing (and listening)
      if (q.kind === 'type' || q.kind === 'listen') {
        if (q.kind === 'listen') {
          answers.appendChild(h('div', { class: 'listen-row' }, [U.speakButtons(q.speak, { big: true })]));
          setTimeout(function () { U.speak(q.speak); }, 300);
        }
        var inp = h('input', { class: 'type-in', type: 'text', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Deine Antwort', placeholder: 'Schreibe hier …' });
        var go = h('button', { class: 'btn primary', type: 'button', text: exam ? 'Weiter ›' : 'Prüfen' });
        var submit = function () {
          if (done) return;
          if (!inp.value.trim()) { inp.focus(); return; }
          var r = S.classify(inp.value, q.answer, { alts: q.alts, domain: q.domain });
          inp.disabled = true; go.disabled = true;
          var okk = r.verdict !== 'wrong';
          inp.classList.add(r.verdict);
          finish({ ok: okk, verdict: r.verdict, given: inp.value.trim(), note: r.note, other: r.other });
        };
        go.addEventListener('click', submit);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
        answers.appendChild(h('div', { class: 'type-row' }, [inp, go]));
        setTimeout(function () { inp.focus(); }, 80);
      }

      function examNext(commit) {
        var btn = answers.querySelector('.exam-next');
        if (!btn) {
          btn = h('button', { class: 'btn primary exam-next', type: 'button', text: 'Weiter ›' });
          answers.appendChild(btn);
        }
        btn.onclick = commit;
      }
    }

    // Write the word once correctly right after a spelling slip (optional, no score).
    function copyOnce(word, alts) {
      var wrap = h('div', { class: 'copy-once' });
      var inp = h('input', { class: 'type-in small', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Schreib es einmal richtig ab', 'aria-label': 'Wort abschreiben' });
      var msg = h('span', { class: 'copy-msg' });
      inp.addEventListener('input', function () {
        var r = S.classify(inp.value, word, { alts: alts });
        if (r.verdict === 'right' && inp.value.trim().length >= word.length - 1) { msg.textContent = '✓ Prima!'; inp.classList.add('right'); inp.disabled = true; }
      });
      wrap.appendChild(h('p', { class: 'small', text: 'Jetzt üben wir noch die Schreibweise:' }));
      wrap.appendChild(h('div', { class: 'type-row' }, [inp, msg]));
      return wrap;
    }

    // ------------------------------------------------------------ Schreibtraining / Hören & Schreiben (one word)
    function spell(step) {
      var w = M.wordByKey[step.word], listening = step.kind === 'listen';
      var card = h('div', { class: 'card spell' });
      card.appendChild(h('span', { class: 'tag', text: listening ? '🎧 Hören & Schreiben' : '✏️ Schreibtraining' }));
      card.appendChild(h('p', { class: 'sub', text: w.what }));
      var stage = h('div', { class: 'spell-stage' });
      card.appendChild(stage);
      body.appendChild(h('div', { class: 'q-single' }, [card]));
      var usedHelp = false, hintLevel = 0, attempts = 0;

      function showModel() {
        stage.innerHTML = '';
        stage.appendChild(h('h2', { class: 'prompt', text: 'Schau dir das Wort genau an:' }));
        stage.appendChild(h('div', { class: 'model' }, [U.syllables(w.word, w.syl)]));
        stage.appendChild(U.speakButtons(w.say, { big: true }));
        stage.appendChild(h('button', { class: 'btn primary', type: 'button', text: 'Ich hab’s mir gemerkt ›', onclick: writeIt }));
        setTimeout(function () { U.speak(w.say); }, 250);
      }
      function writeIt() {
        stage.innerHTML = '';
        stage.appendChild(h('h2', { class: 'prompt', text: listening ? 'Hör gut zu und schreibe:' : 'Wie schreibt man das?' }));
        stage.appendChild(U.speakButtons(w.say, { big: true }));
        var hintBox = h('div', { class: 'hint-box', 'aria-live': 'polite' });
        var inp = h('input', { class: 'type-in', type: 'text', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Wort schreiben' });
        var go = h('button', { class: 'btn primary', type: 'button', text: 'Prüfen' });
        var hintBtn = h('button', { class: 'btn soft', type: 'button', text: '💡 Hinweis' });
        var msg = h('div', { class: 'spell-msg', 'aria-live': 'polite' });
        stage.appendChild(hintBox);
        stage.appendChild(h('div', { class: 'type-row' }, [inp, go]));
        stage.appendChild(h('div', { class: 'row' }, [hintBtn]));
        stage.appendChild(msg);
        hintBtn.addEventListener('click', function () {
          hintLevel = Math.min(3, hintLevel + 1); usedHelp = true;
          hintBox.innerHTML = '';
          hintBox.appendChild(hintLevel === 2 ? U.syllables(w.word, w.syl) : h('span', { class: 'hint-text', text: S.hint(w.word, w.syl, hintLevel) }));
          if (hintLevel >= 3) hintBtn.disabled = true;
          inp.focus();
        });
        function check() {
          if (!inp.value.trim()) return inp.focus();
          attempts++;
          var r = S.classify(inp.value, w.word, { alts: w.alts });
          if (r.verdict === 'right') {
            msg.innerHTML = '';
            var clean = !usedHelp && attempts === 1;
            msg.appendChild(h('p', { class: 'fb-main ok', text: clean ? pick(PRAISE) + ' Perfekt geschrieben.' : '✓ Jetzt stimmt es!' }));
            inp.disabled = true; go.disabled = true; hintBtn.disabled = true;
            session.record(step, { ok: true, usedHelp: !clean, verdict: clean ? 'right' : 'known' });
            app.coinTick(msg.firstChild);
            var nb = h('button', { class: 'btn primary', type: 'button', text: 'Weiter ›', onclick: next });
            msg.appendChild(nb); setTimeout(function () { nb.focus(); }, 50);
            return;
          }
          usedHelp = true;                     // a wrong try means: practise again later
          msg.innerHTML = '';
          msg.appendChild(h('p', { text: attempts === 1 ? 'Fast! Schau, wo es anders ist:' : 'Noch einmal – du schaffst das:' }));
          msg.appendChild(U.wordDiff(w.word, inp.value));
          if (attempts >= 2 && hintLevel < 2) { hintLevel = 2; hintBox.innerHTML = ''; hintBox.appendChild(U.syllables(w.word, w.syl)); }
          inp.value = ''; inp.focus();
        }
        go.addEventListener('click', check);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
        setTimeout(function () { inp.focus(); if (listening) U.speak(w.say); }, 250);
      }
      // Schreibtraining shows the word first, unless the word is already secure; listening never shows it first.
      var st = app.progress.wordStat(w.key);
      if (listening || (st && st.box >= 2)) writeIt(); else showModel();
    }

    // ------------------------------------------------------------ end
    function end() {
      root.ET.speech.stop();
      var sum = session.finish();
      app.platform.recordActivity(sum);
      var coins = app.reward(sum);
      body.innerHTML = ''; head.remove();
      if (opts.onEnd) opts.onEnd(sum);
      return exam ? examEnd(sum, coins) : practiceEnd(sum, coins);
    }
    function coinLine(n) { return n ? h('p', { class: 'end-coins' }, [U.coin(26), '+' + n + ' Robin-Münzen']) : null; }
    function list(title, arr, cls) {
      if (!arr.length) return null;
      return h('div', { class: 'res-list ' + cls }, [h('h3', { text: title }), h('ul', {}, arr.slice(0, 8).map(function (x) { return h('li', { text: x }); }))]);
    }
    function progressLine() {
      var p = app.progress, c = p.secureCount('cap', 'country'), o = p.secureCount('ort', 'country');
      if (c.sure > 0) return 'Du kannst jetzt ' + c.sure + ' von ' + c.total + ' Hauptstädten sicher.';
      if (o.sure > 0) return 'Du findest jetzt ' + o.sure + ' von ' + o.total + ' Ländern sicher auf der Karte.';
      return '';
    }
    function practiceEnd(sum, coins) {
      var line = progressLine();
      var box = h('div', { class: 'end' }, [
        h('div', { class: 'end-hero' }, [app.robin(sum.right >= sum.total * 0.7 ? 'celebrating' : 'encouraging', 96), h('div', {}, [
          h('h1', { text: session.mode === 'heute' ? 'Geschafft für heute!' : 'Runde geschafft!' }),
          coinLine(coins),
          line ? h('p', { class: 'end-line', text: line }) : null,
          sum.newGroups.length ? h('p', { class: 'note', text: 'Neu gelernt: ' + sum.newGroups.map(function (g) { return M.groupOf[g].title; }).join(', ') }) : null])]),
        h('div', { class: 'end-stats' }, [
          stat(sum.right, 'gewusst'), sum.spell.length ? stat(sum.spell.length, 'Wörter zum Schreiben üben') : null,
          sum.bestStreak >= 5 ? stat(sum.bestStreak, 'hintereinander richtig') : null]),
        list('Das kannst du schon gut:', sum.good, 'good'),
        list('Das üben wir noch:', sum.practise, 'practise'),
        sum.spell.length ? list('Gewusst – nur die Schreibweise üben:', sum.spell, 'spell') : null,
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', type: 'button', text: 'Zum Start', onclick: function () { app.go('home'); } }),
          sum.spell.length ? h('button', { class: 'btn soft', type: 'button', text: '✏️ Schreibtraining', onclick: function () { app.start('spell'); } }) : null])
      ]);
      body.appendChild(box);
    }
    function examEnd(sum, coins) {
      var parts = sum.parts || {};
      var spell = examAnswers.filter(function (a) { return a.result.verdict === 'known'; }).map(function (a) { return a.q.answer; });
      var box = h('div', { class: 'end exam-end' }, [
        h('div', { class: 'end-hero' }, [app.robin('glasses', 90), h('div', {}, [
          h('p', { class: 'kicker', text: 'Probe-Arbeit Europa' }),
          h('h1', { class: 'score', text: sum.right + ' / ' + sum.total }),
          coinLine(coins),
          h('p', { class: 'note', text: 'Richtig gewusst zählt – auch wenn die Schreibweise noch nicht ganz stimmt.' })])]),
        h('div', { class: 'parts' }, Object.keys(parts).sort().map(function (k) {
          var p = parts[k]; return h('div', { class: 'part' }, [h('b', { text: 'Teil ' + k }), h('span', { text: p.title }), h('span', { class: 'part-score', text: p.ok + ' / ' + p.n })]);
        })),
        list('Das kannst du schon gut:', sum.good, 'good'),
        list('Das solltest du noch üben:', sum.practise, 'practise'),
        spell.length ? list('Gewusst – nur die Schreibweise üben:', spell, 'spell') : null,
        h('div', { class: 'row' }, [
          h('button', { class: 'btn primary', type: 'button', text: '🎯 Meine Problemstellen', onclick: function () { app.start('problem'); } }),
          h('button', { class: 'btn soft', type: 'button', text: 'Neue Probe-Arbeit', onclick: function () { app.start('exam'); } }),
          h('button', { class: 'btn soft', type: 'button', text: 'Zum Start', onclick: function () { app.go('home'); } })])
      ]);
      body.appendChild(box);
    }
    function stat(n, label) { return h('div', { class: 'stat' }, [h('b', { text: String(n) }), h('span', { text: label })]); }

    function robinLine(result, extra) {
      if (!result.ok) return Math.random() < 0.2 ? { pose: 'encouraging', text: 'Robin sagt: Fehler sind zum Lernen da. 🐕' } : null;
      if (extra.comeback) return { pose: 'celebrating', text: 'Das konntest du gestern noch nicht!' };
      if (extra.streak && extra.streak % 5 === 0) return { pose: 'happy', text: 'Super – ' + extra.streak + ' hintereinander richtig!' };
      return null;
    }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    root.__etTest = function () { return current; };     // read by the browser tests
    next();
  }

  root.ET.practice = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
