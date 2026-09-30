/*
 * mapview.js — the interactive map of Europe (SVG from data/map.js).
 *
 *   var m = ET.mapview.create({ layers: { sea, river, mountain, island, place, capitals, labels },
 *                               pick: 'country' | 'sea' | 'river' | 'mountain' | 'island' | 'place' | 'any' });
 *   el.appendChild(m.el);
 *   m.onPick(function (id) {...});            ids: country-polen, sea-ostsee, river-donau, …
 *   m.mark(id, 'hl' | 'right' | 'wrong' | 'reveal' | 'hint' | 'done');  m.clearMarks();
 *   m.showLabel(id); m.zoomTo(id); m.resetView();
 *
 * Tablet-friendly: pinch or +/− to zoom, drag to move, and generous tap areas
 * (tiny states, small islands, rivers and places are found by nearest distance).
 */
(function (root) {
  'use strict';
  var MAP = root.ET_MAP, NS = 'http://www.w3.org/2000/svg', CUR = root.ET.curriculum;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var NAME = {};
  CUR.countries.forEach(function (c) { NAME['country-' + c.id] = c.name; });
  CUR.features.forEach(function (f) { NAME[f.type + '-' + f.id] = f.name; });

  function create(opts) {
    opts = opts || {};
    var layers = Object.assign({}, opts.layers || {});
    var wrap = document.createElement('div');
    wrap.className = 'map';
    var svg = el('svg', { viewBox: '0 0 ' + MAP.w + ' ' + MAP.h, class: 'map-svg', role: 'img', 'aria-label': 'Karte von Europa' });
    wrap.appendChild(svg);
    el('rect', { x: -2000, y: -2000, width: MAP.w + 4000, height: MAP.h + 4000, class: 'm-water' }, svg);
    var gSea = el('g', { class: 'l-sea' }, svg), gLand = el('g', { class: 'l-land' }, svg),
        gMount = el('g', { class: 'l-mountain' }, svg), gRiver = el('g', { class: 'l-river' }, svg),
        gIsland = el('g', { class: 'l-island' }, svg), gTiny = el('g', { class: 'l-tiny' }, svg),
        gCap = el('g', { class: 'l-capitals' }, svg), gPlace = el('g', { class: 'l-place' }, svg),
        gLab = el('g', { class: 'l-labels' }, svg), gTop = el('g', { class: 'l-top' }, svg);
    var shapes = {}, labels = {}, pts = {};

    MAP.seas.forEach(function (s) {
      shapes[s.id] = el('path', { d: s.d, class: 'f sea', 'data-id': s.id }, gSea);
      labels[s.id] = text(s.label, NAME[s.id], 'lab lab-sea');
    });
    MAP.countries.forEach(function (c) {
      var p = el('path', { d: c.d, class: 'f country' + (c.key ? ' cur' : ' bg'), 'data-id': c.id }, gLand);
      if (c.id) { shapes[c.id] = p; if (c.label) labels[c.id] = text(c.label, NAME[c.id], 'lab lab-country'); }
    });
    MAP.mountains.forEach(function (m) {
      shapes[m.id] = el('path', { d: m.d, class: 'f mountain', 'data-id': m.id }, gMount);
      labels[m.id] = text(m.label, NAME[m.id], 'lab lab-mountain');
    });
    var riverSamples = null;
    MAP.rivers.forEach(function (r) {
      var g = el('g', { class: 'river-g', 'data-for': r.id }, gRiver);
      el('path', { d: r.d, class: 'river-casing', 'stroke-width': r.width + 2.4 }, g);
      shapes[r.id] = el('path', { d: r.d, class: 'f river', 'stroke-width': r.width, 'data-id': r.id }, g);
      labels[r.id] = text(r.label, NAME[r.id], 'lab lab-river');
    });
    MAP.islands.forEach(function (i) {
      shapes[i.id] = el('path', { d: i.d, class: 'f island', 'data-id': i.id }, gIsland);
      pts[i.id] = { xy: i.label, r: i.hit };
      labels[i.id] = text([i.label[0], i.label[1] - i.hit - 3], NAME[i.id], 'lab lab-island');
    });
    var active = opts.active || null;            // mapIds that may be picked (quiz: only active material)
    Object.keys(MAP.tiny).forEach(function (cid) {
      var id = 'country-' + cid, p = MAP.tiny[cid];
      if (!shapes[id] || (active && !active[id])) return;
      el('circle', { cx: p[0], cy: p[1], r: 7, class: 'tiny-halo', 'data-id': id }, gTiny);
      pts[id] = { xy: p, r: 9, tiny: true };
    });
    Object.keys(MAP.capitals).forEach(function (cid) {
      var c = CUR.countries.filter(function (x) { return x.id === cid; })[0];
      if (!c || !c.capital) return;
      var p = MAP.capitals[cid];
      el('circle', { cx: p[0], cy: p[1], r: 2.6, class: 'cap-dot', 'data-cap': cid }, gCap);
      labels['cap-' + cid] = text([p[0] + 4, p[1] - 4], c.capital, 'lab lab-cap');
      labels['cap-' + cid].setAttribute('text-anchor', 'start');
    });
    MAP.places.forEach(function (pl) {
      var g = el('g', { class: 'place', 'data-id': pl.id, transform: 'translate(' + pl.xy[0] + ' ' + pl.xy[1] + ')' }, gPlace);
      el('circle', { r: 9, class: 'place-halo' }, g);
      el('circle', { r: 4.2, class: 'f place-dot', 'data-id': pl.id }, g);
      shapes[pl.id] = g;
      pts[pl.id] = { xy: pl.xy, r: 12 };
      labels[pl.id] = text([pl.xy[0], pl.xy[1] - 11], NAME[pl.id], 'lab lab-place');
    });

    function text(xy, str, cls) {
      if (!xy || !str) return null;
      var t = el('text', { x: xy[0], y: xy[1], class: cls }, gLab);
      t.textContent = str;
      return t;
    }

    // ------------------------------------------------ layers
    function applyLayers() {
      ['sea', 'river', 'mountain', 'island', 'place', 'capitals'].forEach(function (k) { wrap.classList.toggle('show-' + k, !!layers[k]); });
      wrap.classList.toggle('show-labels', !!layers.labels);
    }
    applyLayers();

    // ------------------------------------------------ zoom & pan (viewBox)
    var view = { x: 0, y: 0, w: MAP.w, h: MAP.h };
    function setView(v, animate) {
      var minW = 140, maxW = MAP.w;
      v.w = Math.max(minW, Math.min(maxW, v.w)); v.h = v.w * MAP.h / MAP.w;
      v.x = Math.max(-40, Math.min(MAP.w - v.w + 40, v.x)); v.y = Math.max(-40, Math.min(MAP.h - v.h + 40, v.y));
      view = v;
      svg.setAttribute('viewBox', v.x.toFixed(1) + ' ' + v.y.toFixed(1) + ' ' + v.w.toFixed(1) + ' ' + v.h.toFixed(1));
      wrap.classList.toggle('zoomed', v.w < MAP.w * 0.9);
      svg.style.setProperty('--z', (MAP.w / v.w).toFixed(2));
    }
    function zoomAt(factor, cx, cy) {
      var nw = view.w / factor;
      if (cx == null) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
      setView({ x: cx - (cx - view.x) * (nw / view.w), y: cy - (cy - view.y) * (nw / view.w), w: nw, h: 0 });
    }
    function toSvg(clientX, clientY) {
      var pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
      var mtx = svg.getScreenCTM();
      return mtx ? pt.matrixTransform(mtx.inverse()) : { x: 0, y: 0 };
    }
    function unitsPerPx() { var r = svg.getBoundingClientRect(); return view.w / Math.max(1, r.width); }

    var ctrl = document.createElement('div');
    ctrl.className = 'zoom-ctrl';
    ctrl.innerHTML = '<button type="button" data-z="in" aria-label="Vergrößern">+</button><button type="button" data-z="out" aria-label="Verkleinern">−</button><button type="button" data-z="all" aria-label="Ganz Europa">⤢</button>';
    wrap.appendChild(ctrl);
    ctrl.addEventListener('click', function (e) {
      var z = e.target.getAttribute && e.target.getAttribute('data-z');
      if (z === 'in') zoomAt(1.6); else if (z === 'out') zoomAt(1 / 1.6); else if (z === 'all') setView({ x: 0, y: 0, w: MAP.w, h: MAP.h });
    });
    svg.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !wrap.classList.contains('zoomed') && Math.abs(e.deltaY) < 40) return;
      e.preventDefault();
      var p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
    }, { passive: false });

    var pointers = {}, drag = null, moved = false, pinch = null;
    svg.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) { drag = { x: e.clientX, y: e.clientY, view: Object.assign({}, view) }; moved = false; }
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: Object.assign({}, view), c: toSvg((a.x + b.x) / 2, (a.y + b.y) / 2) };
        drag = null; moved = true;
      }
    });
    svg.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        var f = d / pinch.d, nw = pinch.view.w / f, c = pinch.c;
        setView({ x: c.x - (c.x - pinch.view.x) * (nw / pinch.view.w), y: c.y - (c.y - pinch.view.y) * (nw / pinch.view.w), w: nw, h: 0 });
        e.preventDefault();
      } else if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        if (!wrap.classList.contains('zoomed')) return;       // whole map: no panning needed
        moved = true;
        var u = unitsPerPx();
        setView({ x: drag.view.x - dx * u, y: drag.view.y - dy * u, w: drag.view.w, h: 0 });
        e.preventDefault();
      }
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (!Object.keys(pointers).length) drag = null;
    }
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.style.touchAction = 'none';

    // ------------------------------------------------ picking
    var pickKind = opts.pick || null, pickCb = null;
    function samples() {
      if (riverSamples) return riverSamples;
      riverSamples = MAP.rivers.map(function (r) {
        var p = shapes[r.id], len = p.getTotalLength(), out = [];
        for (var t = 0; t <= len; t += 2) { var q = p.getPointAtLength(t); out.push([q.x, q.y]); }
        return { id: r.id, pts: out };
      });
      return riverSamples;
    }
    function nearest(list, p, maxPx) {
      var best = null, bd = 1e9, u = unitsPerPx();
      list.forEach(function (o) { var d = Math.hypot(o.xy[0] - p.x, o.xy[1] - p.y) - (o.r || 0); if (d < bd) { bd = d; best = o.id; } });
      return bd <= maxPx * u ? best : null;
    }
    function under(clientX, clientY, prefix) {
      var list = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [document.elementFromPoint(clientX, clientY)];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || !svg.contains(e)) continue;
        var id = e.getAttribute('data-id') || (e.parentNode && e.parentNode.getAttribute && e.parentNode.getAttribute('data-id'));
        if (id && (!prefix || id.indexOf(prefix + '-') === 0)) return id;
        if (prefix === 'country' && e.classList && e.classList.contains('bg')) return 'bg';
      }
      return null;
    }
    function pickAt(clientX, clientY, kind) {
      kind = kind || pickKind;
      var p = toSvg(clientX, clientY);
      if (kind === 'river' || kind === 'river-near' || kind === 'river-on') {
        var best = null, bd = 1e9;
        samples().forEach(function (r) { r.pts.forEach(function (q) { var d = Math.hypot(q[0] - p.x, q[1] - p.y); if (d < bd) { bd = d; best = r.id; } }); });
        return bd <= (kind === 'river' ? 20 : kind === 'river-near' ? 9 : 4) * unitsPerPx() ? best : null;   // exploring: only right on the line
      }
      if (kind === 'place' || kind === 'place-near') return nearest(MAP.places.map(function (pl) { return { id: pl.id, xy: pl.xy }; }), p, kind === 'place' ? 26 : 14);
      if (kind === 'island') {
        var hit = under(clientX, clientY, 'island');
        return hit || nearest(MAP.islands.map(function (i) { return { id: i.id, xy: i.label, r: i.hit }; }), p, 14);
      }
      if (kind === 'country') {
        // Tiny states win only when tapped right on them; otherwise the country under the finger.
        var tinyList = Object.keys(pts).filter(function (k) { return pts[k].tiny && (!active || active[k]); }).map(function (k) { return { id: k, xy: pts[k].xy }; });
        var tiny = nearest(tinyList, p, 7);
        if (tiny) return tiny;
        var c = under(clientX, clientY, 'country');
        if (c && c !== 'bg' && active && !active[c]) return 'bg';
        return c || nearest(tinyList, p, 14);
      }
      if (kind === 'mountain') {
        var m = under(clientX, clientY, 'mountain');
        if (m) return m;
        for (var k = 0; k < 8; k++) {       // fingers are wide: look a little around
          var a = k * Math.PI / 4, r = 14;
          m = under(clientX + Math.cos(a) * r, clientY + Math.sin(a) * r, 'mountain');
          if (m) return m;
        }
        return null;
      }
      if (kind === 'sea') return under(clientX, clientY, 'sea');
      if (kind === 'any') {
        return (layers.place && pickAt(clientX, clientY, 'place-near')) || (layers.river && pickAt(clientX, clientY, 'river-on')) ||
               (layers.island && pickAt(clientX, clientY, 'island')) || (layers.mountain && under(clientX, clientY, 'mountain')) ||
               (layers.river && pickAt(clientX, clientY, 'river-near')) ||
               pickAt(clientX, clientY, 'country') || (layers.sea && under(clientX, clientY, 'sea')) || null;
      }
      return null;
    }
    svg.addEventListener('click', function (e) {
      if (moved) { moved = false; return; }
      if (!pickCb || !pickKind) return;
      pickCb(pickAt(e.clientX, e.clientY), e);
    });
    if (pickKind) wrap.classList.add('pick-' + pickKind);

    // ------------------------------------------------ marks & labels
    function node(id) {
      var s = shapes[id]; if (!s) return null;
      return s.parentNode && s.parentNode.classList && s.parentNode.classList.contains('river-g') ? s.parentNode : s;
    }
    function mark(id, cls, on) {
      var s = shapes[id]; if (!s) return;
      on = on !== false;
      s.classList.toggle('is-' + cls, on);
      var n = node(id);
      if (n !== s) n.classList.toggle('is-' + cls, on);
      if (on && n.parentNode) n.parentNode.appendChild(n);          // bring to front
      var halo = svg.querySelector('.tiny-halo[data-id="' + id + '"]');
      if (halo) halo.classList.toggle('is-' + cls, on);
    }
    function clearMarks() {
      svg.querySelectorAll('[class*="is-"]').forEach(function (e) {
        e.setAttribute('class', e.getAttribute('class').split(' ').filter(function (c) { return c.indexOf('is-') !== 0; }).join(' '));
      });
      gTop.innerHTML = '';
    }
    function showLabel(id, on) { if (labels[id]) labels[id].classList.toggle('on', on !== false); }
    function hideLabels() { Object.keys(labels).forEach(function (k) { if (labels[k]) labels[k].classList.remove('on'); }); }
    function bbox(id) {
      if (pts[id] && !shapes[id]) return { x: pts[id].xy[0] - 10, y: pts[id].xy[1] - 10, width: 20, height: 20 };
      var s = shapes[id]; if (!s || !s.getBBox) return null;
      try { return s.getBBox(); } catch (e) { return null; }
    }
    // Zoom so that a small feature is clearly visible (only when it is small).
    function zoomTo(id, minW) {
      var b = bbox(id); if (!b) return;
      var size = Math.max(b.width, b.height * MAP.w / MAP.h);
      if (size > MAP.w * 0.12 && !minW) { setView({ x: 0, y: 0, w: MAP.w, h: MAP.h }); return; }
      var w = Math.max(minW || 300, size * 3.2);
      setView({ x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - (w * MAP.h / MAP.w) / 2, w: w, h: 0 });
    }
    // A soft circle around the right area (second wrong try: "Tipp")
    function hintAround(id) {
      var b = bbox(id); if (!b) return;
      var r = Math.max(b.width, b.height) / 2 + 40;
      el('circle', { cx: b.x + b.width / 2 + (Math.random() - 0.5) * r * 0.5, cy: b.y + b.height / 2 + (Math.random() - 0.5) * r * 0.5, r: r, class: 'hint-ring' }, gTop);
    }
    function clientPointOf(id) {
      var p = null;
      if (pts[id]) p = pts[id].xy;
      else if (id.indexOf('river-') === 0) { var s = shapes[id], L = s.getTotalLength(); var q = s.getPointAtLength(L * 0.45); p = [q.x, q.y]; }
      else {
        var src = [].concat(MAP.countries, MAP.seas, MAP.mountains).filter(function (x) { return x.id === id; })[0];
        if (src) p = src.label;
      }
      if (!p) return null;
      var pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
      var r = pt.matrixTransform(svg.getScreenCTM());
      return [r.x, r.y];
    }

    return {
      el: wrap, svg: svg, shapes: shapes, labels: labels,
      onPick: function (cb) { pickCb = cb; },
      setPick: function (k) { if (pickKind) wrap.classList.remove('pick-' + pickKind); pickKind = k; if (k) wrap.classList.add('pick-' + k); },
      pickAt: pickAt, mark: mark, clearMarks: clearMarks, showLabel: showLabel, hideLabels: hideLabels,
      setLayers: function (l) { layers = Object.assign(layers, l); applyLayers(); },
      layers: function () { return Object.assign({}, layers); },
      zoomTo: zoomTo, resetView: function () { setView({ x: 0, y: 0, w: MAP.w, h: MAP.h }); },
      hintAround: hintAround, clientPointOf: clientPointOf, nameOf: function (id) { return NAME[id] || ''; }
    };
  }

  root.ET.mapview = { create: create, NAME: NAME };
})(typeof window !== 'undefined' ? window : globalThis);
