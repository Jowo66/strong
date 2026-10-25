"""Convert the Quaternius Shiba Inu (Ultimate Animated Animals, CC0) into a small GLB for the gym dog.

Run with Blender 4+:
    blender -b --factory-startup -P scripts/build-dog.py -- "<Design Assets folder>" public/props/dog.glb

Keeps only the clips the dog uses, decimates the mesh, and lets the exporter drop redundant keyframes. The pack's
glTF embeds every clip as base64 (1.4 MB); the result is a fraction of that.
"""
import os, sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
KEEP = {'Idle', 'Idle_2_HeadLow', 'Walk', 'Eating', 'Death'}  # Death, played slowly and held, is how it lies down to nap
TRIS = 2200

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, 'Ultimate Animated Animals - July 2021/glTF/ShibaInu.gltf'))
for a in list(bpy.data.actions):
    if a.name not in KEEP:
        bpy.data.actions.remove(a)
print('clips:', sorted(a.name for a in bpy.data.actions))

for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > TRIS // 2:
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = (TRIS // 2) / tris
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)  # decimate the rest pose, not the skinned one
        bpy.ops.object.modifier_apply(modifier=mod.name)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animation_mode='ACTIONS',
                          export_optimize_animation_size=True, export_force_sampling=True, export_frame_step=2,
                          export_texcoords=False, export_tangents=False, export_cameras=False, export_lights=False)
print(f'{OUT}: {os.path.getsize(OUT) / 1024:.0f} KB')
