/*
 * ui.js — small DOM helpers shared by all screens.
 */
(function (root) {
  'use strict';
  var SP = root.ET.speech;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  var settingsRef = null;
  function speak(text, slow) {
    var st = settingsRef ? settingsRef() : {};
    return SP.speak(text, { slow: slow, slowRate: st.slowRate || 0.6, voiceName: st.voice || '' });
  }
  // 🔊 and 🐢 buttons (normal / slow). Replay as often as wanted.
  function speakButtons(text, opts) {
    opts = opts || {};
    if (!SP.supported) return h('span', { class: 'no-voice', text: '(Vorlesen geht in diesem Browser nicht)' });
    return h('span', { class: 'speak' + (opts.big ? ' big' : '') }, [
      h('button', { class: 'sbtn', type: 'button', title: 'Anhören', 'aria-label': 'Anhören', onclick: function () { speak(text, false); } }, ['🔊', opts.big ? h('span', { text: ' Anhören' }) : null]),
      h('button', { class: 'sbtn slow', type: 'button', title: 'Langsam', 'aria-label': 'Langsam anhören', onclick: function () { speak(text, true); } }, ['🐢', opts.big ? h('span', { text: ' Langsam' }) : null])
    ]);
  }

  // The correct word, big, with the letters he got wrong gently marked.
  function wordDiff(target, typed) {
    var parts = root.ET.spelling.diff(target, typed);
    return h('span', { class: 'wdiff', 'aria-label': target }, parts.map(function (p) {
      return h('span', { class: (p.bad ? 'bad' : '') + (p.extraBefore ? ' extra' : ''), text: p.ch });
    }));
  }

  function syllables(word, syl) {
    var s = (syl || root.ET.spelling.chunks(word)).split('-');
    return h('span', { class: 'syl' }, s.map(function (x, i) { return h('span', { class: 'chunk c' + (i % 3), text: x }); }));
  }

  function robinSays(robinEl, text) {
    return h('div', { class: 'robin-says' }, [robinEl, h('p', { class: 'bubble', text: text })]);
  }

  function bar(sure, total, seen) {
    var pct = total ? Math.round(sure / total * 100) : 0, pseen = total ? Math.round(seen / total * 100) : 0;
    return h('span', { class: 'sbar', title: sure + ' von ' + total + ' sicher' }, [
      h('span', { class: 'sbar-seen', style: 'width:' + pseen + '%' }), h('span', { class: 'sbar-sure', style: 'width:' + pct + '%' })]);
  }

  // Robin-Münze (same look as on the Robin's Bobins home).
  function coin(size) {
    var c = h('span', { class: 'et-coin', 'aria-hidden': 'true' });
    if (size) c.style.width = c.style.height = size + 'px';
    return c;
  }
  // "+1" floating up from an element.
  function coinFloat(anchor, n) {
    if (!anchor || !anchor.getBoundingClientRect) return;
    var r = anchor.getBoundingClientRect();
    var f = h('div', { class: 'coin-float' }, [coin(22), h('span', { text: '+' + n })]);
    f.style.left = Math.round(r.left + r.width / 2) + 'px'; f.style.top = Math.round(r.top + 8) + 'px';
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 1100);
  }

  root.ET.ui = { h: h, coin: coin, coinFloat: coinFloat, speak: speak, speakButtons: speakButtons, wordDiff: wordDiff, syllables: syllables, robinSays: robinSays, bar: bar,
                 useSettings: function (fn) { settingsRef = fn; } };
})(typeof window !== 'undefined' ? window : globalThis);
