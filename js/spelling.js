/*
 * spelling.js — separates KNOWING the answer from SPELLING it (brief §5). No DOM.
 *
 *   ET.spelling.classify(typed, target, { alts, domain })
 *     → { verdict: 'right' | 'known' | 'wrong', matched, note, other }
 *
 *   right  exactly one of the accepted spellings (upper/lower case at the start is forgiven,
 *          but reported as note 'gross' so the app can mention it gently)
 *   known  he clearly means this answer but spelled it differently → geography counts as
 *          right, the word goes to Schreibtraining
 *   wrong  another answer, or too far away to be sure
 *
 * "known" needs BOTH:
 *   1. closeness — small edit distance for the word length, or the same German sound code
 *      (Kölner Phonetik: Sagreb/Zagreb, Lubliana/Ljubljana, Buckarest/Bukarest) with a
 *      moderate distance;
 *   2. uniqueness — the typed word is clearly closer to this answer than to any OTHER answer
 *      of the same kind (all countries, all capitals, …). "Bukapest" is as close to Bukarest as
 *      to Budapest → not credited. Typing another real answer ("Bukarest" for Ungarn) is always
 *      wrong.
 */
(function (root) {
  'use strict';

  function strip(s) {                         // remove accents: Chișinău → Chisinau, Reykjavík → Reykjavik
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  // spacing and hyphens never matter; case is handled separately
  function tidy(s) { return String(s || '').trim().replace(/[\s ]+/g, ' ').replace(/\s*-\s*/g, '-'); }
  // loose form for comparing: lower case, no accents, ß→ss, ä→ae…, only letters
  function loose(s) {
    return strip(String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'))
      .replace(/[^a-z]/g, '');
  }

  // Edit distance with swaps (Damerau): "Wein" for "Wien" is one mistake, not two.
  function lev(a, b) {
    var m = a.length, n = b.length, D = [], i, j;
    for (i = 0; i <= m; i++) { D[i] = []; for (j = 0; j <= n; j++) D[i][j] = i === 0 ? j : j === 0 ? i : 0; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) D[i][j] = Math.min(D[i][j], D[i - 2][j - 2] + 1);
    }
    return D[m][n];
  }

  // Kölner Phonetik — a German sound code. Words that sound alike get the same code.
  function koelner(word) {
    var s = loose(word).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
    if (!s) return '';
    var out = [], i, c, prev, next, code;
    for (i = 0; i < s.length; i++) {
      c = s[i]; prev = s[i - 1] || ''; next = s[i + 1] || '';
      if ('aeijouy'.indexOf(c) >= 0) code = '0';
      else if (c === 'h') code = '-';
      else if (c === 'b') code = '1';
      else if (c === 'p') code = next === 'h' ? '3' : '1';
      else if (c === 'd' || c === 't') code = 'csz'.indexOf(next) >= 0 ? '8' : '2';
      else if ('fvw'.indexOf(c) >= 0) code = '3';
      else if ('gkq'.indexOf(c) >= 0) code = '4';
      else if (c === 'c') {
        if (i === 0) code = 'ahkloqrux'.indexOf(next) >= 0 ? '4' : '8';
        else code = ('sz'.indexOf(prev) < 0 && 'ahkoqux'.indexOf(next) >= 0) ? '4' : '8';
      }
      else if (c === 'x') code = 'ckq'.indexOf(prev) >= 0 ? '8' : '48';
      else if (c === 'l') code = '5';
      else if (c === 'm' || c === 'n') code = '6';
      else if (c === 'r') code = '7';
      else if (c === 's' || c === 'z') code = '8';
      else code = '';
      out.push(code);
    }
    var joined = out.join(''), res = '';
    for (i = 0; i < joined.length; i++) {
      if (joined[i] === '-') continue;
      if (res && res[res.length - 1] === joined[i]) continue;
      res += joined[i];
    }
    return res.charAt(0) + res.slice(1).replace(/0/g, '');
  }

  function tolerance(len) { return len <= 4 ? 1 : len <= 7 ? 2 : len <= 11 ? 3 : 4; }

  // How far is `typed` from `form`? (in loose space; phonetic sameness counts as closer)
  function distance(typed, form) {
    var a = loose(typed), b = loose(form);
    var d = lev(a, b);
    var phon = koelner(a) === koelner(b);
    return { d: d, phon: phon, len: b.length };
  }
  function close(dist) {
    if (dist.d <= tolerance(dist.len)) return true;
    return dist.phon && dist.d <= Math.ceil(dist.len * 0.5);
  }

  function classify(typed, target, opts) {
    opts = opts || {};
    var forms = [target].concat(opts.alts || []);
    var t = tidy(typed);
    if (!t) return { verdict: 'wrong', empty: true };
    // 1. exactly right (one of the accepted spellings)
    for (var i = 0; i < forms.length; i++) {
      var f = tidy(forms[i]);
      if (t === f) return { verdict: 'right', matched: forms[i] };
      if (t.toLowerCase() === f.toLowerCase()) return { verdict: 'right', matched: forms[i], note: 'gross' };
    }
    // 2. another real answer of the same kind → wrong, and say which one it was
    var domain = opts.domain || [];
    for (i = 0; i < domain.length; i++) {
      var other = domain[i];
      if (other.forms.indexOf(target) >= 0) continue;
      for (var k = 0; k < other.forms.length; k++) {
        if (loose(other.forms[k]) === loose(t)) return { verdict: 'wrong', other: other };
      }
    }
    // 3. close enough to this answer, and clearly closer to it than to any other answer
    var best = null;
    forms.forEach(function (f) { var d = distance(t, f); if (!best || d.d < best.d) best = Object.assign({ form: f }, d); });
    if (!close(best)) return { verdict: 'wrong' };
    for (i = 0; i < domain.length; i++) {
      if (domain[i].forms.indexOf(target) >= 0) continue;
      for (k = 0; k < domain[i].forms.length; k++) {
        var o = distance(t, domain[i].forms[k]);
        if (o.d <= best.d && (close(o) || o.d === best.d)) return { verdict: 'wrong', ambiguous: domain[i] };
      }
    }
    var onlyLetters = loose(t) === loose(best.form);      // e.g. Osterreich, Weissrussland, Luxemburg-Stadt
    return { verdict: 'known', matched: best.form, note: onlyLetters ? 'umlaut' : '' };
  }

  // ---------------------------------------------------------------- teaching helpers

  // Where did the attempt differ? Returns the target split into {ch, bad} for display.
  function diff(target, typed) {
    var a = String(target), b = String(typed || '');
    var A = a.toLowerCase(), B = b.toLowerCase(), m = A.length, n = B.length, i, j;
    var D = [];
    for (i = 0; i <= m; i++) { D[i] = [i]; for (j = 1; j <= n; j++) D[i][j] = i === 0 ? j : 0; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    var out = [], extraBefore = {};
    i = m; j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) {
        out.unshift({ ch: a[i - 1], bad: A[i - 1] !== B[j - 1] || a[i - 1] !== b[j - 1] && i === 1 }); i--; j--;
      } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
        out.unshift({ ch: a[i - 1], bad: true, missing: true }); i--;
      } else { extraBefore[i] = true; j--; }
    }
    // mark the letter after an inserted extra letter, so the spot is visible
    out.forEach(function (o, idx) { if (extraBefore[idx]) o.extraBefore = true; });
    return out;
  }

  // Progressive hints: 1 = every other letter ("L _ u _ l _ a _ a"), 2 = chunks, 3 = whole word.
  function hint(word, syl, level) {
    if (level >= 3) return word;
    if (level === 2) return (syl || chunks(word)).split('-').join(' – ');
    var out = [], k = 0;
    for (var i = 0; i < word.length; i++) {
      var c = word[i];
      if (c === ' ' || c === '-') { out.push(c === ' ' ? '   ' : '-'); k = 0; continue; }
      out.push(k % 2 === 0 ? c : '_'); k++;
    }
    return out.join(' ').replace(/ {4,}/g, '   ');
  }

  // Simple German-style chunking when no syllables are given (fallback only).
  function chunks(word) {
    var V = 'aeiouyäöüAEIOUYÄÖÜ';
    return String(word).split(' ').map(function (w) {
      var out = '', i;
      for (i = 0; i < w.length; i++) {
        out += w[i];
        var a = w[i], b = w[i + 1], c = w[i + 2];
        if (!b || !c) continue;
        if (V.indexOf(a) >= 0 && V.indexOf(b) < 0 && V.indexOf(c) >= 0 && i > 0) out += '-';
      }
      return out;
    }).join(' ');
  }

  root.ET = root.ET || {};
  root.ET.spelling = { classify: classify, loose: loose, lev: lev, koelner: koelner, diff: diff, hint: hint, chunks: chunks, tolerance: tolerance };
})(typeof window !== 'undefined' ? window : globalThis);
