# 2D rig of Juts (prototype, not used by the site)

Juts cut from his idle game frame (`idle7.png`, cell 7 of `public/arena/flip-idle.webp`) and rebuilt on an
18-bone skeleton: the body is one bending (skinned) mesh, the big wing its own layer, the spear the weapon
picture on a shaft held at the hand. Feet are planted by two-bone leg IK; head, wings, cape and the hanging
ring follow through on springs.

1. `python3 cut.py`   cut the frame into layers (`L_body.png`, `L_wing.png`; removes the recording's spear, the cursor, the halo)
2. `python3 build.py` skin weights from the painted regions in `rigdef.py` (softened across joints) and the grid meshes -> `rig.json`
3. round it into `rig.min.json` (see the session notes) and `python3 mk.py` -> `index.html` (three.js r128 from cdnjs)

The paths in `build.py` and `mk.py` point at the session scratchpad; adjust them when re-running.
