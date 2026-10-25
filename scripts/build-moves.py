#!/usr/bin/env python3
"""Convert clips from Quaternius' "Universal Animation Library" 1 and 2 (CC0) into the game's pose space.

Usage:  python3 -I scripts/build-moves.py "<UAL1_Standard.glb>" "<UAL2_Standard.glb>" public/characters

The library is animated on a 65-bone mannequin, not the character pack's 23-bone skeleton, so the clips are
stored the way the procedural poses are (poses.ts): one world rotation for each of the 11 procedural bones
(hips, spine, head, arms, forearms, thighs, shins), measured from a "standing, limbs hanging straight down" rest,
plus the hips position as a fraction of standing hip height. pack.ts then retargets them onto the pack skeleton
with the same code it uses for every procedural pose, so the two blend freely. No dependencies beyond Python.

  moves.json  clip index (duration, frame count, offset into moves.bin)
  moves.bin   per frame: 11 quaternions (x, y, z, w) then the hips (x, y, z), all int16 (quaternions / 32767,
              hips / 16384)
"""
import json, math, os, struct, sys

UAL1, UAL2, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
FPS = 30

# (game name, source file, clip, procedural side the busy hand must be on, or None)
# The procedural rig's 'R' hand is the one that holds the phone and the water bottle.
CLIPS = [
    ('talk', UAL1, 'Idle_Talking_Loop', None),
    ('phone', UAL2, 'Idle_TalkingPhone_Loop', 'R'),
    ('drink', UAL2, 'Consume', 'R'),
    ('foldArms', UAL2, 'Idle_FoldArms_Loop', None),
    ('build', UAL1, 'Fixing_Kneeling', None),
    ('nod', UAL2, 'Yes', None),
    ('dance', UAL1, 'Dance_Loop', None),
]

# procedural bone -> library bone. The procedural 'L' side is at x < 0, the character's right (library '_r').
PROC = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR']
SOURCE = {
    'hips': 'pelvis', 'spine': 'spine_03', 'head': 'Head',
    'armL': 'upperarm_r', 'foreL': 'lowerarm_r', 'armR': 'upperarm_l', 'foreR': 'lowerarm_l',
    'thighL': 'thigh_r', 'shinL': 'calf_r', 'thighR': 'thigh_l', 'shinR': 'calf_l',
}
LIMB_END = {  # the joint each limb bone points at, to find "hanging straight down"
    'upperarm_r': 'lowerarm_r', 'lowerarm_r': 'hand_r', 'upperarm_l': 'lowerarm_l', 'lowerarm_l': 'hand_l',
    'thigh_r': 'calf_r', 'calf_r': 'foot_r', 'thigh_l': 'calf_l', 'calf_l': 'foot_l',
}
MIRROR = {'armL': 'armR', 'foreL': 'foreR', 'thighL': 'thighR', 'shinL': 'shinR'}
MIRROR.update({v: k for k, v in MIRROR.items()})

# ---------- quaternions (x, y, z, w) ----------
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
def qconj(q): return (-q[0], -q[1], -q[2], q[3])
def qnorm(q):
    l = math.sqrt(sum(c * c for c in q)) or 1
    return tuple(c / l for c in q)
def qrot(q, v):
    return qmul(qmul(q, (v[0], v[1], v[2], 0)), qconj(q))[:3]
def from_units(a, b):
    """Shortest rotation taking unit vector a to unit vector b."""
    d = sum(a[i] * b[i] for i in range(3))
    if d < -0.999999:
        axis = (1, 0, 0) if abs(a[0]) < 0.9 else (0, 0, 1)
        c = (a[1] * axis[2] - a[2] * axis[1], a[2] * axis[0] - a[0] * axis[2], a[0] * axis[1] - a[1] * axis[0])
        return qnorm((c[0], c[1], c[2], 0))
    c = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    return qnorm((c[0], c[1], c[2], 1 + d))
def vsub(a, b): return tuple(a[i] - b[i] for i in range(3))
def vadd(a, b): return tuple(a[i] + b[i] for i in range(3))
def vunit(v):
    l = math.sqrt(sum(c * c for c in v)) or 1
    return tuple(c / l for c in v)

# ---------- glb reading ----------
COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

cache = {}
def load(path):
    if path not in cache:
        b = open(path, 'rb').read()
        n = struct.unpack_from('<I', b, 12)[0]
        g = json.loads(b[20:20 + n])
        off = 20 + n
        blen = struct.unpack_from('<I', b, off)[0]
        g['_bin'] = b[off + 8:off + 8 + blen]
        g['_byname'] = {x['name']: i for i, x in enumerate(g['nodes'])}
        g['_parent'] = {c: i for i, x in enumerate(g['nodes']) for c in x.get('children', [])}
        cache[path] = g
    return cache[path]

def acc(g, i):
    a = g['accessors'][i]
    v = g['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NCOMP[a['type']]
    stride = v.get('byteStride') or size * n
    base = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from('<' + fmt * n, g['_bin'], base + k * stride) if n > 1 else struct.unpack_from('<' + fmt, g['_bin'], base + k * stride)[0]
            for k in range(a['count'])]

def sample(times, values, t, slerp):
    if t <= times[0]: return values[0]
    if t >= times[-1]: return values[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t: lo = mid
        else: hi = mid
    f = (t - times[lo]) / (times[hi] - times[lo])
    a, b = values[lo], values[hi]
    if slerp and sum(a[i] * b[i] for i in range(4)) < 0:
        b = tuple(-x for x in b)
    out = tuple(a[i] + (b[i] - a[i]) * f for i in range(len(a)))
    return qnorm(out) if slerp else out

def world(g, local_t, local_r, name):
    """World position and rotation of a node, from per-node local transforms (scale is ~1 throughout)."""
    chain = []
    i = g['_byname'][name]
    while i is not None:
        chain.append(i); i = g['_parent'].get(i)
    pos, rot = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)
    for i in reversed(chain):
        pos = vadd(pos, qrot(rot, local_t(i)))
        rot = qmul(rot, local_r(i))
    return pos, rot

def rest_t(g): return lambda i: tuple(g['nodes'][i].get('translation', (0, 0, 0)))
def rest_r(g): return lambda i: tuple(g['nodes'][i].get('rotation', (0, 0, 0, 1)))

# ---------- reference: the library's rest pose with every limb hanging straight down ----------
def reference(g):
    T, R = rest_t(g), rest_r(g)
    ref = {}
    for p in PROC:
        b = SOURCE[p]
        pos, rot = world(g, T, R, b)
        if b in LIMB_END:
            end, _ = world(g, T, R, LIMB_END[b])
            rot = qmul(from_units(vunit(vsub(end, pos)), (0, -1, 0)), rot)
        ref[p] = rot
    pelvis, _ = world(g, T, R, 'pelvis')
    foot, _ = world(g, T, R, 'ball_l')
    # sanity: the library character faces +Z with its left side at +X (like the pack), feet on the floor
    hl, _ = world(g, T, R, 'thigh_l'); toe, _ = world(g, T, R, 'ball_l'); heel, _ = world(g, T, R, 'foot_l')
    assert hl[0] > pelvis[0], 'library left side is not at +X'
    assert toe[2] > heel[2], 'library character does not face +Z'
    return ref, pelvis, foot[1]

def mirror_q(q): return (q[0], -q[1], -q[2], q[3])   # reflect across the x = 0 plane

# ---------- clips ----------
blob = bytearray()
clips = {}
for game, path, clip, hand in CLIPS:
    g = load(path)
    ref, pelvis0, floor = reference(g)
    hip_h = pelvis0[1] - floor
    a = next(x for x in g['animations'] if x['name'] == clip)
    tracks = {}
    for ch in a['channels']:
        s = a['samplers'][ch['sampler']]
        tracks[(ch['target']['node'], ch['target']['path'])] = (acc(g, s['input']), acc(g, s['output']))
    dur = max(g['accessors'][s['input']]['max'][0] for s in a['samplers'])
    frames = max(2, int(round(dur * FPS)) + 1)
    T0, R0 = rest_t(g), rest_r(g)
    out = []
    for f in range(frames):
        t = min(dur, f / FPS)
        lt = lambda i: sample(*tracks[(i, 'translation')], t, False) if (i, 'translation') in tracks else T0(i)
        lr = lambda i: sample(*tracks[(i, 'rotation')], t, True) if (i, 'rotation') in tracks else R0(i)
        q = {}
        for p in PROC:
            _, w = world(g, lt, lr, SOURCE[p])
            q[p] = qnorm(qmul(w, qconj(ref[p])))
        hp, _ = world(g, lt, lr, 'pelvis')
        hips = ((hp[0] - pelvis0[0]) / hip_h, (hp[1] - floor) / hip_h, (hp[2] - pelvis0[2]) / hip_h)
        hand_pos = {s: world(g, lt, lr, 'hand_' + s)[0] for s in 'lr'}
        out.append((q, hips, hand_pos))
    mirror = False
    if hand:
        # the hand that rises highest is the busy one; library '_l' is procedural 'R'
        lift = {s: max(o[2][s][1] for o in out) for s in 'lr'}
        busy = 'R' if lift['l'] >= lift['r'] else 'L'
        mirror = busy != hand
    align = (4 - len(blob) % 4) % 4
    blob += b'\0' * align
    off = len(blob)
    for q, hips, _ in out:
        for p in PROC:
            src = q[MIRROR.get(p, p)] if mirror else q[p]
            if mirror: src = mirror_q(src)
            if src[3] < 0: src = tuple(-c for c in src)
            blob += struct.pack('<4h', *[max(-32767, min(32767, int(round(c * 32767)))) for c in src])
        hx = -hips[0] if mirror else hips[0]
        blob += struct.pack('<3h', *[max(-32767, min(32767, int(round(c * 16384)))) for c in (hx, hips[1], hips[2])])
    clips[game] = {'source': f'{os.path.basename(path)}/{clip}', 'duration': round(dur, 4), 'frames': frames, 'offset': off, 'mirrored': mirror}
    print(f'  {game:9} {clip:24} {dur:5.2f}s {frames:4} frames{"  (mirrored)" if mirror else ""}')

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'moves.bin'), 'wb').write(bytes(blob))
json.dump({
    'source': 'Universal Animation Library 1 + 2 (Standard) by Quaternius, CC0 1.0',
    'fps': FPS, 'bones': PROC, 'clips': clips,
}, open(os.path.join(OUT, 'moves.json'), 'w'), separators=(',', ':'))
print(f'{len(clips)} clips, {len(blob) / 1024:.0f} KB binary')
