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
 *   - Guest link ?gast=<Name> (a classmate): index.html does not load the SDK; the app runs on its own
 *     for that name, with its own coin counter on the device and, if listed in GUEST_PINS, its own
 *     parent PIN. Neither the name nor the PIN is in this file — only salted hashes.
 */
(function (root) {
  'use strict';
  var RB = root.RB || null;

  // Guests with a parent PIN: sha256(SALT + id) → sha256(SALT + id + ':' + pin).
  var GUEST_SALT = 'europa-trainer-guest:13679eea151b1c0f:';
  var GUEST_PINS = {
    '18d28869fd5652b0e63f7fd11a25a36ff55554163fbc6f6c687869b7b577f97f': '99df7403ca55efe6d53f15099c2d390f0ca6f4509e292b9df8b021460f82d183'
  };
  function sha256(str) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
      0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
      0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
      0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var bytes = unescape(encodeURIComponent(str)), l = bytes.length, words = [], i;
    for (i = 0; i < l; i++) words[i >> 2] |= (bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[(((l + 8) >> 6) + 1) * 16 - 1] = l * 8;
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], W = [];
    function r(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var j = 0; j < words.length; j += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = words[j + i] | 0;
        else W[i] = (r(W[i-2],17) ^ r(W[i-2],19) ^ (W[i-2] >>> 10)) + W[i-7] + (r(W[i-15],7) ^ r(W[i-15],18) ^ (W[i-15] >>> 3)) + W[i-16] | 0;
        var t1 = h + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K[i] + W[i] | 0;
        var t2 = (r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
        h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
      }
      H[0] = H[0] + a | 0; H[1] = H[1] + b | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0;
      H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  var guestName = root.ET_GUEST ? String(root.ET_GUEST).replace(/[^A-Za-zÄÖÜäöüßÀ-ÿ' -]/g, '').trim().slice(0, 24) : '';
  var guestId = guestName ? guestName.toLowerCase().replace(/[^a-zäöüßà-ÿ]+/g, '-').replace(/^-|-$/g, '') : '';
  if (guestId) RB = (RB && RB.robin) ? { robin: RB.robin } : null;   // never the family SDK for a guest

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
      if (guestId) { var want = GUEST_PINS[sha256(GUEST_SALT + guestId)]; return !want || sha256(GUEST_SALT + guestId + ':' + String(pin).trim()) === want; }
      return !(RB && RB.parent && RB.parent.hasPin()) || RB.parent.checkPin(pin);
    },
    parentHasPin: function () {
      if (guestId) return !!GUEST_PINS[sha256(GUEST_SALT + guestId)];
      return !!(RB && RB.parent && RB.parent.hasPin());
    }
  };

  function guestCoins() {
    var KEY = 'europa-trainer-coins:gast-' + guestId;
    function read() { try { return Math.max(0, parseInt(root.localStorage.getItem(KEY), 10) || 0); } catch (e) { return 0; } }
    return {
      available: true,
      balance: read,
      add: function (amount) {
        if (!(amount > 0)) return 0;
        try { root.localStorage.setItem(KEY, String(read() + amount)); return amount; } catch (e) { return 0; }
      }
    };
  }

  root.ET = root.ET || {};
  root.ET.platform = platform;
})(typeof window !== 'undefined' ? window : globalThis);
