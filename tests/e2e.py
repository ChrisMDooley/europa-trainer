"""End-to-end test of Europa-Trainer in headless Chromium.

    python3 tests/e2e.py [screenshot-dir] [--with-platform /path/to/robins-bobins]

Serves the app (and, with --with-platform, Robin's Bobins next to it, like on GitHub Pages)
and plays through it like Lukas would: the daily plan with intro cards, finding countries on
the map (including a wrong first try), multiple choice, typed answers with a spelling slip
("Sagreb" → counted as known, word goes to Schreibtraining), Schreibtraining with hints,
Hören & Schreiben, the mock exam (no feedback until the end), Problemstellen, Entdecken,
Grenzen (drag), flashcards, the parent area, and phone/tablet layouts. Fails on any page error.
"""
import http.server, threading, functools, os, sys, shutil, tempfile, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:]]
platform = None
if '--with-platform' in args:
    i = args.index('--with-platform'); platform = args[i + 1]; del args[i:i + 2]
OUT = args[0] if args else os.path.join(ROOT, 'tests', 'shots')
os.makedirs(OUT, exist_ok=True)

# Serve a folder that looks like GitHub Pages: /europa-trainer/ (+ /robins-bobins/)
site = tempfile.mkdtemp()
os.symlink(ROOT, os.path.join(site, 'europa-trainer'))
if platform: os.symlink(os.path.abspath(platform), os.path.join(site, 'robins-bobins'))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=site))
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/europa-trainer/index.html' % PORT

MOCK_SPEECH = """
window.__spoken = [];
const fakeVoice = {name:'Anna', lang:'de-DE', localService:true, voiceURI:'Anna', default:true};
Object.defineProperty(window, 'speechSynthesis', {value: {
  getVoices: () => [fakeVoice], addEventListener(){}, onvoiceschanged: null,
  speak(u){ window.__spoken.push({text:u.text, rate:u.rate}); setTimeout(()=>u.onend && u.onend(), 20); }, cancel(){}
}});
window.SpeechSynthesisUtterance = function(t){ this.text = t; };
"""
# The family PIN screen (Robin's Bobins) is unlocked with the stored token, never the PIN itself.
UNLOCK = "try { localStorage.setItem('rb:gate', 'c623d5d8fdd2353ef1861b66169370d4a168aeb62f94cf63e08da88cddb06639'); } catch (e) {}"

errors, ok = [], []
def check(name, cond, info=''):
    (ok if cond else errors).append(name + ('' if cond else '  → ' + str(info)[:300]))

def step(pg):
    return pg.evaluate("""() => { const s = window.__etTest && window.__etTest(); if (!s) return null;
      return { kind: s.kind, answer: s.answer, item: s.item, skill: s.skill, word: s.word, part: s.part || null,
               options: (s.options || []).map(o => o.value), pick: s.map && s.map.pick, prompt: s.prompt || '' }; }""")

def click_map(pg, fid):
    pg.evaluate("document.querySelector('.map').scrollIntoView({block: 'center'})")
    pt = pg.evaluate("id => window.__etMap.clientPointOf(id)", fid)
    pg.mouse.click(pt[0], pt[1])

def wrong_feature(pg, s):
    return pg.evaluate("""a => { const m = window.__etMap, act = {}; ET.app.progress.activeItems().forEach(it => act[it.mapId] = 1);
      return Object.keys(m.shapes).filter(k => k.split('-')[0] === a.k && k !== a.ans && act[k] && m.clientPointOf(k))
        .sort((x, y) => { const p = m.clientPointOf(a.ans), px = m.clientPointOf(x), py = m.clientPointOf(y);
          return Math.hypot(px[0]-p[0], px[1]-p[1]) - Math.hypot(py[0]-p[0], py[1]-p[1]); }).reverse()[0]; }""",
        {'k': s['answer'].split('-')[0], 'ans': s['answer']})

def misspell(word):
    # a typical dyslexic slip: z→s at the start, or drop one doubled/inner letter
    if word[0] in 'Zz': return 'S' + word[1:]
    for i in range(1, len(word) - 1):
        if word[i] == word[i + 1]: return word[:i] + word[i + 1:]
    return word[:len(word) // 2] + word[len(word) // 2 + 1:]

def answer(pg, s, how='right', exam=False):
    k = s['kind']
    if k == 'intro':
        pg.click('.card.intro .btn.primary'); return 'intro'
    if k == 'find':
        if how == 'wrong-first':
            w = wrong_feature(pg, s)
            if w: click_map(pg, w); pg.wait_for_timeout(150)
        click_map(pg, s['answer'])
    elif k == 'choice':
        val = s['answer'] if how != 'wrong' else [o for o in s['options'] if o != s['answer']][0]
        pg.locator('.opt[data-value="%s"]' % val).click()
    elif k in ('type', 'listen') and s['skill']:
        txt = s['answer'] if how == 'right' else misspell(s['answer']) if how == 'misspell' else 'Quatsch'
        if how == 'misspell':      # only slips the app should recognise (very short names may not have one)
            v = pg.evaluate("""a => { const q = window.__etTest(); return ET.spelling.classify(a, q.answer, { alts: q.alts, domain: q.domain }).verdict; }""", txt)
            if v != 'known': txt = s['answer']
        pg.fill('.type-in', txt); pg.click('.type-row .btn.primary')
    elif k in ('spell', 'listen'):
        if pg.locator('.model').count(): pg.click('.spell-stage .btn.primary'); pg.wait_for_timeout(100)
        word = pg.evaluate("w => ET.model.wordByKey[w].word", s['word'])
        if how == 'misspell':
            pg.fill('.spell-stage .type-in', misspell(word)); pg.click('.spell-stage .type-row .btn.primary'); pg.wait_for_timeout(100)
            pg.click('.spell-stage .row .btn.soft')        # a hint
        pg.fill('.spell-stage .type-in', word); pg.click('.spell-stage .type-row .btn.primary')
        pg.wait_for_selector('.spell-msg .btn.primary'); return k
    if exam:
        pg.wait_for_selector('.exam-next', timeout=3000) if k != 'type' else None
        if k != 'type': pg.click('.exam-next')
    return k

def feedback(pg):
    pg.wait_for_selector('.fb-box', timeout=4000)
    cls = pg.get_attribute('.fb-box', 'class')
    return 'known' if 'known' in cls else 'ok' if ' ok' in cls else 'no'

def nxt(pg):
    if pg.locator('.fb-box .btn.primary').count(): pg.click('.fb-box .btn.primary')
    elif pg.locator('.spell-msg .btn.primary').count(): pg.click('.spell-msg .btn.primary')
    pg.wait_for_timeout(90)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script(MOCK_SPEECH); ctx.add_init_script(UNLOCK)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append('console: ' + m.text))

    pg.goto(URL + '?child=lukas'); pg.evaluate("Object.keys(localStorage).filter(k => k.indexOf('europa-trainer:') === 0).forEach(k => localStorage.removeItem(k))")
    pg.reload(); pg.wait_for_timeout(500)
    home = pg.inner_text('body')
    check('greets Lukas', 'Hallo Lukas!' in home, home[:200])
    check('countdown to the exam', 'Europa-Arbeit ist in' in home, home[:300])
    check('plan says what is new', 'Neu: Mitteleuropa' in pg.inner_text('.today-btn'), pg.inner_text('.today-btn'))
    for m in ['heute', 'entdecken', 'ort', 'name', 'cap', 'physisch', 'grenzen', 'wissen', 'spell', 'listen', 'problem', 'exam']:
        check('menu ' + m, pg.locator('[data-menu=%s]' % m).count() == 1)
    if platform:
        check('platform: Meine Apps link', pg.is_visible('#apps-link'))
        check('platform: Robin drawn', pg.locator('.hero .robin svg').count() == 1)
    pg.screenshot(path=OUT + '/e1-home.png', full_page=True)

    # ---------------- Heute üben (day 1): intro cards, find with a wrong first try, spelling slip
    pg.click('[data-menu=heute]'); pg.wait_for_timeout(300)
    kinds, n, saw_known, retried = {}, 0, False, False
    while n < 60:
        s = step(pg)
        if not s: break
        if pg.locator('.end').count(): break
        how = 'right'
        if s['kind'] == 'find' and not retried: how = 'wrong-first'; retried = True
        if s['kind'] in ('type', 'listen') and s['skill'] and not saw_known: how = 'misspell'
        k = answer(pg, s, how)
        kinds[k] = kinds.get(k, 0) + 1
        n += 1
        if k == 'intro':
            pg.wait_for_timeout(120); continue
        if k in ('spell',) or (k == 'listen' and not s['skill']):
            nxt(pg); continue
        f = feedback(pg)
        if how == 'wrong-first':
            check('find: wrong first try, then found → friendly, not counted as right', f == 'known' and 'Gefunden' in pg.inner_text('.fb-box') and pg.evaluate("ET.app.progress.doc.log.slice(-1)[0].ok") is False, f)
            if n < 20: pg.screenshot(path=OUT + '/e2-find-retry.png')
        elif how == 'misspell':
            check('spelling slip → "Du kennst die richtige Antwort"', f == 'known' and 'Du kennst die richtige Antwort' in pg.inner_text('.fb-box'), pg.inner_text('.fb-box'))
            saw_known = True; pg.screenshot(path=OUT + '/e3-known.png')
        else:
            check('heute q%d (%s) right' % (n, k), f == 'ok', (s, f))
        if n == 8: pg.screenshot(path=OUT + '/e4-question.png')
        nxt(pg)
        if pg.locator('.end').count(): break
    pg.wait_for_selector('.end', timeout=4000)
    check('day 1 introduces Mitteleuropa (5 cards)', kinds.get('intro') == 5, kinds)
    check('day 1 has map + choice questions', kinds.get('find', 0) >= 5 and kinds.get('choice', 0) >= 5, kinds)
    check('session length reasonable', 20 <= n <= 45, n)
    check('end screen', 'Geschafft für heute' in pg.inner_text('.end'), pg.inner_text('.end')[:200])
    pg.screenshot(path=OUT + '/e5-end.png', full_page=True)

    # ---------------- typed answer "Sagreb" for Kroatien (brief example)
    r = pg.evaluate("""() => { const S = ET.spelling, c = ET.model.country('kroatien').ref;
        return S.classify('Sagreb', c.capital, { alts: c.capAlt, domain: ET.model.domains.capital }).verdict; }""")
    check('Sagreb → known', r == 'known', r)

    # ---------------- Hauptstädte with typing: slip on Zagreb shows the word with marked letter
    pg.evaluate("""() => { const p = ET.app.progress; ['mitte','suedost'].forEach(g => p.markIntro(g));
        ET.model.items.filter(it => it.group === 'suedost' && it.kind === 'country').forEach(it => { for (let i = 0; i < 3; i++) { p.record({item: it.key, skill: 'ort', ok: true}); p.record({item: it.key, skill: 'name', ok: true}); p.record({item: it.key, skill: 'cap', ok: true}); } }); }""")
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    pg.click('[data-menu=cap]'); pg.click('[data-menu=ans-type]'); pg.wait_for_timeout(300)
    got_known = False
    for i in range(14):
        s = step(pg)
        if not s or pg.locator('.end').count(): break
        if s['kind'] == 'intro': answer(pg, s); continue
        if s['kind'] in ('type', 'listen') and not got_known:
            answer(pg, s, 'misspell'); f = feedback(pg)
            if f == 'known':
                check('capital slip → known, spelling shown', pg.locator('.fb-word .wdiff .bad').count() >= 1, (s, f))
                pg.fill('.copy-once .type-in', s['answer']); pg.wait_for_timeout(80)
                check('copy once accepted', 'Prima' in pg.inner_text('.copy-once'))
                pg.screenshot(path=OUT + '/e6-capital-known.png'); got_known = True
        else:
            answer(pg, s, 'right'); feedback(pg)
        nxt(pg)
    check('a capital spelling slip was tested', got_known)
    queue = pg.evaluate("ET.app.progress.spellQueue(5).map(w => [w.word, (ET.app.progress.wordStat(w.key) || {}).miss || 0])")
    check('misspelled words first in Schreibtraining', len(queue) > 0 and queue[0][1] > 0, queue)

    # ---------------- Schreibtraining with hint
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    pg.click('[data-menu=spell]'); pg.wait_for_timeout(300)
    s = step(pg)
    check('Schreibtraining shows a word task', s and s['kind'] == 'spell', s)
    pg.screenshot(path=OUT + '/e7-spell-model.png')
    answer(pg, s, 'misspell')
    check('hint + correction accepted', 'stimmt' in pg.inner_text('.spell-msg') or 'Perfekt' in pg.inner_text('.spell-msg'), pg.inner_text('.spell-msg'))
    pg.screenshot(path=OUT + '/e8-spell-done.png')
    spoken = pg.evaluate("window.__spoken.length")
    check('words are read aloud', spoken > 0, spoken)

    # ---------------- Hören & Schreiben
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    pg.click('[data-menu=listen]'); pg.wait_for_timeout(500)
    s = step(pg)
    check('listening task', s and s['kind'] == 'listen', s)
    pg.click('.sbtn.slow'); pg.wait_for_timeout(100)
    check('slow replay uses slow rate', pg.evaluate("window.__spoken[window.__spoken.length-1].rate") < 0.8)
    answer(pg, s, 'right')

    # ---------------- Europa entdecken (physical) — rivers
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    pg.click('[data-menu=physisch]'); pg.click('[data-menu=phys-river]'); pg.wait_for_timeout(300)
    for i in range(10):
        s = step(pg)
        if not s or pg.locator('.end').count(): break
        if s['kind'] == 'intro': answer(pg, s); pg.wait_for_timeout(80); continue
        check('river mode asks rivers: ' + s['prompt'], s['item'].startswith('f:') and s['item'][2:] in ('rhein', 'donau', 'wolga', 'dnjepr', 'don', 'ural'), s)
        answer(pg, s, 'right'); f = feedback(pg)
        check('river %d right (%s)' % (i, s['prompt']), f == 'ok', (s, f))
        if i == 2: pg.screenshot(path=OUT + '/e9-river.png')
        nxt(pg)

    # every kind of feature can be found by tapping its own spot on the map
    for t in ['sea', 'mountain', 'island', 'place']:
        pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(250)
        pg.click('[data-menu=physisch]'); pg.click('[data-menu=phys-%s]' % t); pg.wait_for_timeout(250)
        found = 0
        for i in range(8):
            s = step(pg)
            if not s or pg.locator('.end').count(): break
            if s['kind'] == 'intro': answer(pg, s); pg.wait_for_timeout(60); continue
            answer(pg, s, 'right'); f = feedback(pg)
            check('%s question right: %s' % (t, s['prompt']), f == 'ok', (s, f))
            found += 1
            if i == 3: pg.screenshot(path=OUT + '/e10-%s.png' % t)
            nxt(pg)
        check('%s mode asked questions' % t, found >= 3, found)

    # all 50 countries (incl. tiny ones) and all features can be tapped on the map
    pg.goto(URL + '?child=lukas#/entdecken'); pg.wait_for_timeout(400)
    misses = pg.evaluate("""() => {
        const out = [], ids = [].concat(ET.curriculum.countries.map(c => 'country-' + c.id));
        return ids; }""")
    bad = []
    for fid in misses:
        pt = pg.evaluate("""id => { const svg = document.querySelector('.map-svg'); const M = window.ET_MAP;
            let p = (M.tiny[id.slice(8)]) || (M.countries.find(c => c.id === id) || {}).label;
            const q = svg.createSVGPoint(); q.x = p[0]; q.y = p[1]; const r = q.matrixTransform(svg.getScreenCTM()); return [r.x, r.y]; }""", fid)
        pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(30)
        name = pg.evaluate("id => ET.model.country(id.slice(8)).name", fid)
        if name not in pg.inner_text('.info'): bad.append(name)
    check('every country can be tapped in Entdecken', not bad, bad)
    for chip in ['🌊 Meere', '〰️ Flüsse', '🏔️ Gebirge', '🏝️ Inseln', '📍 Orte']:
        pg.get_by_role('button', name=chip).click()
    badf = []
    for fid in pg.evaluate("[].concat(ET_MAP.seas, ET_MAP.rivers, ET_MAP.mountains, ET_MAP.islands, ET_MAP.places).map(x => x.id)"):
        pt = pg.evaluate("""id => { const svg = document.querySelector('.map-svg'), M = window.ET_MAP;
            let p = null; const pl = M.places.find(x => x.id === id); if (pl) p = pl.xy;
            if (!p && id.indexOf('river-') === 0) { const e = svg.querySelector('.river[data-id="' + id + '"]'), L = e.getTotalLength(); const q = e.getPointAtLength(L * 0.45); p = [q.x, q.y]; }
            if (!p) p = ([].concat(M.seas, M.mountains, M.islands).find(x => x.id === id) || {}).label;
            const q = svg.createSVGPoint(); q.x = p[0]; q.y = p[1]; const r = q.matrixTransform(svg.getScreenCTM()); return [r.x, r.y]; }""", fid)
        pg.mouse.click(pt[0], pt[1]); pg.wait_for_timeout(30)
        nm = pg.evaluate("id => ET.mapview.NAME[id]", fid)
        if nm not in pg.inner_text('.info'): badf.append(nm)
    check('every sea, river, mountain range, island and place can be tapped', not badf, badf)
    pg.screenshot(path=OUT + '/e11-explore.png', full_page=True)

    # ---------------- Grenzen Europas: drag every term to its side
    pg.goto(URL + '?child=lukas#/grenzen'); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT + '/e12-borders.png', full_page=True)
    for i in range(4):
        chip = pg.locator('.chip-tray .dchip').first
        side = chip.get_attribute('data-side')
        cb = chip.bounding_box(); zb = pg.locator('.zone[data-side=%s]' % side).bounding_box()
        pg.mouse.move(cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2); pg.mouse.down()
        pg.mouse.move(zb['x'] + 20, zb['y'] + 20, steps=6); pg.mouse.move(zb['x'] + zb['width'] / 2, zb['y'] + zb['height'] / 2, steps=4); pg.mouse.up()
        pg.wait_for_timeout(120)
    check('all four borders placed', 'alle Grenzen richtig' in pg.inner_text('.borders'), pg.inner_text('.borders .hint'))

    # ---------------- flashcards
    pg.goto(URL + '?child=lukas#/wissen'); pg.wait_for_timeout(300)
    pg.click('.fc'); pg.wait_for_timeout(100)
    check('flashcard flips to the answer', pg.is_visible('.fc-a'))
    pg.screenshot(path=OUT + '/e13-flashcard.png')
    pg.click('.fc-rate .btn.primary'); pg.wait_for_timeout(100)

    # ---------------- Prüfung üben: 22 tasks, no feedback until the end
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    pg.click('[data-menu=exam]'); pg.wait_for_timeout(300)
    parts, cnt = {}, 0
    while cnt < 30:
        s = step(pg)
        if not s or pg.locator('.exam-end').count(): break
        parts[s['part']] = parts.get(s['part'], 0) + 1
        how = 'wrong' if cnt in (3, 12) else 'misspell' if (s['kind'] == 'type' and cnt in (6, 7)) else 'right'
        if cnt == 0: pg.screenshot(path=OUT + '/e14-exam-q.png')
        if s['kind'] == 'find' and how == 'wrong':
            w = wrong_feature(pg, s); click_map(pg, w); pg.click('.exam-next')
        elif s['kind'] == 'type' and how == 'wrong':
            pg.fill('.type-in', 'Quatsch'); pg.click('.type-row .btn.primary')
        else:
            answer(pg, s, how, exam=True)
        cnt += 1
        check('exam: no feedback during the test', pg.locator('.fb-box').count() == 0)
        pg.wait_for_timeout(200)
    pg.wait_for_selector('.exam-end', timeout=4000)
    ee = pg.inner_text('.exam-end')
    check('exam has parts A–E with 22 tasks', cnt == 22 and parts == {'A': 5, 'B': 5, 'C': 5, 'D': 4, 'E': 3}, (cnt, parts))
    check('exam score 20 / 22 (misspelled but known answers count)', '20 / 22' in ee, ee[:200])
    check('exam: good + to practise lists', 'Das kannst du schon gut' in ee and 'Das solltest du noch üben' in ee)
    check('exam: known-but-misspelled listed separately', 'Schreibweise üben' in ee, ee)
    if platform:
        check('exam pays 1 per right answer + 8', '+28 Robin-Münzen' in ee, ee[:200])
        check('coin balance shown in the header', pg.is_visible('#coin-pill') and int(pg.inner_text('#coins')) >= 28, pg.inner_text('#coins'))
    else:
        check('no coin pill when running alone', not pg.is_visible('#coin-pill'))
    pg.screenshot(path=OUT + '/e15-exam-end.png', full_page=True)

    # ---------------- Problemstellen
    pg.goto(URL + '?child=lukas#/home'); pg.wait_for_timeout(300)
    probs = pg.evaluate("ET.app.progress.problems(7).map(p => ET.app.progress.problemLabel(p))")
    check('problem list filled from real mistakes', len(probs) >= 2, probs)
    pg.click('[data-menu=problem]'); pg.wait_for_timeout(300)
    s = step(pg)
    check('Problemstellen starts', s is not None, s)

    # ---------------- parent area
    pg.goto(URL + '?child=lukas#/eltern'); pg.wait_for_timeout(300)
    if pg.locator('.pin-screen').count():
        check('parent area asks for the family PIN when one is set', True)
    else:
        txt = pg.inner_text('.parent')
        check('parent overview', 'sicher' in txt and 'Problemstellen' in txt and 'Rechtschreibung' in txt, txt[:400])
        pg.locator('.cats label', has_text='Flüsse').locator('input').uncheck()
        check('switching off rivers works', pg.evaluate("!ET.app.progress.activeItems().some(it => it.type === 'river')"))
        pg.locator('.cats label', has_text='Flüsse').locator('input').check()
        pg.screenshot(path=OUT + '/e16-parent.png', full_page=True)

    # ---------------- launched from Robin's Bobins (Lukas's home → card → app → back)
    if platform:
        # Until the site is live the card is hidden in the registry; show it for this test.
        def unhide(route):
            body = route.fetch().text()
            route.fulfill(body=body.replace("hidden: true                 // until", "hidden: false                // until"), content_type='application/javascript')
        pg.route('**/robins-bobins/apps/registry.js', unhide)
        pg.goto('http://127.0.0.1:%d/robins-bobins/index.html#/c/lukas' % PORT); pg.wait_for_timeout(500)
        card = pg.locator('.app-card[data-app=europa]')
        check('Robin\'s Bobins shows the Europa-Trainer card for Lukas', card.count() == 1)
        check('card line from rb-card.js', 'Europa-Arbeit' in card.inner_text() or 'Fragen' in card.inner_text(), card.inner_text())
        pg.screenshot(path=OUT + '/e0-rb-lukas-home.png')
        card.click(); pg.wait_for_timeout(600)
        check('card opens Europa-Trainer for Lukas', '/europa-trainer/' in pg.url and 'child=lukas' in pg.url and 'Hallo Lukas' in pg.inner_text('body'), pg.url)
        pg.click('#apps-link'); pg.wait_for_timeout(400)
        check('"Meine Apps" leads back to Lukas\'s home', '#/c/lukas' in pg.url, pg.url)
        acts = pg.evaluate("RB.activity.list('lukas').filter(a => a.app === 'europa').length")
        check('finished rounds count for the family streak', acts >= 3, acts)
        eu = pg.evaluate("RB.coins.list('lukas').filter(c => c.app === 'europa').map(c => [c.amount, c.reason])")
        check('Robin-Münzen from Europa-Trainer rounds', len(eu) >= 3 and all(a > 0 for a, _ in eu), eu)
        check('Heute üben pays its bonus', any(r == 'Heute geübt' for _, r in eu), eu)
        check('Probe-Arbeit pays', any(r == 'Probe-Arbeit geschafft' for _, r in eu), eu)
        bk = pg.evaluate("Object.keys(RB.backup.exportAll().data)")
        check('family backup includes Europa progress', 'europa-trainer:lukas' in bk, bk)

    # ---------------- guest link (a classmate): no family page, no family PIN, own coins + parent PIN
    if platform:
        cg = b.new_context(viewport={'width': 1280, 'height': 900})
        cg.add_init_script(MOCK_SPEECH)          # NOT unlocked: the family PIN must not appear for a guest
        gp = cg.new_page()
        gp.on('pageerror', lambda e: errors.append('guest pageerror: ' + str(e)))
        start = 'http://127.0.0.1:%d/robins-bobins/gast/?name=Nuka' % PORT
        gp.goto(start); gp.wait_for_timeout(500)
        check('guest start: no family PIN, greets Nuka', gp.locator('#rb-gate').count() == 0 and 'Hallo Nuka!' in gp.inner_text('h1'), gp.inner_text('body')[:200])
        check('guest start: only guest apps, no family children', gp.locator('.app-card').count() == 1 and 'Lukas' not in gp.inner_text('body'))
        check('guest start: Europa card with countdown line', 'Europa-Arbeit' in gp.inner_text('.app-card[data-app=europa]'), gp.inner_text('.app-card'))
        gp.screenshot(path=OUT + '/e19-guest-start.png')
        gp.click('.app-card[data-app=europa]'); gp.wait_for_timeout(600)
        check('guest: card opens Europa as Nuka', '?gast=Nuka' in gp.url, gp.url)
        check('guest: no family PIN screen', gp.locator('#rb-gate').count() == 0 and gp.is_visible('.home'))
        check('guest: greets the guest by name', 'Hallo Nuka!' in gp.inner_text('h1'), gp.inner_text('h1'))
        check('guest: family SDK not loaded; "‹ Start" back to the start page', gp.evaluate("!(window.RB && RB.child)") and gp.inner_text('#apps-link').strip() == '‹ Start')
        check('guest: Robin is drawn', gp.locator('.hero .robin svg').count() == 1)
        gp.click('[data-menu=heute]'); gp.wait_for_timeout(300)
        n = 0
        for i in range(80):
            s = step(gp)
            if not s or gp.locator('.end').count(): break
            k = answer(gp, s, 'right'); n += 1
            if k == 'intro': gp.wait_for_timeout(120); continue
            if k != 'spell' and not (k == 'listen' and not s['skill']): feedback(gp)
            nxt(gp)
        gp.wait_for_selector('.end', timeout=5000)
        coins = int(gp.inner_text('#coins'))
        check('guest: earns coins on this device', gp.is_visible('#coin-pill') and coins > 5 and '+%d Robin-Münzen' % coins in gp.inner_text('.end'), (coins, n))
        check('guest: progress stored under the guest', gp.evaluate("!!localStorage.getItem('europa-trainer:gast-nuka') && !localStorage.getItem('europa-trainer:lukas')"))
        gp.click('#apps-link'); gp.wait_for_timeout(500)
        check('guest: "‹ Start" leads to the start page', '/robins-bobins/gast/' in gp.url and 'Hallo Nuka!' in gp.inner_text('h1'), gp.url)
        check('guest start: coins and today\'s practice shown', gp.inner_text('#coins').strip() == str(coins) and 'Übung heute' in gp.inner_text('.stats'), repr(gp.inner_text('.stats')) + ' coins=' + gp.inner_text('#coins') + ' want=' + str(coins))
        gp.goto('http://127.0.0.1:%d/robins-bobins/gast/' % PORT); gp.wait_for_timeout(400)
        check('guest start: remembered on the device without the link (home-screen icon)', 'Hallo Nuka!' in gp.inner_text('h1'))
        gp.goto(URL); gp.wait_for_timeout(400)
        check('guest: Europa remembers the guest too', 'Hallo Nuka!' in gp.inner_text('h1'))
        gp.goto(URL + '#/eltern'); gp.wait_for_timeout(300)
        check('guest: own parent PIN asked', gp.locator('.pin-screen').count() == 1 and 'Robin' not in gp.inner_text('.pin-screen'), gp.inner_text('main'))
        gp.fill('.pin-screen input', '0000'); gp.keyboard.press('Enter'); gp.wait_for_timeout(150)
        check('guest: wrong parent PIN refused', 'stimmt nicht' in gp.inner_text('.pin-screen'))
        if os.environ.get('ET_GUEST_PIN'):
            gp.fill('.pin-screen input', os.environ['ET_GUEST_PIN']); gp.keyboard.press('Enter'); gp.wait_for_timeout(300)
            check('guest: parent area opens with the guest PIN', gp.locator('.parent').count() == 1 and 'Nuka' in gp.inner_text('.parent'))
        gp.screenshot(path=OUT + '/e19-guest.png')
        cg.close()

    # ---------------- phone + tablet
    for name, vp in [('phone', {'width': 390, 'height': 844}), ('tablet', {'width': 820, 'height': 1180})]:
        c2 = b.new_context(viewport=vp, has_touch=True, is_mobile=name == 'phone')
        c2.add_init_script(MOCK_SPEECH); c2.add_init_script(UNLOCK)
        ph = c2.new_page()
        ph.on('pageerror', lambda e: errors.append(name + ' pageerror: ' + str(e)))
        ph.goto(URL + '?child=lukas'); ph.wait_for_timeout(400)
        check(name + ': no sideways scrolling (home)', ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        ph.screenshot(path=OUT + '/e17-%s-home.png' % name, full_page=True)
        ph.click('[data-menu=heute]'); ph.wait_for_timeout(300)
        for i in range(8):
            s = step(ph)
            if not s: break
            answer(ph, s, 'right')
            if s['kind'] != 'intro' and s['kind'] != 'spell':
                try: feedback(ph)
                except Exception as e:
                    ph.screenshot(path=OUT + '/e-fail-%s.png' % name); errors.append('%s: no feedback for %s' % (name, s)); break
                nxt(ph)
            else: ph.wait_for_timeout(100)
        check(name + ': no sideways scrolling (practice)', ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
        ph.screenshot(path=OUT + '/e18-%s-question.png' % name, full_page=True)
        c2.close()
    b.close()

shutil.rmtree(site, ignore_errors=True)
print('%d passed, %d failed' % (len(ok), len(errors)))
for e in errors: print('  FAIL', e)
sys.exit(1 if errors else 0)
