/*
 * app.js — start screen, menus, routing. Loaded last.
 */
(function (root) {
  'use strict';
  var ET = root.ET, U = ET.ui, h = U.h, M = ET.model, P = ET.platform;

  var progress = new ET.Progress(P.childId);
  var main = document.getElementById('main');
  var backBtn = document.getElementById('back'), appsLink = document.getElementById('apps-link');
  if (P.homeUrl) { appsLink.href = P.homeUrl; if (P.guest) appsLink.textContent = '‹ Start'; } else appsLink.hidden = true;
  U.useSettings(function () { return progress.settings(); });

  var onLeave = null;
  var app = {
    progress: progress, platform: P, parentOk: false,
    robin: function (pose, size) { return P.robin(pose, size); },
    setView: function (node, opts) {
      opts = opts || {};
      if (onLeave) { try { onLeave(); } catch (e) { /* ignore */ } }
      onLeave = opts.onBack || null;
      main.innerHTML = ''; main.appendChild(node);
      backBtn.hidden = !opts.back;
      window.scrollTo(0, 0);
    },
    go: function (route) { if (location.hash !== '#/' + route) location.hash = '#/' + route; else render(); },
    start: start,
    applySettings: applySettings
  };
  ET.app = app;

  function applySettings() {
    document.documentElement.classList.toggle('font-dyslexic', progress.settings().font === 'dyslexic');
  }
  applySettings();

  // ------------------------------------------------------------ Robin-Münzen
  // Effort pays, nothing is ever taken away (same idea as Deutschland & Hessen):
  //   1 per answer known (spelling slips count as known) · 1 per word written in Schreiben/Hören,
  //   + finishing bonus: Heute üben +5, other rounds +3; Probe-Arbeit: 1 per right answer +8;
  //   Grenzen Europas completed +3. Only with Robin's Bobins (the family balance).
  var pill = document.getElementById('coin-pill'), coinsEl = document.getElementById('coins'), roundCoins = 0;
  function showCoins(bump) {
    if (!P.coins.available) return;
    pill.hidden = false; coinsEl.textContent = P.coins.balance();
    if (bump) { pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump'); }
  }
  showCoins();
  app.coins = P.coins.available;
  app.coinTick = function (anchor) { if (!P.coins.available) return; roundCoins++; U.coinFloat(anchor, 1); };
  app.reward = function (sum) {
    var earned = roundCoins; roundCoins = 0;
    if (!P.coins.available || !(sum.total + (sum.spelling || 0))) return 0;
    var amount = sum.mode === 'exam' ? sum.right + 8 : earned + (sum.mode === 'heute' ? 5 : 3);
    var n = P.coins.add(amount, sum.mode === 'exam' ? 'Probe-Arbeit geschafft' : sum.mode === 'heute' ? 'Heute geübt' : 'Runde geübt');
    showCoins(true); return n;
  };
  app.bonus = function (amount, reason, anchor) {
    var n = P.coins.add(amount, reason); if (n) { showCoins(true); U.coinFloat(anchor, n); } return n;
  };

  backBtn.addEventListener('click', function () { ET.speech.stop(); app.go('home'); });

  // ------------------------------------------------------------ rounds
  var TITLES = { heute: '▶ Heute üben', ort: '📍 Wo liegt …?', name: '❓ Welches Land ist das?', cap: '🏛️ Hauptstädte',
                 physisch: '🏔️ Europa entdecken', wissen: '💡 Das muss ich wissen', problem: '🎯 Meine Problemstellen',
                 spell: '✏️ Schreibtraining', listen: '🎧 Hören & Schreiben', exam: '📝 Prüfung üben' };
  function start(mode, opts) {
    opts = Object.assign({ mode: mode }, opts || {});
    var s = ET.session.create(progress, opts);
    roundCoins = 0;
    history.replaceState(null, '', '#/runde');
    ET.practice.run(app, s, { title: TITLES[mode] || '' });
  }

  // ------------------------------------------------------------ home
  function home() {
    var days = progress.daysLeft(), phase = progress.phase();
    var newToday = progress.newGroupsToday(), pending = progress.pendingGroups();
    var probs = progress.problems(7);
    var plan = [];
    if (newToday) plan.push('Neu: ' + pending.slice(0, newToday).map(function (g) { return g.title; }).join(' + '));
    if (progress.introducedGroups().length) plan.push('Wiederholen');
    if (progress.spellQueue(1).length) plan.push('ein paar Wörter schreiben');
    var countdown = days == null ? '' : days > 1 ? 'Die Europa-Arbeit ist in ' + days + ' Tagen.' : days === 1 ? 'Morgen ist die Europa-Arbeit. Du bist gut vorbereitet!' : days === 0 ? 'Heute ist die Europa-Arbeit – viel Erfolg!' : '';
    var today = progress.doc.sessions.filter(function (s) { return ET.progressUtil.dayKey(s.endedAt) === ET.progressUtil.dayKey(Date.now()); }).length;
    var line = today ? 'Heute schon geübt – super! Noch eine Runde?' : (phase === 'wiederholen' || phase === 'endspurt') ? 'Jetzt wird wiederholt – Neues kommt nicht mehr dazu.' : 'Für heute: ca. 10 Minuten.';

    var ov = progress.overview();
    var tiles = [['karte', '🗺️', 'Karte'], ['laender', '❓', 'Länder'], ['hauptstadt', '🏛️', 'Hauptstädte'], ['physisch', '🏔️', 'Meere & Co.'], ['wissen', '💡', 'Wissen'], ['schreiben', '✏️', 'Schreiben']];
    var byId = {}; ov.forEach(function (o) { byId[o.id] = o.v; });

    var v = h('section', { class: 'home' }, [
      h('div', { class: 'hero' }, [app.robin(today ? 'happy' : 'normal', 92), h('div', {}, [
        h('h1', { text: 'Hallo ' + P.childName + '!' }),
        countdown ? h('p', { class: 'countdown', text: '📅 ' + countdown }) : null,
        h('p', { class: 'hero-line', text: line })])]),
      h('button', { class: 'today-btn', type: 'button', 'data-menu': 'heute', onclick: function () { start('heute'); } }, [
        h('span', { class: 'tb-icon', text: '▶' }),
        h('span', { class: 'tb-text' }, [h('span', { class: 'tb-title', text: 'Heute üben' }), h('span', { class: 'tb-sub', text: plan.join(' · ') || 'Wiederholen' })])]),
      probs.length >= 3 ? h('button', { class: 'problem-card', type: 'button', 'data-menu': 'problem', onclick: function () { start('problem'); } }, [
        h('b', { text: '🎯 Heute solltest du diese ' + probs.length + ' Dinge üben:' }),
        h('ul', {}, probs.map(function (p) { return h('li', { text: progress.problemLabel(p) }); }))]) : null,
      h('div', { class: 'skills' }, tiles.map(function (t) {
        var x = byId[t[0]];
        return h('div', { class: 'skill' }, [h('span', { class: 'sk-i', text: t[1] }), h('span', { class: 'sk-l', text: t[2] }), U.bar(x.sure, x.total, x.seen), h('span', { class: 'sk-n', text: x.sure + ' / ' + x.total })]);
      })),
      h('h2', { class: 'group-h', text: 'Karte & Länder' }),
      h('div', { class: 'modes' }, [
        mode('entdecken', '🧭', 'Karte entdecken', 'Schauen und antippen', function () { ET.screens.explore(app); }),
        mode('ort', '📍', 'Wo liegt …?', 'Länder auf der Karte finden', function () { start('ort'); }),
        mode('name', '❓', 'Welches Land ist das?', 'Erkennen und benennen', function () { chooser('name'); }),
        mode('cap', '🏛️', 'Hauptstädte', 'Land → Stadt und zurück', function () { chooser('cap'); })]),
      h('h2', { class: 'group-h', text: 'Europa-Wissen' }),
      h('div', { class: 'modes' }, [
        mode('physisch', '🏔️', 'Europa entdecken', 'Meere, Flüsse, Gebirge, Inseln', function () { physChooser(); }),
        mode('grenzen', '🧱', 'Grenzen Europas', 'Norden, Osten, Süden, Westen', function () { ET.screens.borders(app); }),
        mode('wissen', '💡', 'Das muss ich wissen', 'Karteikarten & Quiz', function () { ET.screens.flashcards(app); })]),
      h('h2', { class: 'group-h', text: 'Schreiben & Prüfung' }),
      h('div', { class: 'modes' }, [
        mode('spell', '✏️', 'Schreibtraining', 'Schwierige Namen richtig schreiben', function () { start('spell'); }),
        mode('listen', '🎧', 'Hören & Schreiben', 'Anhören und aufschreiben', function () { start('listen'); }),
        mode('problem', '🎯', 'Meine Problemstellen', probs.length ? probs.length + ' Dinge zum Üben' : 'Nach dem Üben hier', function () { start('problem'); }, !probs.length),
        mode('exam', '📝', 'Prüfung üben', '22 Aufgaben wie in der Arbeit', function () { start('exam'); }, false, phase !== 'lernen')])
    ]);
    app.setView(v, { back: false });
  }
  function mode(id, icon, title, sub, fn, disabled, featured) {
    return h('button', { class: 'mode' + (featured ? ' featured' : ''), type: 'button', 'data-menu': id, disabled: disabled ? true : null, onclick: fn }, [
      h('span', { class: 'm-icon', text: icon }), h('span', { class: 'm-text' }, [h('span', { class: 'm-title', text: title }), h('span', { class: 'm-sub', text: sub })])]);
  }

  // Answer style for "Welches Land?" and "Hauptstädte"
  function chooser(kind) {
    var opts = [['auto', '🤖 Automatisch', 'Erst mit Auswahl, dann selbst schreiben – je nachdem, wie sicher du bist.'],
                ['choice', '🔘 Mit Auswahl', 'Du tippst die richtige Antwort an.'],
                ['type', '⌨️ Selbst schreiben', 'Rechtschreibfehler kosten nichts – wir üben sie nur.']];
    if (kind === 'cap') opts.push(['listen', '🎧 Hören & schreiben', 'Du hörst den Satz und schreibst die Hauptstadt.']);
    app.setView(h('section', { class: 'chooser' }, [
      h('h1', { class: 'screen-h', text: TITLES[kind] }),
      h('p', { class: 'screen-sub', text: 'Wie möchtest du antworten?' }),
      h('div', { class: 'modes' }, opts.map(function (o) {
        return mode('ans-' + o[0], o[1].split(' ')[0], o[1].split(' ').slice(1).join(' '), o[2], function () { start(kind, { answer: o[0] === 'auto' ? null : o[0] }); });
      }))]), { back: true });
  }
  function physChooser() {
    var types = [['sea', '🌊', 'Meere'], ['river', '〰️', 'Flüsse'], ['mountain', '🏔️', 'Gebirge'], ['island', '🏝️', 'Inseln'], ['place', '📍', 'Orte']];
    app.setView(h('section', { class: 'chooser' }, [
      h('h1', { class: 'screen-h', text: '🏔️ Europa entdecken' }),
      h('p', { class: 'screen-sub', text: 'Was möchtest du üben?' }),
      h('div', { class: 'modes' }, [mode('phys-all', '🗺️', 'Alles gemischt', 'Meere, Flüsse, Gebirge, Inseln, Orte', function () { start('physisch'); })].concat(types.map(function (t) {
        return mode('phys-' + t[0], t[1], t[2], '', function () { start('physisch', { types: [t[0]] }); });
      }))),
      h('div', { class: 'row' }, [h('button', { class: 'btn soft', type: 'button', text: '🧭 Erst auf der Karte anschauen', onclick: function () { ET.screens.explore(app, { layers: { sea: true, river: true, mountain: true, island: true, place: true, labels: true } }); } })])
    ]), { back: true });
  }

  // ------------------------------------------------------------ router
  function render() {
    var r = (location.hash || '').replace(/^#\/?/, '') || 'home';
    if (r === 'eltern') return ET.screens.parent(app);
    if (r === 'entdecken') return ET.screens.explore(app);
    if (r === 'grenzen') return ET.screens.borders(app);
    if (r === 'wissen') return ET.screens.flashcards(app);
    if (r === 'runde') return home();
    return home();
  }
  window.addEventListener('hashchange', render);
  document.getElementById('parent-link').addEventListener('click', function (e) { e.preventDefault(); app.go('eltern'); });
  render();

  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.self === window.top) navigator.serviceWorker.register('sw.js').catch(function () {});
  } catch (e) { /* ignore */ }
})(typeof window !== 'undefined' ? window : globalThis);
