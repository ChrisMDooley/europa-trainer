/*
 * speech.js — German text-to-speech via the browser's Web Speech API.
 *
 * Voices differ per device, so we rank the available German voices and let a
 * parent override the choice in the settings. Nothing leaves the device except
 * where the OS itself uses an online voice (e.g. "Google Deutsch" in Chrome).
 *
 * Copied from Diktat-Trainer (sibling app) — kept identical on purpose so both apps pick
 * the same voice. Later a recorded-audio source can implement the same speak() signature.
 */
(function (root) {
  'use strict';
  var synth = root.speechSynthesis;
  var voices = [];
  var listeners = [];

  // Higher score = better. Names from macOS/iOS, Android/Chrome, Windows/Edge.
  function score(v) {
    var n = v.name.toLowerCase(), s = 0;
    if (/^de[-_]de/i.test(v.lang)) s += 20; else if (/^de/i.test(v.lang)) s += 10;
    if (/natural|neural|online/.test(n)) s += 30;         // Edge/Windows natural voices
    if (/premium|enhanced|erweitert|verbessert/.test(n)) s += 25; // Apple downloaded voices
    if (/google/.test(n)) s += 15;
    if (/anna|petra|markus|helena|katja|conrad|amala|seraphina|florian/.test(n)) s += 10;
    if (/eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|oma|opa/.test(n)) s -= 20; // novelty voices
    if (v.localService) s += 2;
    return s;
  }

  function refresh() {
    if (!synth) return;
    voices = synth.getVoices().filter(function (v) { return /^de/i.test(v.lang); })
      .sort(function (a, b) { return score(b) - score(a); });
    listeners.forEach(function (fn) { try { fn(voices); } catch (e) { /* ignore */ } });
  }

  if (synth) {
    refresh();
    if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', refresh);
    // Some browsers (Safari) never fire the event; poll briefly.
    var tries = 0, poll = setInterval(function () {
      tries++; if (voices.length || tries > 20) { clearInterval(poll); if (!voices.length) refresh(); }
      else refresh();
    }, 250);
  }

  function pickVoice(preferredName) {
    if (preferredName) {
      for (var i = 0; i < voices.length; i++) if (voices[i].name === preferredName) return voices[i];
    }
    return voices[0] || null;
  }

  var currentUtterance = null; // keep a reference: Chrome can garbage-collect it mid-sentence

  function speak(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!synth) { resolve(false); return; }
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var v = pickVoice(opts.voiceName);
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'de-DE';
      u.rate = opts.slow ? (opts.slowRate || 0.6) : (opts.rate || 0.9);
      u.pitch = 1;
      u.onend = function () { resolve(true); };
      u.onerror = function () { resolve(false); };
      currentUtterance = u;
      // Tiny delay after cancel() avoids a Safari/Chrome bug where the new
      // utterance is swallowed.
      setTimeout(function () { synth.speak(u); }, 60);
    });
  }

  function stop() { if (synth) synth.cancel(); }

  root.ET = root.ET || {};
  root.ET.speech = {
    supported: !!synth,
    speak: speak,
    stop: stop,
    voices: function () { return voices.slice(); },
    onVoices: function (fn) { listeners.push(fn); if (voices.length) fn(voices); },
    pickVoice: pickVoice,
    _current: function () { return currentUtterance; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
