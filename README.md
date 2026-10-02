# Europa-Trainer 🌍

Lukas's app for the **Europa-Arbeit (4 Nov 2026)**: European countries and capitals, seas,
rivers, mountain ranges, islands, Europe's borders and the facts from his notebook — with the
map at the centre and spelling as a *separate* skill, so a dyslexic slip never counts as
not knowing the geography.

Part of the **Robin's Bobins** family, but its own app: own code, own tests, own site.

- Live: https://chrismdooley.github.io/europa-trainer/ (from Robin's Bobins: Lukas → Europa-Trainer)
- Runs on its own too: open `index.html` via any web server (e.g. `python3 -m http.server`).

## What Lukas can do

| Menu | |
|---|---|
| ▶ **Heute üben** | ~10 minutes, planned toward the exam date: a small new group (≈5 items) with intro cards, then repetition of what is due or weak, then 2–3 words to spell. New material stops a week before the exam. |
| 🧭 Karte entdecken | Tap anything: flag, name, capital, read aloud. No scoring. |
| 📍 Wo liegt …? | Find countries on the map. A wrong tap says what it was; after two misses a hint ring. |
| ❓ Welches Land ist das? | Choice first, typing once it sits (or pick the answer style). |
| 🏛️ Hauptstädte | Land → Hauptstadt and back (choice, typing, or listen & type). |
| 🏔️ Europa entdecken | Seas, rivers, mountain ranges, islands, places (Nordkap, Gibraltar, Bosporus, Mont Blanc). |
| 🧱 Grenzen Europas | Drag Nordpolarmeer / Uralgebirge und Uralfluss / Mittelmeer / Atlantik to their side. |
| 💡 Das muss ich wissen | Flashcards + quiz from his notebook (Wolga, Mont Blanc, Straße von Gibraltar …). |
| ✏️ Schreibtraining | Hard names: look (colour chunks *Ljub-lja-na*), hide, write; hints *L _ u _ l _ a _ a*. |
| 🎧 Hören & Schreiben | Hear a name or "Die Hauptstadt von Ungarn ist Budapest." (normal/slow), write it. |
| 🎯 Meine Problemstellen | Generated from his answers: "Heute solltest du diese 7 Dinge üben". |
| 📝 Prüfung üben | Teil A–E, 22 tasks, no feedback until the end; then *Das kannst du schon gut / Das solltest du noch üben / Gewusst – nur die Schreibweise üben*. |
| Eltern | Stand per skill ("sicher x / y"), problem list, exam date, material on/off (per category and per item), OpenDyslexic font, voice, slow speed. |

**Knowledge vs spelling** (`js/spelling.js`): a typed answer is *right*, *known* (clearly meant the
right answer: close in letters or same German sound code, and closer to it than to any other
answer — "Sagreb" → Zagreb, "Lubliana" → Ljubljana) or *wrong* ("Bukarest" for Ungarn;
"Bukapest" is ambiguous → not credited). *Known* counts for the geography and puts the word into
Schreibtraining.

## Curriculum

All material is in **`data/curriculum.js`**, extracted from Lukas's class map and notebook
(Buch S. 162/163 "Europa – was kennzeichnet und gliedert den Kontinent?", notebook "Abgrenzung Europas"): 37 core countries with capitals, 13 extras (microstates,
Island, Malta, Zypern, Caucasus/Türkei — in the app, not in the mock exam), 8 seas, 6 rivers,
8 mountain ranges, 9 islands, 4 places, the borders, 28 facts (incl. Steckbrief M2, Elbrus vs Mont Blanc M6, the Europa legend M3). School names first
(Weißrussland, Kiew, Mazedonien, Tschechische Republik); modern names are also accepted.

**Next topic?** Edit `data/curriculum.js` (new items, groups, facts, exam date), run
`python3 tools/build_maps.py` if map shapes are needed. The build refuses to run if a capital is
not inside its country, a named sea/river/range/island has no shape, a river does not reach the
sea it flows into, or a border item is on the wrong side of Europe.

## Code

```
data/curriculum.js   WHAT is learnt (edit this)          data/map.js   generated map (Natural Earth)
js/spelling.js       knowledge vs spelling, hints, diff   js/model.js   items, skills, words, German articles
js/progress.js       per-skill spaced repetition, plan, overview, problem list (localStorage)
js/questions.js      one question per item + skill        js/session.js rounds: heute, modes, mock exam
js/mapview.js        interactive SVG map (zoom, pan, tap areas)
js/practice.js       question runner + feedback           js/screens.js explore, borders, flashcards, parent
js/app.js            home, menus                          js/platform.js  the only Robin's Bobins contact
js/speech.js         text-to-speech (copied from Diktat-Trainer, kept identical)
rb-card.js           line on the Robin's Bobins card
```

Tests: `node tests/spelling.test.js` · `node tests/logic.test.js` (incl. 35 simulated days up to the
exam) · `python3 tests/e2e.py [dir] [--with-platform ../robins-bobins]` (whole app in Chromium,
phone + tablet, launched from Robin's Bobins).

## Robin's Bobins

Loose coupling, on purpose:

- Robin's Bobins lists the app in `apps/registry.js` with `url: '../europa-trainer/'` and opens it
  as `…/europa-trainer/?child=lukas`.
- `index.html` optionally loads `../robins-bobins/shared/rb.js` (same site on GitHub Pages). If it is
  there: family PIN screen, child name, "‹ Meine Apps", Robin, one activity per finished round
  (streaks), progress included in the family backup. If not: the app runs alone as Lukas.
- **Robin-Münzen** on the family balance: 1 per answer known (a spelling slip still counts) and per word written in
  Schreibtraining / Hören & Schreiben, + 5 for *Heute üben*, + 3 for other rounds and for *Grenzen Europas*;
  *Prüfung üben* pays 1 per right answer + 8. Nothing is ever taken away. Running alone there are no coins.
- Progress: `localStorage['europa-trainer:<child>']`, on this device/browser.

## Guest link (a classmate)

`…/europa-trainer/?gast=<Name>` runs the app on its own for that child: no Robin's Bobins, no family
PIN, no "Meine Apps". Progress (`europa-trainer:gast-<name>`) and a coin counter stay on that device;
the guest is remembered there, so the home-screen icon works without the link. A parent PIN for a
guest is listed in `js/platform.js` (`GUEST_PINS`) as salted hashes only — no names or PINs in the code.
Test: `ET_GUEST_PIN=<pin> python3 tests/e2e.py <shots-dir> --with-platform ../robins-bobins`.

Map data: Natural Earth (public domain).
