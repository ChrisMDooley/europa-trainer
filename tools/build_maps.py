"""Build the Europe map for Europa-Trainer (data/map.js).

    python3 tools/build_maps.py

Inputs (tools/raw/, Natural Earth, public domain — fetched once, kept for offline rebuilds):
  ne_50m_countries   countries          ne_50m_land    land polygons (islands)
  ne_10m_rivers      river centre lines ne_10m_marine  seas, straits
  ne_10m_regions     mountain ranges, islands, island groups

Output: window.ET_MAP = { w, h, countries[], seas[], rivers[], mountains[], islands[], places[],
        capitals{}, frame } — every shape has a stable id (country-polen, sea-ostsee, river-donau,
        mountain-alpen, island-kreta, place-nordkap).

Projection: Lambert conformal conic (standard parallels 40°/65°), like school atlases of Europe.

The script also CHECKS data/curriculum.js against the geometry and refuses to build when:
  - a curriculum country has no shape, or its capital does not lie inside it
  - a sea / river / mountain range / island named in the curriculum has no shape
  - a river does not reach the sea it is said to flow into (Wolga → Kaspisches Meer, …)
  - a border item is not on the side of Europe the notebook says
"""
import gzip, json, math, os, subprocess, sys
from shapely.geometry import shape, box, Point, Polygon, MultiPolygon, LineString, MultiLineString
from shapely.ops import unary_union, transform, linemerge

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

def raw(name):
    with gzip.open(os.path.join(HERE, 'raw', name + '.json.gz'), 'rt') as f:
        return json.load(f)['features']

def load_curriculum():
    js = "global.window=global;require(%r);process.stdout.write(JSON.stringify(window.ET.curriculum))" % os.path.join(APP, 'data', 'curriculum.js')
    return json.loads(subprocess.check_output(['node', '-e', js]))

CUR = load_curriculum()
problems = []

# ---------------------------------------------------------------- projection (LCC)
R = 6371.0
lat1, lat2, lat0, lon0 = map(math.radians, (40, 65, 52, 15))
n = math.log(math.cos(lat1) / math.cos(lat2)) / math.log(math.tan(math.pi / 4 + lat2 / 2) / math.tan(math.pi / 4 + lat1 / 2))
F_ = math.cos(lat1) * math.tan(math.pi / 4 + lat1 / 2) ** n / n
rho0 = R * F_ / math.tan(math.pi / 4 + lat0 / 2) ** n

def lcc(lon, lat, z=None):
    la, lo = math.radians(max(min(lat, 89.0), -80.0)), math.radians(lon)
    rho = R * F_ / math.tan(math.pi / 4 + la / 2) ** n
    th = n * (lo - lon0)
    return (rho * math.sin(th), -(rho0 - rho * math.cos(th)))   # y grows downwards (SVG)

def proj(g):
    return transform(lambda x, y, z=None: lcc(x, y), g)

# View: Iceland/Portugal in the west, Ural and Caspian in the east, Nordkap north, Crete/Cyprus south.
corners = [(-25, 63), (-10.5, 36), (60, 68), (58, 47), (26, 72.5), (22, 34.2), (34.5, 34.2), (-24, 67.5), (55, 36.5)]
xs, ys = zip(*[lcc(*c) for c in corners])
PAD = 40
X0, X1, Y0, Y1 = min(xs) - PAD, max(xs) + PAD, min(ys) - PAD, max(ys) + PAD
W = 1000.0
S = W / (X1 - X0)
H = (Y1 - Y0) * S
FRAME = box(X0, Y0, X1, Y1)

def to_view(g):
    g = g.intersection(FRAME)
    return transform(lambda x, y, z=None: ((x - X0) * S, (y - Y0) * S), g)

def pt(lon, lat):
    x, y = lcc(lon, lat)
    return [round((x - X0) * S, 1), round((y - Y0) * S, 1)]

def fmt(v):
    s = '%.1f' % v
    return s[:-2] if s.endswith('.0') else s

def path(g):
    out = []
    def ring(coords, close):
        seg, last = [], None
        for x, y in coords:
            t = (fmt(x), fmt(y))
            if t != last: seg.append(t); last = t
        if len(seg) < 2: return ''
        return 'M' + 'L'.join(a + ' ' + b for a, b in seg) + ('Z' if close else '')
    def walk(h):
        if h.is_empty: return
        if isinstance(h, Polygon):
            out.append(ring(h.exterior.coords, True))
            for r in h.interiors: out.append(ring(r.coords, True))
        elif isinstance(h, LineString):
            out.append(ring(h.coords, False))
        elif hasattr(h, 'geoms'):
            for q in h.geoms: walk(q)
    walk(g)
    return ''.join(out)

def label(g):
    if g.is_empty: return None
    if isinstance(g, (LineString, MultiLineString)):
        m = linemerge(g) if isinstance(g, MultiLineString) else g
        if hasattr(m, 'geoms'): m = max(m.geoms, key=lambda q: q.length)
        p = m.interpolate(0.5, normalized=True)
    else:
        big = max(g.geoms, key=lambda q: q.area) if hasattr(g, 'geoms') else g
        p = big.representative_point()
    return [round(p.x, 1), round(p.y, 1)]

KM = S * 1.0          # 1 km in view units (projection is in km)
def simp(g, km):
    return g.simplify(km * KM, preserve_topology=True)

# ---------------------------------------------------------------- countries
by_a3 = {c['a3']: c for c in CUR['countries']}
geo_country = {}
countries = []
for f in raw('ne_50m_countries'):
    a3 = f['properties']['ADM0_A3']
    g = shape(f['geometry']).buffer(0)
    if a3 == 'CYN': a3 = 'CYP'                       # Northern Cyprus: shown as part of Zypern (school map)
    if a3 in geo_country: g = unary_union([geo_country[a3], g])
    geo_country[a3] = g
for a3, g in geo_country.items():
    v = to_view(proj(g))
    if v.is_empty or v.area < 1e-3: continue
    c = by_a3.get(a3)
    countries.append({'a3': a3, 'id': ('country-' + c['id']) if c else None, 'key': c['id'] if c else None,
                      'd': path(simp(v, 2.5)), 'label': label(v), 'area': round(v.area, 1)})
countries.sort(key=lambda c: -c['area'])       # big ones first, small ones drawn on top

capitals = {}
for c in CUR['countries']:
    g = geo_country.get(c['a3'])
    if g is None:
        problems.append('no map shape for country ' + c['name']); continue
    if c['capital']:
        lon, lat = c['capLL']
        if not g.buffer(0.08).contains(Point(lon, lat)):
            problems.append('capital %s not inside %s' % (c['capital'], c['name']))
        capitals[c['id']] = pt(lon, lat)
    else:
        capitals[c['id']] = pt(*c['capLL'])          # position marker for tiny states
tiny_pts = {c['id']: pt(*c['capLL']) for c in CUR['countries'] if c.get('tiny')}

# ---------------------------------------------------------------- seas
marine = raw('ne_10m_marine')
def marine_union(names):
    gs = [shape(f['geometry']).buffer(0) for f in marine if f['properties']['name'] in names]
    missing = [n_ for n_ in names if not any(f['properties']['name'] == n_ for f in marine)]
    return unary_union(gs) if gs else None, missing

land = unary_union([shape(f['geometry']).buffer(0) for f in raw('ne_50m_land')])
seas, sea_geo = [], {}
for fe in [f for f in CUR['features'] if f['type'] == 'sea']:
    g, missing = marine_union(fe['ne'])
    if missing: problems.append('sea %s: missing NE parts %s' % (fe['name'], missing))
    if g is None: problems.append('no shape for sea ' + fe['name']); continue
    sea_geo[fe['id']] = g
    v = to_view(proj(g.difference(land)))
    lab = {'nordmeer': (3, 67), 'nordpolarmeer': (40, 71.2), 'atlantik': (-17, 50), 'mittelmeer': (18, 35.5),
           'ostsee': (19, 57.5), 'nordsee': (3, 56), 'schwarzesmeer': (34, 43.3), 'kaspischesmeer': (50.5, 42)}.get(fe['id'])
    seas.append({'id': 'sea-' + fe['id'], 'key': fe['id'], 'd': path(simp(v, 4)), 'label': pt(*lab) if lab else label(v)})

# ---------------------------------------------------------------- rivers
rivers_raw = raw('ne_10m_rivers')
rivers, river_geo = [], {}
for fe in [f for f in CUR['features'] if f['type'] == 'river']:
    lines = [shape(f['geometry']) for f in rivers_raw if f['properties']['name'] in fe['ne']]
    if not lines: problems.append('no shape for river ' + fe['name']); continue
    g = linemerge(unary_union(lines))
    river_geo[fe['id']] = g
    v = to_view(proj(g))
    rivers.append({'id': 'river-' + fe['id'], 'key': fe['id'], 'd': path(simp(v, 3)), 'label': label(v),
                   'width': {'wolga': 3.2, 'donau': 3, 'rhein': 2.6, 'dnjepr': 2.8}.get(fe['id'], 2.4)})

# Where each river ends (checked below): the curriculum facts depend on it.
MOUTH = {'wolga': 'kaspischesmeer', 'donau': 'schwarzesmeer', 'rhein': 'nordsee', 'dnjepr': 'schwarzesmeer', 'ural': 'kaspischesmeer'}
for rid, sid in MOUTH.items():
    if rid in river_geo and sid in sea_geo:
        d_km = proj(river_geo[rid]).distance(proj(sea_geo[sid]))
        if d_km > 60: problems.append('river %s does not reach %s (%.0f km)' % (rid, sid, d_km))

# ---------------------------------------------------------------- mountains & islands (NE regions)
regions = raw('ne_10m_regions')
def region(names, cls=None):
    gs = [shape(f['geometry']).buffer(0) for f in regions if f['properties']['NAME'] in names and (not cls or f['properties']['FEATURECLA'] in cls)]
    return unary_union(gs) if gs else None

mountains, mountain_geo = [], {}
for fe in [f for f in CUR['features'] if f['type'] == 'mountain']:
    g = region(fe['ne'], ('Range/mtn',))
    if g is None: problems.append('no shape for mountains ' + fe['name']); continue
    mountain_geo[fe['id']] = g
    v = to_view(proj(g))
    mountains.append({'id': 'mountain-' + fe['id'], 'key': fe['id'], 'd': path(simp(v, 4)), 'label': label(v)})

islands = []
land_parts = list(land.geoms)
for fe in [f for f in CUR['features'] if f['type'] == 'island']:
    g = region(fe['ne'], ('Island', 'Island group'))
    if g is None: problems.append('no shape for island ' + fe['name']); continue
    # Use the real coastline: every land polygon that overlaps the NE island region.
    parts = [p for p in land_parts if p.intersects(g) and p.intersection(g).area > 0.3 * min(p.area, g.area)]
    if not parts: problems.append('no land for island ' + fe['name']); continue
    geo = unary_union(parts)
    v = to_view(proj(geo))
    islands.append({'id': 'island-' + fe['id'], 'key': fe['id'], 'd': path(simp(v, 2)), 'label': label(v),
                    'hit': round(max(9.0, math.sqrt(v.area) * 0.35), 1)})

# ---------------------------------------------------------------- places
places = []
for fe in [f for f in CUR['features'] if f['type'] == 'place']:
    places.append({'id': 'place-' + fe['id'], 'key': fe['id'], 'xy': pt(*fe['ll'])})

# ---------------------------------------------------------------- border checks (Abgrenzung Europas)
europe_c = Point(15, 52)          # rough centre of Europe
def side_of(lonlat):
    dx, dy = lonlat[0] - europe_c.x, lonlat[1] - europe_c.y
    return dx, dy
feat = {f['id']: f for f in CUR['features']}
for b in CUR['borders']:
    for it in b['items']:
        g = sea_geo.get(it) or mountain_geo.get(it) or river_geo.get(it)
        c = (g.centroid.x, g.centroid.y) if g is not None else tuple(feat[it]['ll'])
        dx, dy = side_of(c)
        ok = {'N': dy > 10, 'S': dy < -8, 'W': dx < -15, 'O': dx > 30, 'SO': dx > 10 and dy < -5}[b['side']]
        if not ok: problems.append('border %s: %s is not on that side (%.0f, %.0f)' % (b['side'], it, dx, dy))

out = {'w': round(W), 'h': round(H), 'countries': countries, 'seas': seas, 'rivers': rivers, 'mountains': mountains,
       'islands': islands, 'places': places, 'capitals': capitals, 'tiny': tiny_pts,
       'source': 'Natural Earth (public domain), Lambert-Kegelprojektion'}
js = ('/* GENERATED by tools/build_maps.py — do not edit. Natural Earth (public domain). */\n'
      'window.ET_MAP = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(os.path.join(APP, 'data', 'map.js'), 'w').write(js)
print('map.js: %.0f KB, %d countries (%d in curriculum), %d seas, %d rivers, %d mountains, %d islands'
      % (len(js) / 1024, len(countries), sum(1 for c in countries if c['key']), len(seas), len(rivers), len(mountains), len(islands)))
if problems:
    print('\nCURRICULUM CHECKS FAILED:'); [print('  -', p) for p in problems]; sys.exit(1)
print('curriculum checks: all passed')
