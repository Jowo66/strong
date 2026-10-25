"""Convert a few Quaternius furniture and prop models (CC0) into one compact asset for the room.

Run with Blender 4+ (it reads the packs' FBX files):
    blender -b --factory-startup -P scripts/build-props.py -- "<Design Assets folder>" public/props

Writes:
  props.json  for each prop: vertex / index counts, offsets into props.bin, size (metres, x y z)
  props.bin   int16 positions (quantised to the prop's own box), u8 RGB colours, u16 indices

Each prop is triangulated, decimated to a triangle budget, and moved so its footprint is centred on the origin
with its base at y = 0, Y up (three.js convention). Colours are the flat material colours baked per vertex, so
the room can merge props into its vertex-coloured geometry (kit.ts) with no extra draw calls or textures.
"""
import json, os, struct, sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]

# (prop id, model file relative to the Design Assets folder, triangle budget)
PROPS = [
    ('plantMonstera', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_7.fbx', 900),
    ('plantPalm', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_6.fbx', 900),
    ('plantSnake', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_4.fbx', 600),
    ('plantCactus', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_3.fbx', 500),
    ('plantLeafy', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_1.fbx', 600),
    ('plantTiny', 'Ultimate House Interior Pack - June 2020/FBX/Houseplant_2.fbx', 300),
    ('couch', 'Ultimate House Interior Pack - June 2020/FBX/Couch_Large1.fbx', 1500),
    ('coffeeTable', 'Ultimate House Interior Pack - June 2020/FBX/Table_RoundSmall.fbx', 400),
    ('stool', 'Ultimate House Interior Pack - June 2020/FBX/Stool.fbx', 300),
    ('trophy', 'Ultimate RPG Items Pack - Aug 2019/FBX/Chalice.fbx', 400),
]


def material_colour(mat):
    if mat is None:
        return (0.8, 0.8, 0.8)
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                c = n.inputs['Base Color'].default_value
                return (c[0], c[1], c[2])
    c = mat.diffuse_color
    return (c[0], c[1], c[2])


def to_srgb(c):
    c = max(0.0, min(1.0, c))
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def convert(path, budget):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert meshes, f'no mesh in {path}'
    # one object, transforms applied, triangulated and decimated
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris > budget:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = budget / tris
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh = obj.data
    mesh.calc_loop_triangles()
    cols = [to_srgb_tuple(material_colour(m)) for m in mesh.materials] or [(0.8, 0.8, 0.8)]
    # Blender is Z-up; three.js is Y-up: (x, y, z) -> (x, z, -y)
    verts, index, key = [], [], {}
    for tri in mesh.loop_triangles:
        for vi in tri.vertices:
            k = (vi, tri.material_index)
            if k not in key:
                co = mesh.vertices[vi].co
                key[k] = len(verts)
                verts.append(((co.x, co.z, -co.y), cols[min(tri.material_index, len(cols) - 1)]))
            index.append(key[k])
    lo = [min(v[0][a] for v in verts) for a in range(3)]
    hi = [max(v[0][a] for v in verts) for a in range(3)]
    centre = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)
    pos = [tuple(v[0][a] - centre[a] for a in range(3)) for v in verts]
    size = [hi[a] - lo[a] for a in range(3)]
    return pos, [v[1] for v in verts], index, size


def to_srgb_tuple(c):
    return tuple(to_srgb(x) for x in c)


blob = bytearray()
def align():
    while len(blob) % 4:
        blob.append(0)

props = {}
for pid, rel, budget in PROPS:
    pos, col, index, size = convert(os.path.join(SRC, rel), budget)
    assert len(pos) < 65536
    half = [max(s / 2, 1e-6) for s in size]
    align()
    p_off = len(blob)
    for x, y, z in pos:
        # x, z in [-half, half]; y in [0, size]
        blob += struct.pack('<hhh', round(x / half[0] * 32767), round((y / max(size[1], 1e-6)) * 65535) - 32768, round(z / half[2] * 32767))
    c_off = len(blob)
    for c in col:
        blob += struct.pack('<BBB', *[round(v * 255) for v in c])
    align()
    i_off = len(blob)
    for i in index:
        blob += struct.pack('<H', i)
    props[pid] = {'source': rel.split('/')[0] + '/' + os.path.basename(rel), 'vertices': len(pos), 'indices': len(index),
                  'position': p_off, 'colour': c_off, 'index': i_off, 'size': [round(s, 4) for s in size]}
    print(f'  {pid:12} {len(index) // 3:5} tris  size {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f}')

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'props.bin'), 'wb').write(bytes(blob))
json.dump({'source': 'Quaternius (CC0 1.0): Ultimate House Interior Pack, Ultimate RPG Items Pack', 'props': props},
          open(os.path.join(OUT, 'props.json'), 'w'), separators=(',', ':'))
print(f'{len(props)} props, {len(blob) / 1024:.0f} KB binary')
