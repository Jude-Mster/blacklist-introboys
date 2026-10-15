# Skin weights and meshes for the 2D rig: every pixel of a layer gets its bone from the painted regions,
# softened across the joints (so a knee bends instead of breaking), then a grid mesh over the picture
# carries those weights at its corners.
import numpy as np, cv2, json, base64
from PIL import Image, ImageDraw
from scipy import ndimage
exec(open('rigdef.py').read())
boxes = json.load(open('boxes.json'))
H, W = 560, 700
names = [b[0] for b in BONES]; idx = {n: i for i, n in enumerate(names)}
STEP = 3          # mesh grid in source pixels
SOFT = 4.5        # how soft the joints are (source pixels)
def layer(name, regions):
    x0, y0, x1, y1 = boxes[name]
    img = Image.open(f'L_{name}.png'); a = np.array(img)[..., 3]
    # alpha back at source scale for the mesh outline
    asrc = cv2.resize(a, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA) > 6
    lab = np.full((y1 - y0, x1 - x0), -1, int)
    for n, pts in regions:
        m = Image.new('L', (x1 - x0, y1 - y0), 0); ImageDraw.Draw(m).polygon([(px - x0, py - y0) for px, py in pts], fill=255)
        lab[np.array(m) > 0] = idx[n]
    # pixels outside every region take the nearest region's bone
    known = lab >= 0
    _, (iy, ix) = ndimage.distance_transform_edt(~known, return_indices=True)
    lab = lab[iy, ix]
    used = sorted(set(lab.ravel().tolist()))
    maps = {b: ndimage.gaussian_filter((lab == b).astype(np.float32), SOFT) for b in used}
    # the mesh: grid cells that touch the picture
    gy, gx = np.mgrid[0:(y1 - y0) + STEP:STEP, 0:(x1 - x0) + STEP:STEP]
    ny, nx = gy.shape
    dil = cv2.dilate(asrc.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    vid = -np.ones((ny, nx), int); verts = []; uvs = []; sk = []; sw = []
    def vert(j, i):
        if vid[j, i] >= 0: return vid[j, i]
        X, Y = min(gx[j, i], x1 - x0 - 1), min(gy[j, i], y1 - y0 - 1)
        w = sorted(((float(maps[b][Y, X]), b) for b in used), reverse=True)[:4]
        tot = sum(v for v, _ in w) or 1
        vid[j, i] = len(verts); verts.append((x0 + gx[j, i], y0 + gy[j, i])); uvs.append((gx[j, i] / (x1 - x0), 1 - gy[j, i] / (y1 - y0)))
        sk.append([b for _, b in w] + [0] * (4 - len(w))); sw.append([round(v / tot, 4) for v, _ in w] + [0] * (4 - len(w)))
        return vid[j, i]
    tris = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            ya, yb, xa, xb = gy[j, i], min(gy[j + 1, i], y1 - y0), gx[j, i], min(gx[j, i + 1], x1 - x0)
            if not dil[ya:yb + 1, xa:xb + 1].any(): continue
            a_, b_, c_, d_ = vert(j, i), vert(j, i + 1), vert(j + 1, i + 1), vert(j + 1, i)
            tris += [a_, d_, b_, b_, d_, c_]
    png = base64.b64encode(open(f'L_{name}.png', 'rb').read()).decode()
    print(name, len(verts), 'verts', len(tris) // 3, 'tris', 'bones', [names[b] for b in used])
    return {'box': [x0, y0, x1, y1], 'png': png, 'v': [c for p in verts for c in p], 'uv': [round(c, 5) for p in uvs for c in p], 'i': tris, 'si': [c for p in sk for c in p], 'sw': [c for p in sw for c in p]}
rig = {'bones': [{'n': n, 'p': p, 'x': x, 'y': y} for n, p, x, y in BONES], 'tips': TIPS,
       'layers': {'wing': layer('wing', WING_REGIONS), 'body': layer('body', REGIONS)}}
rig['arm'] = base64.b64encode(open('L_arm.png', 'rb').read()).decode()
rig['weapon'] = base64.b64encode(open('/home/claude/blacklist-introboys/public/arena/weapon.webp', 'rb').read()).decode()
json.dump(rig, open("rig.json", "w"), separators=(",", ":"), default=int)
import os; print('rig.json', os.path.getsize('rig.json') // 1024, 'KB')
