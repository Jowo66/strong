#!/usr/bin/env python3
"""Convert the Quaternius "Ultimate Animated Character Pack" (CC0) into one compact asset for the web.

Usage:  pip install fast-simplification numpy
        python3 -I scripts/build-characters.py "<pack>/glTF" public/characters

Every model in the pack shares one 23-bone skeleton with the same joint order, so the output is:
  characters.json  skeleton (rest pose + inverse bind matrices), a catalogue of mesh parts, animation clips
  characters.bin   vertex data for each part (int16 positions, u8 joints, u8 weights, u16 indices)
                   and float32 animation keys. No normals: the game renders the pack flat-shaded, so
                   vertices are welded and hair is simplified (it was ~4-6k triangles per head).

Parts are single material primitives (e.g. Casual_Male/Shirt) so the game can mix hair, tops and bottoms from
different characters onto the full BaseCharacter body and recolour each one. Some parts are split further
(a Viking's beard from his mohawk). Only what the game uses is exported, which takes the pack from 99 MB to ~1 MB.
"""
import base64, hashlib, json, math, os, struct, sys
import numpy as np
import fast_simplification  # pip install fast-simplification

SRC, OUT = sys.argv[1], sys.argv[2]

# (part id, model file, material, optional splitter)
PARTS = [
    ('body', 'BaseCharacter', 'Skin', None),
    ('face', 'Casual_Male', 'Face', None),
    ('faceF', 'Casual_Female', 'Face', None),
    ('faceWorker', 'Worker_Male', 'Face', None),
    ('moustache', 'Chef_Hat', 'Moustache', None),
    # tops
    ('teeM', 'Casual_Male', 'Shirt', None),
    ('teeF', 'Casual_Female', 'Shirt', None),
    ('tee2M', 'Casual2_Male', 'Shirt', None),
    ('tee2F', 'Casual2_Female', 'Shirt', None),
    ('tankM', 'Casual3_Male', 'Shirt', None),
    ('tankF', 'Casual3_Female', 'Shirt', None),
    ('workShirtM', 'Worker_Male', 'Shirt', None),
    ('workShirtF', 'Worker_Female', 'Shirt', None),
    ('workVestM', 'Worker_Male', 'Vest', None),
    ('workVestF', 'Worker_Female', 'Vest', None),
    # bottoms
    ('shortsM', 'Casual_Male', 'Pants', None),
    ('shortsF', 'Casual_Female', 'Pants', None),
    ('jeansM', 'Casual2_Male', 'Pants', None),
    ('jeansF', 'Casual2_Female', 'Pants', None),
    ('slimM', 'Casual3_Male', 'Pants', None),
    ('slimF', 'Casual3_Female', 'Pants', None),
    ('workPantsM', 'Worker_Male', 'Pants', None),
    ('workPantsF', 'Worker_Female', 'Pants', None),
    ('beltM', 'Casual2_Male', 'Belt', None),
    ('beltF', 'Casual2_Female', 'Belt', None),
    # hats
    ('hardHatM', 'Worker_Male', 'Hat', None),
    ('hardHatF', 'Worker_Female', 'Hat', None),
    # hair
    ('hairShort', 'Casual_Male', 'Hair', None),
    ('hairShort2', 'Suit_Male', 'Hair', None),
    ('hairShort3', 'Doctor_Male_Young', 'Hair', None),
    ('hairSpiky', 'Casual2_Male', 'Hair', None),
    ('hairCurly', 'Casual3_Male', 'Hair', None),
    ('hairCurly2', 'Cowboy_Hair', 'Hair', None),
    ('hairLong', 'Casual_Female', 'Hair', None),
    ('hairLong2', 'Casual3_Female', 'Hair', None),
    ('hairLong3', 'Suit_Female', 'Hair', None),
    ('hairLong4', 'Doctor_Female_Young', 'Hair', None),
    ('hairPony', 'Ninja_Female', 'Hair', None),
    ('hairPony2', 'Worker_Female', 'Hair', None),
    ('hairBob', 'Casual2_Female', 'Hair', None),
    ('hairOld', 'Doctor_Male_Old', 'Hair', None),
    ('beard', 'Viking_Male', 'Hair', 'beard'),
    ('moustache2', 'OldClassy_Male', 'Hair', 'beard'),
]
SIMPLIFY = {'hair': 1100, 'beard': 700, 'moustache': 200}   # target triangles by part-id prefix
CLIPS = ['Idle', 'Walk', 'Run', 'Victory', 'PickUp', 'Punch', 'Jump', 'Walk_Carry', 'Defeat', 'SitDown']
FPS = 30

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

cache = {}
def load(name):
    if name not in cache:
        g = json.load(open(os.path.join(SRC, name + '.gltf')))
        bufs = []
        for b in g['buffers']:
            uri = b['uri']
            bufs.append(base64.b64decode(uri.split(',', 1)[1]) if uri.startswith('data:') else open(os.path.join(SRC, uri), 'rb').read())
        g['_bufs'] = bufs
        cache[name] = g
    return cache[name]

def acc(g, i):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NCOMP[a['type']]
    stride = v.get('byteStride') or size * n
    base = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    buf = g['_bufs'][v['buffer']]
    out = []
    for k in range(a['count']):
        vals = struct.unpack_from('<' + fmt * n, buf, base + k * stride)
        if a.get('normalized'):
            m = {5121: 255, 5123: 65535, 5120: 127, 5122: 32767}[a['componentType']]
            vals = tuple(x / m for x in vals)
        out.append(vals if n > 1 else vals[0])
    return out

def primitive(g, material):
    for m in g['meshes']:
        for p in m['primitives']:
            if g['materials'][p['material']]['name'] == material:
                return p
    raise SystemExit(f'material {material} not found')

def components(idx, nverts):
    parent = list(range(nverts))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for t in range(0, len(idx), 3):
        a, b, c = find(idx[t]), find(idx[t + 1]), find(idx[t + 2])
        parent[b] = a; parent[find(c)] = a
    return [find(i) for i in range(nverts)]

def split(pos, idx, mode):
    """Keep the triangles of connected pieces that are beard (below the eyes, in front) or the rest."""
    comp = components(idx, len(pos))
    groups = {}
    for i, c in enumerate(comp):
        groups.setdefault(c, []).append(i)
    keep = set()
    for c, vs in groups.items():
        cy = sum(pos[v][1] for v in vs) / len(vs)
        cz = sum(pos[v][2] for v in vs) / len(vs)
        is_beard = cy < 2.55 and cz > 0.05
        if (mode == 'beard') == is_beard:
            keep.add(c)
    return [t for k in range(0, len(idx), 3) for t in idx[k:k + 3] if comp[idx[k]] in keep]

def weld(pos, jnt, wgt, idx):
    """Merge vertices that share a position (normals are dropped, so hard edges no longer need copies)."""
    used = sorted(set(idx))
    key_to_new, remap, P, J, W = {}, {}, [], [], []
    for v in used:
        k = tuple(round(c, 5) for c in pos[v])
        if k not in key_to_new:
            key_to_new[k] = len(P); P.append(pos[v]); J.append(jnt[v]); W.append(wgt[v])
        remap[v] = key_to_new[k]
    I = [remap[v] for v in idx]
    I = [x for t in range(0, len(I), 3) for x in I[t:t + 3] if len({I[t], I[t + 1], I[t + 2]}) == 3]
    return P, J, W, I

def simplify(pos, jnt, wgt, idx, target):
    pts = np.array(pos, dtype=np.float64); tri = np.array(idx, dtype=np.int64).reshape(-1, 3)
    reduction = 1 - target / len(tri)
    _, _, collapses = fast_simplification.simplify(pts, tri, reduction, return_collapses=True)
    newpts, newtri, mapping = fast_simplification.replay_simplification(pts, tri, collapses)
    # each new vertex keeps the skin weights of the nearest original vertex that collapsed into it
    P, J, W = [], [], []
    for n in range(len(newpts)):
        src = np.nonzero(mapping == n)[0]
        best = src[np.argmin(((pts[src] - newpts[n]) ** 2).sum(1))]
        P.append(tuple(newpts[n])); J.append(jnt[best]); W.append(wgt[best])
    return P, J, W, [int(x) for x in newtri.reshape(-1)]

# ---------- parts ----------
blob = bytearray()
def align(n=4):
    while len(blob) % n:
        blob.append(0)

parts = {}
bbmin, bbmax = [1e9] * 3, [-1e9] * 3
raw = []
for pid, model, mat, splitter in PARTS:
    g = load(model)
    p = primitive(g, mat)
    A = p['attributes']
    pos = acc(g, A['POSITION'])
    nor = acc(g, A['NORMAL'])
    jnt = acc(g, A['JOINTS_0'])
    wgt = acc(g, A['WEIGHTS_0'])
    idx = acc(g, p['indices'])
    if splitter:
        idx = split(pos, idx, splitter)
    pos, jnt, wgt, idx = weld(pos, jnt, wgt, idx)
    target = next((t for k, t in SIMPLIFY.items() if pid.startswith(k)), None)
    if target and len(idx) // 3 > target:
        pos, jnt, wgt, idx = simplify(pos, jnt, wgt, idx, target)
    for v in pos:
        for k in range(3):
            bbmin[k] = min(bbmin[k], v[k]); bbmax[k] = max(bbmax[k], v[k])
    colour = g['materials'][p['material']]['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1])
    raw.append((pid, model, mat, pos, None, jnt, wgt, idx, colour))

# ---------- which body vertices does each garment cover? ----------
# The full body sits right under the clothes, so it would z-fight through them. For every garment we cast a short
# ray outward from each body vertex; if it hits that garment (on a triangle of the same body region) the vertex is
# covered. The game drops body triangles whose three vertices are covered by what the character is wearing.
GROUP = {}
for j in (2, 3, 4, 5, 6, 8, 12): GROUP[j] = 'torso'
for j in (9, 10, 11): GROUP[j] = 'armL'
for j in (13, 14, 15): GROUP[j] = 'armR'
for j in (16, 17, 1): GROUP[j] = 'legL'
for j in (18, 19, 21): GROUP[j] = 'legR'
GROUP[7] = 'head'
GARMENT = ('tee', 'tank', 'work', 'shorts', 'jeans', 'slim', 'belt')

def dominant(jnt, wgt):
    return [j[max(range(4), key=lambda k: w[k])] for j, w in zip(jnt, wgt)]

def coverage(body, cloth, max_dist=0.14):
    bp = np.array(body[3], dtype=np.float64); bt = np.array(body[7]).reshape(-1, 3)
    bdom = dominant(body[5], body[6])
    # area-weighted vertex normals of the (welded) body
    vn = np.zeros_like(bp)
    fn = np.cross(bp[bt[:, 1]] - bp[bt[:, 0]], bp[bt[:, 2]] - bp[bt[:, 0]])
    for k in range(3): np.add.at(vn, bt[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    cp = np.array(cloth[3], dtype=np.float64); ct = np.array(cloth[7]).reshape(-1, 3)
    cdom = dominant(cloth[5], cloth[6])
    tri_group = []
    for t in ct.tolist():
        ds = [cdom[i] for i in t]
        tri_group.append(GROUP.get(max(set(ds), key=ds.count), '?'))
    tri_group = np.array(tri_group)
    v0, v1, v2 = cp[ct[:, 0]], cp[ct[:, 1]], cp[ct[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    out = []
    for v in range(len(bp)):
        o, d = bp[v], vn[v]
        h = np.cross(d, e2); a = (e1 * h).sum(1)
        ok = np.abs(a) > 1e-9
        f = np.where(ok, 1 / np.where(ok, a, 1), 0)
        sv = o - v0
        u = f * (sv * h).sum(1)
        q = np.cross(sv, e1)
        w = f * (q * d).sum(1)
        t = f * (q * e2).sum(1)
        hit = ok & (u >= -1e-4) & (w >= -1e-4) & (u + w <= 1 + 1e-4) & (t > -0.01) & (t < max_dist) & (tri_group == GROUP.get(bdom[v], '!'))
        idx = np.nonzero(hit)[0]
        if len(idx):
            out.append((v, int(idx[np.argmin(t[idx])])))
    return out

body_raw = next(r for r in raw if r[0] == 'body')
covers = {}
for r in raw:
    if r[0].startswith(GARMENT):
        covers[r[0]] = coverage(body_raw, r)

# one quantisation box for every part: int16 positions
qmin = [float(x) for x in bbmin]
qscale = [float(bbmax[k] - bbmin[k]) / 65535 or 1 for k in range(3)]
seen = {}
for pid, model, mat, pos, nor, jnt, wgt, idx, colour in raw:
    h = hashlib.sha1(repr((pos, idx)).encode()).hexdigest()
    if h in seen:
        parts[pid] = dict(parts[seen[h]], source=f'{model}/{mat}', colour=[round(c, 4) for c in colour[:3]])
        continue
    seen[h] = pid
    align(4)
    off = len(blob)
    for v in pos:
        blob += struct.pack('<hhh', *[int(round((v[k] - qmin[k]) / qscale[k])) - 32768 for k in range(3)])
    align(4)
    joff = len(blob)
    for j in jnt:
        blob += struct.pack('<BBBB', *j)
    woff = len(blob)
    for w in wgt:
        s = sum(w) or 1
        q = [int(round(x / s * 255)) for x in w]
        q[q.index(max(q))] += 255 - sum(q)
        blob += struct.pack('<BBBB', *q)
    align(4)
    ioff = len(blob)
    for i in idx:
        blob += struct.pack('<H', i)
    cover_off, cover_n = 0, 0
    if pid in covers and covers[pid]:
        align(4)
        cover_off, cover_n = len(blob), len(covers[pid])
        for bv, ctri in covers[pid]:
            blob += struct.pack('<HH', bv, ctri)
    parts[pid] = {
        'source': f'{model}/{mat}', 'vertices': len(pos), 'indices': len(idx), 'covers': cover_off, 'coverCount': cover_n,
        'position': off, 'joints': joff, 'weights': woff, 'index': ioff,
        'colour': [round(c, 4) for c in colour[:3]],
    }

# ---------- skeleton ----------
g = load('BaseCharacter')
N = g['nodes']
joints = g['skins'][0]['joints']
jset = {j: i for i, j in enumerate(joints)}
parent_of = {}
for i, n in enumerate(N):
    for c in n.get('children', []):
        parent_of[c] = i
bones = []
for j in joints:
    n = N[j]
    p = parent_of.get(j)
    bones.append({
        'name': n['name'], 'parent': jset.get(p, -1),
        't': n.get('translation', [0, 0, 0]), 'r': n.get('rotation', [0, 0, 0, 1]), 's': n.get('scale', [1, 1, 1]),
    })
ibm = [round(x, 6) for m in acc(g, g['skins'][0]['inverseBindMatrices']) for x in m]
# the armature node above the root bone carries no transform in this pack; check so a future pack can't surprise us
root_chain = []
k = parent_of.get(joints[0])
while k is not None:
    root_chain.append(N[k].get('name'))
    assert not N[k].get('rotation') or N[k]['rotation'] == [0, 0, 0, 1], 'armature has a rotation'
    k = parent_of.get(k)

# ---------- animations (resampled at FPS, rotations for every bone + translation for Body) ----------
def sample(times, values, t, n, slerp):
    if t <= times[0]:
        return values[0]
    if t >= times[-1]:
        return values[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t: lo = mid
        else: hi = mid
    f = (t - times[lo]) / (times[hi] - times[lo])
    a, b = values[lo], values[hi]
    if not slerp:
        return tuple(a[i] + (b[i] - a[i]) * f for i in range(n))
    d = sum(a[i] * b[i] for i in range(4))
    if d < 0:
        b = tuple(-x for x in b); d = -d
    q = tuple(a[i] + (b[i] - a[i]) * f for i in range(4))  # nlerp is plenty at 30 fps
    l = math.sqrt(sum(x * x for x in q))
    return tuple(x / l for x in q)

clips = {}
g = load('Casual_Male')
N = g['nodes']
name_to_joint = {N[j]['name']: i for i, j in enumerate(g['skins'][0]['joints'])}
for a in g['animations']:
    if a['name'] not in CLIPS:
        continue
    dur = max(g['accessors'][s['input']]['max'][0] for s in a['samplers'])
    frames = max(2, int(round(dur * FPS)) + 1)
    rot_tracks, pos_tracks = {}, {}
    for ch in a['channels']:
        nm = N[ch['target']['node']]['name']
        if nm not in name_to_joint:
            continue
        s = a['samplers'][ch['sampler']]
        times = acc(g, s['input']); vals = acc(g, s['output'])
        if ch['target']['path'] == 'rotation':
            rot_tracks[name_to_joint[nm]] = (times, vals)
        elif ch['target']['path'] == 'translation' and nm == 'Body':
            pos_tracks[name_to_joint[nm]] = (times, vals)
    align(4)
    off = len(blob)
    order = sorted(rot_tracks)
    for f in range(frames):
        t = min(dur, f / FPS)
        for j in order:
            times, vals = rot_tracks[j]
            blob += struct.pack('<4f', *sample(times, vals, t, 4, True))
    poff = len(blob)
    porder = sorted(pos_tracks)
    for f in range(frames):
        t = min(dur, f / FPS)
        for j in porder:
            times, vals = pos_tracks[j]
            blob += struct.pack('<3f', *sample(times, vals, t, 3, False))
    clips[a['name']] = {'duration': round(dur, 4), 'frames': frames, 'rotations': off, 'rotationBones': order,
                        'positions': poff, 'positionBones': porder}

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'characters.bin'), 'wb').write(bytes(blob))
manifest = {
    'source': 'Ultimate Animated Character Pack (Nov 2019) by Quaternius, CC0 1.0',
    'fps': FPS, 'quantize': {'min': qmin, 'scale': qscale},
    'bones': bones, 'inverseBind': ibm, 'parts': parts, 'clips': clips,
}
json.dump(manifest, open(os.path.join(OUT, 'characters.json'), 'w'), separators=(',', ':'))
print(f'{len(parts)} parts, {len(clips)} clips, {len(blob) / 1024:.0f} KB binary')
for pid, p in parts.items():
    print(f'  {pid:12} {p["source"]:28} {p["vertices"]:5} verts {p["indices"] // 3:5} tris')
