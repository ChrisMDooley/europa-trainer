/*
 * platform.js — the ONLY place that knows about Robin's Bobins.
 *
 * Contract (see README "Robin's Bobins"):
 *   - Robin's Bobins opens this app as  …/europa-trainer/?child=<id>
 *   - If the Robin's Bobins SDK is reachable on the same site (../robins-bobins/shared/rb.js,
 *     loaded by index.html, allowed to fail), we use it for: the family PIN screen, the child's
 *     name, the "‹ Meine Apps" link, Robin's picture, Robin-Münzen (the ONE family balance) and one
 *     activity record per finished round (streaks and "heute geübt" on the family home).
 *   - Without it (development, file://, another host) the app runs on its own as Lukas.
 */
(function (root) {
  'use strict';
  var RB = root.RB || null;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location ? root.location.search : '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  var childId = param('child') || (RB && RB.currentChildId && RB.currentChildId()) || 'lukas';
  var rbChild = RB && RB.child ? RB.child(childId) : null;
  if (RB && rbChild && RB.selectChild) RB.selectChild(childId);

  var platform = {
    connected: !!(RB && rbChild),
    childId: childId,
    childName: rbChild ? rbChild.name : (childId.charAt(0).toUpperCase() + childId.slice(1)),
    homeUrl: RB && rbChild ? RB.nav.homeUrl(childId) : null,
    robin: function (pose, size) {
      if (RB && RB.robin) return RB.robin.el(pose || 'normal', size);
      var s = document.createElement('span');
      s.className = 'robin robin-fallback'; s.textContent = '🐕'; s.setAttribute('aria-hidden', 'true');
      if (size) s.style.fontSize = Math.round(size * 0.7) + 'px';
      return s;
    },
    recordActivity: function (summary) {
      if (!(RB && rbChild && RB.activity)) return;
      try {
        RB.activity.record(childId, { app: 'europa', kind: 'session', startedAt: summary.startedAt, endedAt: summary.endedAt,
          summary: { mode: summary.mode, answered: summary.total, right: summary.right } });
      } catch (e) { /* never block practice */ }
    },
    // Robin-Münzen: only with Robin's Bobins (the balance is the family one). Never taken away.
    coins: {
      available: !!(RB && rbChild && RB.coins),
      balance: function () { try { return RB && rbChild ? RB.coins.balance(childId) : 0; } catch (e) { return 0; } },
      add: function (amount, reason) {
        if (!(RB && rbChild && RB.coins) || !(amount > 0)) return 0;
        try { RB.coins.add(childId, { amount: amount, reason: reason || 'Europa geübt', app: 'europa' }); return amount; }
        catch (e) { return 0; }
      }
    },
    // Parent area: use the family PIN when there is one.
    parentCheck: function (pin) { return !(RB && RB.parent && RB.parent.hasPin()) || RB.parent.checkPin(pin); },
    parentHasPin: function () { return !!(RB && RB.parent && RB.parent.hasPin()); }
  };

  root.ET = root.ET || {};
  root.ET.platform = platform;
})(typeof window !== 'undefined' ? window : globalThis);
