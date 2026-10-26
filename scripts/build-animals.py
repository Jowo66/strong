"""Convert the gym's animals (Quaternius, CC0) into small animated GLBs.

Run with Blender 4+:
    blender -b --factory-startup -P scripts/build-animals.py -- "<Design Assets folder>" public/animals

Each animal keeps only the clips the gym uses (renamed to plain names like 'Walk'), is decimated to a triangle
budget, and is exported with redundant keyframes dropped. The packs' own files embed every clip (the Shiba Inu's
glTF is 1.4 MB); these come out at a fraction of that.
"""
import os, sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]

# (output name, model relative to the Design Assets folder, clips to keep, triangle budget)
# The dogs' Death clip, played slowly and held on its last frame, is how they lie down to nap.
DOG_CLIPS = {'Idle', 'Idle_2_HeadLow', 'Walk', 'Eating', 'Death'}
FISH_CLIPS = {'Swimming_Normal'}
ANIMALS = [
    ('shiba', 'Ultimate Animated Animals - July 2021/glTF/ShibaInu.gltf', DOG_CLIPS, 2200),
    ('husky', 'Ultimate Animated Animals - July 2021/glTF/Husky.gltf', DOG_CLIPS, 2200),
    ('pug', 'Farm Animals by @Quaternius/FBX/Pug.fbx', {'Idle', 'Jump'}, 700),
    ('goldfish', 'Cute Fish Pack - Feb 2020/FBX/Goldfish.fbx', FISH_CLIPS, 400),
    ('clownfish', 'Cute Fish Pack - Feb 2020/FBX/Clownfish.fbx', FISH_CLIPS, 400),
    ('bluetang', 'Cute Fish Pack - Feb 2020/FBX/BlueTang.fbx', FISH_CLIPS, 400),
    ('betta', 'Cute Fish Pack - Feb 2020/FBX/Betta.fbx', FISH_CLIPS, 400),
]


def convert(name, rel, keep, budget):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(SRC, rel)
    if path.endswith('.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)
    # FBX actions arrive as 'Armature|Armature|Idle'
    for a in list(bpy.data.actions):
        a.name = a.name.split('|')[-1]
        if a.name not in keep:
            bpy.data.actions.remove(a)
    # drop the cameras, lights and stray ground planes some of the packs' files carry
    for o in list(bpy.context.scene.objects):
        rigged = o.type == 'MESH' and (o.find_armature() or any(m.type == 'ARMATURE' for m in o.modifiers))
        if o.type not in ('ARMATURE', 'EMPTY') and not rigged:
            bpy.data.objects.remove(o)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # the FBX files import with alpha 0, which the exporter turns into a fully cut-out mask: make everything opaque
    for mat in {m for o in meshes for m in o.data.materials if m}:
        for n in (mat.node_tree.nodes if mat.node_tree else []):
            if n.type == 'BSDF_PRINCIPLED':
                for link in list(n.inputs['Alpha'].links):
                    mat.node_tree.links.remove(link)
                n.inputs['Alpha'].default_value = 1.0
    total = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    if total > budget:
        for o in meshes:
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new('decimate', 'DECIMATE')
            mod.ratio = budget / total
            bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)  # decimate the rest pose, not the skinned one
            bpy.ops.object.modifier_apply(modifier=mod.name)
    out = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='ACTIONS',
                              export_optimize_animation_size=True, export_force_sampling=True, export_frame_step=2,
                              export_texcoords=False, export_tangents=False, export_cameras=False, export_lights=False)
    print(f'  {name:10} {sorted(a.name for a in bpy.data.actions)}  {os.path.getsize(out) / 1024:.0f} KB')


os.makedirs(OUT, exist_ok=True)
for a in ANIMALS:
    convert(*a)
