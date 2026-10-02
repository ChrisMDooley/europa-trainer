/*
 * screens.js — Entdecken, Grenzen Europas, Das muss ich wissen (Karteikarten), Eltern.
 */
(function (root) {
  'use strict';
  var U = root.ET.ui, h = U.h, M = root.ET.model, MV = root.ET.mapview, CUR = root.ET.curriculum;

  // ------------------------------------------------------------ 🧭 ENTDECKEN (level 1, no scoring)
  function explore(app, opts) {
    opts = opts || {};
    var layers = Object.assign({ capitals: false, sea: false, river: false, mountain: false, island: false, place: false, labels: false }, opts.layers || {});
    var map = MV.create({ layers: layers, pick: 'any' });
    var info = h('div', { class: 'card info', 'aria-live': 'polite' }, [
      h('p', { class: 'sub', text: 'Tippe auf ein Land, ein Meer, einen Fluss …' })]);
    function toggle(key, label) {
      var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!!layers[key]), text: label });
      b.addEventListener('click', function () {
        layers[key] = !layers[key]; b.setAttribute('aria-pressed', String(layers[key]));
        var l = {}; l[key] = layers[key]; map.setLayers(l);
      });
      return b;
    }
    map.onPick(function (id) {
      if (!id || id === 'bg') return;
      map.clearMarks(); map.hideLabels(); map.mark(id, 'hl'); map.showLabel(id);
      var kind = id.split('-')[0], key = id.slice(kind.length + 1);
      info.innerHTML = '';
      if (kind === 'country') {
        var it = M.country(key), c = it.ref;
        if (c.capital) map.showLabel('cap-' + c.id);
        info.appendChild(h('h2', { class: 'big-name' }, [it.icon + ' ', h('span', { text: c.name })]));
        if (c.capital) info.appendChild(h('p', { class: 'cap-line' }, ['Hauptstadt: ', h('b', { text: c.capital })]));
        if (c.note) info.appendChild(h('p', { class: 'note', text: c.note }));
        if (c.tier === 'extra') info.appendChild(h('p', { class: 'note', text: 'Extra – kommt in der Arbeit nicht dran.' }));
        info.appendChild(U.speakButtons(c.capital ? c.name + '. Hauptstadt: ' + (c.capSay || c.capital) : c.name));
      } else {
        var f = M.feature(key);
        if (!f) return;
        info.appendChild(h('h2', { class: 'big-name' }, [f.icon + ' ', h('span', { text: f.name })]));
        info.appendChild(h('p', { class: 'sub', text: M.TYPE_LABEL[f.type] + (f.ref.book ? ' · im Buch: ' + f.ref.book : '') }));
        if (f.ref.fact) info.appendChild(h('p', { class: 'fact-line', text: f.ref.fact }));
        info.appendChild(U.speakButtons(f.ref.say || f.name));
      }
      if (app.progress) app.progress.markSeen(kind === 'country' ? 'c:' + key : 'f:' + key);
    });
    var v = h('section', { class: 'explore' }, [
      h('h1', { class: 'screen-h', text: opts.title || '🧭 Europa entdecken' }),
      h('p', { class: 'screen-sub', text: 'Schau dir alles in Ruhe an. Hier gibt es keine Punkte.' }),
      h('div', { class: 'chips' }, [toggle('capitals', '🏛️ Hauptstädte'), toggle('sea', '🌊 Meere'), toggle('river', '〰️ Flüsse'),
        toggle('mountain', '🏔️ Gebirge'), toggle('island', '🏝️ Inseln'), toggle('place', '📍 Orte'), toggle('labels', 'Aa Alle Namen')]),
      h('div', { class: 'q-layout' }, [map.el, info])
    ]);
    app.setView(v, { back: true });
  }

  // ------------------------------------------------------------ 🧱 GRENZEN EUROPAS (visual lesson + drag task)
  function borders(app) {
    var map = MV.create({ layers: { sea: true, river: true, mountain: true, place: true } });
    var main = CUR.borders.filter(function (b) { return !b.second; });
    main.concat(CUR.borders.filter(function (b) { return b.second; })).forEach(function (b) {
      b.items.forEach(function (id) { var f = M.feature(id); if (f) { map.mark(f.mapId, b.second ? 'reveal' : 'hl'); map.showLabel(f.mapId); } });
    });
    var sides = { N: 'Norden', W: 'Westen', S: 'Süden', O: 'Osten' };
    var board = h('div', { class: 'compass-board' });
    var zones = {};
    ['N', 'W', 'O', 'S'].forEach(function (s) {
      zones[s] = h('div', { class: 'zone z-' + s, 'data-side': s }, [h('span', { class: 'zone-label', text: sides[s] })]);
      board.appendChild(zones[s]);
    });
    board.appendChild(h('div', { class: 'zone-center', text: 'EUROPA' }));
    var tray = h('div', { class: 'chip-tray' });
    var msg = h('p', { class: 'hint', 'aria-live': 'polite', text: 'Ziehe jeden Begriff an die richtige Seite – oder tippe erst den Begriff, dann die Seite.' });
    var selected = null, placed = 0, firstTry = {};
    root.ET.questions.shuffle(main).forEach(function (b) {
      var chip = h('button', { class: 'dchip', type: 'button', 'data-side': b.side, text: b.text });
      tray.appendChild(chip);
      chip.addEventListener('click', function () {
        tray.querySelectorAll('.dchip').forEach(function (c) { c.classList.remove('sel'); });
        selected = chip; chip.classList.add('sel');
      });
      dragify(chip, function (zone) { drop(chip, zone); });
    });
    Object.keys(zones).forEach(function (s) { zones[s].addEventListener('click', function () { if (selected) drop(selected, zones[s]); }); });
    function drop(chip, zone) {
      if (!zone) return;
      var want = chip.getAttribute('data-side'), got = zone.getAttribute('data-side');
      var fact = CUR.facts.filter(function (f) { return f.border === want; })[0];
      if (!(want in firstTry)) {
        firstTry[want] = want === got;
        if (fact) app.progress.record({ item: 'w:' + fact.id, skill: 'wissen', ok: want === got, mode: 'grenzen' });
      }
      if (want === got) {
        zone.appendChild(chip); chip.disabled = true; chip.classList.remove('sel'); chip.classList.add('placed');
        selected = null; placed++;
        msg.textContent = 'Richtig! Im ' + sides[got] + ': ' + chip.textContent + '.';
        if (placed === main.length) {
          msg.textContent = 'Super – alle Grenzen richtig! Im Südosten liegen außerdem: Schwarzes Meer, Kaspisches Meer und der Bosporus.';
          done.hidden = false;
          app.bonus(3, 'Grenzen Europas gelegt', board);
        }
      } else {
        chip.classList.add('shake'); setTimeout(function () { chip.classList.remove('shake'); }, 450);
        msg.textContent = 'Nicht ganz. ' + chip.textContent + ' liegt nicht im ' + sides[got] + '. Schau auf die Karte.';
      }
    }
    var done = h('div', { class: 'row', hidden: true }, [
      h('button', { class: 'btn primary', type: 'button', text: '💡 Quiz zu Grenzen & Wissen', onclick: function () { app.start('wissen'); } }),
      h('button', { class: 'btn soft', type: 'button', text: 'Zum Start', onclick: function () { app.go('home'); } })]);
    var v = h('section', { class: 'borders' }, [
      h('h1', { class: 'screen-h', text: '🧱 Grenzen Europas' }),
      h('div', { class: 'border-facts' }, main.map(function (b) { return h('div', { class: 'bf' }, [h('b', { text: b.label + ':' }), ' ' + b.text]); })
        .concat([h('div', { class: 'bf second' }, [h('b', { text: 'Südosten:' }), ' Schwarzes Meer, Kaspisches Meer, Bosporus'])])),
      h('div', { class: 'q-layout' }, [map.el, h('div', { class: 'card' }, [h('h2', { class: 'prompt', text: 'Wer begrenzt Europa wo?' }), board, tray, msg, done])])
    ]);
    app.setView(v, { back: true });
  }

  // Pointer drag for chips onto elements with data-side.
  function dragify(chip, onDrop) {
    var ghost = null, start = null;
    chip.addEventListener('pointerdown', function (e) { start = [e.clientX, e.clientY]; chip.setPointerCapture(e.pointerId); });
    chip.addEventListener('pointermove', function (e) {
      if (!start) return;
      if (!ghost && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 8) return;
      if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); }
      ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    });
    chip.addEventListener('pointerup', function (e) {
      if (ghost) {
        ghost.remove(); ghost = null;
        var t = document.elementFromPoint(e.clientX, e.clientY);
        var zone = t && t.closest ? t.closest('[data-side].zone') : null;
        onDrop(zone);
        chip.dataset.dragged = '1'; setTimeout(function () { delete chip.dataset.dragged; }, 50);
      }
      start = null;
    });
    chip.addEventListener('click', function (e) { if (chip.dataset.dragged) e.stopImmediatePropagation(); }, true);
  }

  // ------------------------------------------------------------ 💡 DAS MUSS ICH WISSEN (flashcards)
  function flashcards(app) {
    var pr = app.progress;
    var facts = M.items.filter(function (it) { return it.kind === 'fact' && M.isActive(it, pr.settings()); });
    // weakest first, then the rest
    facts.sort(function (a, b) { return root.ET.progressUtil.strength(pr.stat(a.key, 'wissen')) - root.ET.progressUtil.strength(pr.stat(b.key, 'wissen')); });
    var i = 0, known = 0;
    var holder = h('div', { class: 'fc-holder' });
    var v = h('section', { class: 'flash' }, [
      h('h1', { class: 'screen-h', text: '💡 Das muss ich wissen' }),
      h('p', { class: 'screen-sub', text: 'Lies die Frage, überlege, dann dreh die Karte um.' }),
      holder,
      h('div', { class: 'row' }, [h('button', { class: 'btn soft', type: 'button', text: 'Als Quiz üben ›', onclick: function () { app.start('wissen'); } })])
    ]);
    function show() {
      holder.innerHTML = '';
      if (i >= facts.length) {
        holder.appendChild(h('div', { class: 'card end-card' }, [h('h2', { text: 'Alle Karten durch!' }),
          h('p', { text: known + ' von ' + facts.length + ' wusstest du schon.' }),
          h('button', { class: 'btn primary', type: 'button', text: 'Nochmal', onclick: function () { i = 0; known = 0; show(); } })]));
        return;
      }
      var it = facts[i], w = it.ref;
      var card = h('button', { class: 'fc', type: 'button', 'aria-label': 'Karte umdrehen' }, [
        h('span', { class: 'fc-count', text: (i + 1) + ' / ' + facts.length }),
        h('span', { class: 'fc-label', text: 'FRAGE' }), h('span', { class: 'fc-q', text: w.q }),
        h('span', { class: 'fc-a', text: cap(w.a) }), w.note ? h('span', { class: 'fc-note', text: w.note }) : null,
        h('span', { class: 'fc-tap', text: 'Tippen zum Umdrehen' })]);
      var rate = h('div', { class: 'row fc-rate', hidden: true }, [
        h('button', { class: 'btn primary', type: 'button', text: '✓ Wusste ich', onclick: function () { pr.record({ item: it.key, skill: 'wissen', ok: true, mode: 'karten' }); known++; i++; show(); } }),
        h('button', { class: 'btn soft', type: 'button', text: '↻ Noch nicht', onclick: function () { pr.record({ item: it.key, skill: 'wissen', ok: false, mode: 'karten' }); i++; show(); } })]);
      card.addEventListener('click', function () { card.classList.add('flipped'); rate.hidden = false; U.speak(w.q.replace(/\?$/, '') + '? ' + w.a); });
      holder.appendChild(card); holder.appendChild(rate);
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    app.setView(v, { back: true });
    show();
  }

  // ------------------------------------------------------------ 👤 ELTERN
  function parent(app) {
    var pr = app.progress, P = app.platform;
    if (P.parentHasPin() && !app.parentOk) {
      var inp = h('input', { type: 'password', inputmode: 'numeric', class: 'type-in pin', 'aria-label': 'Eltern-PIN' });
      var m = h('p', { class: 'hint' });
      var go = function () { if (P.parentCheck(inp.value)) { app.parentOk = true; parent(app); } else { m.textContent = 'Die PIN stimmt nicht.'; inp.value = ''; } };
      app.setView(h('section', { class: 'pin-screen' }, [h('h1', { class: 'screen-h', text: 'Elternbereich' }), h('p', { text: P.guest ? 'Bitte die Eltern-PIN eingeben.' : 'Bitte die Eltern-PIN von Robin’s Bobins eingeben.' }),
        h('div', { class: 'type-row' }, [inp, h('button', { class: 'btn primary', type: 'button', text: 'Öffnen', onclick: go })]), m]), { back: true });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      inp.focus();
      return;
    }
    var st = pr.settings();
    var days = pr.daysLeft();
    var ov = pr.overview();
    var probs = pr.problems(10);
    var v = h('section', { class: 'parent' }, [
      h('h1', { class: 'screen-h', text: '👤 Elternbereich' }),
      h('div', { class: 'panel' }, [h('h2', { text: 'Stand' }),
        h('p', { class: 'note', text: '„Sicher“ = mehrmals und zuletzt richtig, mit Abstand wiederholt. Grau = schon geübt.' }),
        h('div', { class: 'ov' }, ov.map(function (o) {
          return h('div', { class: 'ov-row' }, [h('span', { class: 'ov-l', text: o.label }), U.bar(o.v.sure, o.v.total, o.v.seen), h('span', { class: 'ov-n', text: o.v.sure + ' / ' + o.v.total + ' sicher' })]);
        })),
        h('h3', { text: 'Problemstellen' }),
        probs.length ? h('ul', { class: 'probs' }, probs.map(function (p) { return h('li', { text: pr.problemLabel(p) }); })) : h('p', { class: 'note', text: 'Noch keine – erst wenn ' + P.childName + ' geübt hat.' }),
        h('p', { class: 'note', text: 'Neu eingeführt: ' + (pr.introducedGroups().map(function (g) { return M.groupOf[g].title; }).join(', ') || '–') +
          ' · noch offen: ' + pr.pendingGroups().length + ' Gruppen · ' + pr.doc.sessions.length + ' Runden geübt' })]),
      h('div', { class: 'panel' }, [h('h2', { text: 'Europa-Arbeit' }),
        h('label', { class: 'field' }, ['Datum der Arbeit: ', dateInput()]),
        h('p', { class: 'note', text: days == null ? '' : days >= 0 ? 'Noch ' + days + ' Tage. Bis eine Woche vorher kommen neue Themen dazu, danach wird nur noch wiederholt und geprobt.' : 'Die Arbeit ist vorbei – neues Datum eintragen, wenn das Thema wiederkommt.' })]),
      h('div', { class: 'panel' }, [h('h2', { text: 'Aktiver Lernstoff' }),
        h('div', { class: 'cats' }, CUR.categories.map(function (c) {
          var on = c.off ? st.cats[c.id] === true : st.cats[c.id] !== false;
          var box = h('input', { type: 'checkbox', checked: on ? true : null });
          box.addEventListener('change', function () { st.cats[c.id] = box.checked; pr.save(); });
          return h('label', { class: 'cat' }, [box, ' ' + c.label]);
        })),
        h('details', { class: 'items' }, [h('summary', { text: 'Einzelne Länder / Begriffe ein- oder ausschalten' })].concat(M.groups.map(function (g) {
          var its = M.items.filter(function (it) { return it.group === g.id && it.kind !== 'fact'; });
          return h('div', { class: 'grp' }, [h('b', { text: g.title })].concat(its.map(function (it) {
            var b = h('input', { type: 'checkbox', checked: st.off[it.key] ? null : true });
            b.addEventListener('change', function () { if (b.checked) delete st.off[it.key]; else st.off[it.key] = true; pr.save(); });
            return h('label', { class: 'it' }, [b, ' ' + it.name]);
          })));
        })))]),
      h('div', { class: 'panel' }, [h('h2', { text: 'Lesen & Hören' }),
        h('label', { class: 'field' }, [h('input', { type: 'checkbox', checked: st.font === 'dyslexic' ? true : null, onchange: function (e) { st.font = e.target.checked ? 'dyslexic' : 'atkinson'; pr.save(); app.applySettings(); } }), ' Schrift OpenDyslexic verwenden']),
        h('label', { class: 'field' }, ['Stimme: ', voiceSelect()]),
        h('label', { class: 'field' }, ['Langsam-Tempo: ', slowSelect()])]),
      h('div', { class: 'panel' }, [h('h2', { text: 'Zurücksetzen' }),
        h('p', { class: 'note', text: 'Löscht den Lernstand von ' + P.childName + ' in Europa-Trainer. Einstellungen und Robin-Münzen bleiben.' }),
        h('button', { class: 'btn soft', type: 'button', text: 'Lernstand löschen', onclick: function () { if (confirm('Lernstand wirklich löschen?')) { pr.reset(); parent(app); } } })])
    ]);
    function dateInput() {
      var d = h('input', { type: 'date', value: st.examDate || '' });
      d.addEventListener('change', function () { st.examDate = d.value || null; pr.save(); parent(app); });
      return d;
    }
    function voiceSelect() {
      var s = h('select', {}, [h('option', { value: '', text: 'automatisch' })]);
      function fill(vs) { s.innerHTML = ''; s.appendChild(h('option', { value: '', text: 'automatisch' })); vs.forEach(function (x) { s.appendChild(h('option', { value: x.name, text: x.name, selected: x.name === st.voice ? true : null })); }); }
      root.ET.speech.onVoices(fill);
      s.addEventListener('change', function () { st.voice = s.value; pr.save(); U.speak('Ljubljana'); });
      return s;
    }
    function slowSelect() {
      var s = h('select', {}, [[0.45, 'sehr langsam'], [0.6, 'langsam'], [0.75, 'etwas langsamer']].map(function (o) {
        return h('option', { value: o[0], text: o[1], selected: Number(st.slowRate) === o[0] ? true : null });
      }));
      s.addEventListener('change', function () { st.slowRate = Number(s.value); pr.save(); U.speak('Bratislava', true); });
      return s;
    }
    app.setView(v, { back: true });
  }

  root.ET.screens = { explore: explore, borders: borders, flashcards: flashcards, parent: parent };
})(typeof window !== 'undefined' ? window : globalThis);
