# 2D rig v2: base body + costume layers (prototype, not used by the site)

- `ref/base_cut.png`: the bare base body (recording 2026-10-15 14:08, 11.7 s; cut with rembg isnet-general-use).
- `ref/armor_cut.png`: the armour costume (screenshot 2026-10-15 18:06, same idle pose).
- `joints.py`: the skeleton's joints marked on each picture (R = his right = the far side on screen).
- `parts.py`: the pieces of each picture (far/near arm and hand, wings, erased spear).
- `build2.py`: cuts each costume into pieces, fills the torso under the arms, weights every piece to its bones
  with soft joints, and fits the armour onto the base skeleton bone by bone -> `rig2.json`
  (build2 reads the cut-outs from `../ref/`; adjust the paths when re-running).
- `page2.html` + `mk2.py`: the player (three.js r128): arm and leg reach, the two-handed grip, the spear's
  direction in depth with the camera's downward tilt, the Skyfall sweep, trail and burst.

A new costume: a picture in the same idle pose, its joints in `joints.py`, its pieces in `parts.py`, one more `costume(...)` call.
