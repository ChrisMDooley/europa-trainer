/*
 * rb-card.js — the one line Robin's Bobins shows on Europa-Trainer's card
 * ("Noch 35 Tage bis zur Europa-Arbeit · heute 24 Fragen"). Loaded by the Robin's Bobins
 * home page from ../europa-trainer/rb-card.js; reads only this app's own storage.
 */
(function (root) {
  'use strict';
  var DEFAULT_EXAM = '2026-11-04';
  function days(d) {
    var t = new Date(d + 'T08:00:00'), n = new Date();
    return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
  }
  root.RBEuropa = {
    cardInfo: function (childId) {
      var doc = null;
      try { doc = JSON.parse(localStorage.getItem('europa-trainer:' + childId) || 'null'); } catch (e) { doc = null; }
      var exam = (doc && doc.settings && doc.settings.examDate) || DEFAULT_EXAM;
      var today = new Date().toDateString();
      var n = doc ? doc.log.filter(function (a) { return new Date(a.ts).toDateString() === today; }).length : 0;
      var d = days(exam), parts = [];
      if (d > 1) parts.push('Noch ' + d + ' Tage bis zur Europa-Arbeit');
      else if (d === 1) parts.push('Morgen Europa-Arbeit!');
      else if (d === 0) parts.push('Heute Europa-Arbeit – viel Erfolg!');
      if (n) parts.push('heute ' + n + ' Fragen');
      return parts.join(' · ') || 'Länder, Hauptstädte, Meere & Gebirge';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
