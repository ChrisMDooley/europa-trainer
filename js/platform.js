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
 *   - Guest link ?gast=<Name> (a classmate): index.html does not load the family SDK but the guest
 *     one (../robins-bobins/shared/guest.js → RBGuest): "‹ Start" to the guest's start page, one coin
 *     total, streak, the guest's parent PIN. Without it the guest still works, alone on the device.
 */
(function (root) {
  'use strict';
  var RB = root.RB || null;

  var guestName = root.ET_GUEST ? String(root.ET_GUEST).replace(/[^A-Za-zÄÖÜäöüßÀ-ÿ' -]/g, '').trim().slice(0, 24) : '';
  var guestId = guestName ? guestName.toLowerCase().replace(/[^a-zäöüßà-ÿ]+/g, '-').replace(/^-|-$/g, '') : '';
  if (guestId) RB = (RB && RB.robin) ? { robin: RB.robin } : null;   // never the family SDK for a guest
  var G = guestId && root.RBGuest && root.RBGuest.id === guestId ? root.RBGuest : null;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(root.location ? root.location.search : '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  var childId = guestId ? 'gast-' + guestId : (param('child') || (RB && RB.currentChildId && RB.currentChildId()) || 'lukas');
  var rbChild = RB && RB.child ? RB.child(childId) : null;
  if (RB && rbChild && RB.selectChild) RB.selectChild(childId);

  var platform = {
    connected: !!(RB && rbChild),
    childId: childId,
    guest: !!guestId,
    childName: guestId ? guestName.charAt(0).toUpperCase() + guestName.slice(1) : rbChild ? rbChild.name : (childId.charAt(0).toUpperCase() + childId.slice(1)),
    homeUrl: G ? G.startUrl : RB && rbChild ? RB.nav.homeUrl(childId) : null,
    robin: function (pose, size) {
      if (RB && RB.robin) return RB.robin.el(pose || 'normal', size);
      var s = document.createElement('span');
      s.className = 'robin robin-fallback'; s.textContent = '🐕'; s.setAttribute('aria-hidden', 'true');
      if (size) s.style.fontSize = Math.round(size * 0.7) + 'px';
      return s;
    },
    recordActivity: function (summary) {
      if (G) { try { G.activity.record('europa', { mode: summary.mode, answered: summary.total, right: summary.right }); } catch (e) { /* ignore */ } return; }
      if (!(RB && rbChild && RB.activity)) return;
      try {
        RB.activity.record(childId, { app: 'europa', kind: 'session', startedAt: summary.startedAt, endedAt: summary.endedAt,
          summary: { mode: summary.mode, answered: summary.total, right: summary.right } });
      } catch (e) { /* never block practice */ }
    },
    // Robin-Münzen: with Robin's Bobins the family balance; for a guest a counter on this device.
    // Never taken away.
    coins: guestId ? guestCoins() : {
      available: !!(RB && rbChild && RB.coins),
      balance: function () { try { return RB && rbChild ? RB.coins.balance(childId) : 0; } catch (e) { return 0; } },
      add: function (amount, reason) {
        if (!(RB && rbChild && RB.coins) || !(amount > 0)) return 0;
        try { RB.coins.add(childId, { amount: amount, reason: reason || 'Europa geübt', app: 'europa' }); return amount; }
        catch (e) { return 0; }
      }
    },
    // Parent area: the family PIN when there is one; a guest's own PIN when listed.
    parentCheck: function (pin) {
      if (guestId) return !G || G.checkPin(pin);
      return !(RB && RB.parent && RB.parent.hasPin()) || RB.parent.checkPin(pin);
    },
    parentHasPin: function () {
      if (guestId) return !!(G && G.hasPin());
      return !!(RB && RB.parent && RB.parent.hasPin());
    }
  };

  // A guest's coins: the guest total (start page) when guest.js is there, else a counter in this app.
  function guestCoins() {
    var OLD = 'europa-trainer-coins:gast-' + guestId;
    function readOld() { try { return Math.max(0, parseInt(root.localStorage.getItem(OLD), 10) || 0); } catch (e) { return 0; } }
    if (G) {
      var carry = readOld();                     // coins from before the start page existed
      if (carry) { G.coins.add(carry, 'Europa-Trainer (übernommen)', 'europa'); try { root.localStorage.removeItem(OLD); } catch (e) { /* ignore */ } }
      return { available: true, balance: G.coins.balance, add: function (n, reason) { return G.coins.add(n, reason, 'europa'); } };
    }
    return {
      available: true,
      balance: readOld,
      add: function (amount) {
        if (!(amount > 0)) return 0;
        try { root.localStorage.setItem(OLD, String(readOld() + amount)); return amount; } catch (e) { return 0; }
      }
    };
  }

  root.ET = root.ET || {};
  root.ET.platform = platform;
})(typeof window !== 'undefined' ? window : globalThis);
