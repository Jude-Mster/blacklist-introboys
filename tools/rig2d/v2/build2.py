# Juts v2: layered 2D rig. A bare base body and an armour costume, each cut into pieces, weighted to one shared
# skeleton (placed on the base body); the armour is fitted onto the base skeleton bone by bone.
import numpy as np, cv2, json, base64, io
from PIL import Image, ImageDraw
from scipy import ndimage
exec(open('joints.py').read()); exec(open('parts.py').read())
REF = '../ref/'
NAMES = [b[0] for b in BONES]; BI = {n: i for i, n in enumerate(NAMES)}
SEG = {n: (a, b) for n, p, a, b in BONES}
ALLOWED = {
  'body': ['pelvis', 'chest', 'head', 'thR', 'shnR', 'ftR', 'thL', 'shnL', 'ftL'],
  'armR': ['upR', 'foR'], 'handR': ['haR'], 'armL': ['upL', 'foL'], 'handL': ['haL'], 'wings': ['wingR', 'wingL'],
}
STEP, SOFT, TEX = 3, 4.0, 2   # mesh grid (px), joint softness (px), texture scale

def poly(shape, pts):
    m = Image.new('L', (shape[1], shape[0]), 0); ImageDraw.Draw(m).polygon(pts, fill=255); return np.array(m) > 0
def segdist(px, py, a, b):
    ax, ay = a; bx, by = b; vx, vy = bx - ax, by - ay; L = vx * vx + vy * vy or 1
    t = np.clip(((px - ax) * vx + (py - ay) * vy) / L, 0, 1); return np.hypot(px - ax - t * vx, py - ay - t * vy)
def sim(a0, a1, b0, b1):
    # the similarity (rotate, scale, move) taking segment a0->a1 onto b0->b1
    a0, a1, b0, b1 = map(np.array, (a0, a1, b0, b1)); va, vb = a1 - a0, b1 - b0
    s = np.linalg.norm(vb) / max(1e-6, np.linalg.norm(va)); ang = np.arctan2(vb[1], vb[0]) - np.arctan2(va[1], va[0])
    c, si = np.cos(ang) * s, np.sin(ang) * s; M = np.array([[c, -si], [si, c]])
    return lambda p: (M @ (np.asarray(p, float) - a0)) + b0

def costume(name, img, J, parts, erase, fit=None):
    im = np.array(Image.open(REF + img).convert('RGBA')).astype(np.float32); H, W = im.shape[:2]
    a = im[..., 3].copy(); a[a < 40] = 0
    for e in erase: a[poly(a.shape, e)] = 0
    a[ndimage.binary_opening(a > 0, iterations=1) == 0] = 0
    # only the character: the one solid piece (faint smoke no longer links loose bits to it), edges kept soft
    lab, n = ndimage.label(a > 90); sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    core = lab == (int(np.argmax(sizes)) + 1)
    a[~ndimage.binary_dilation(core, iterations=3)] = 0
    masks = {}
    for k, v in parts.items():
        m = np.zeros((H, W), bool)
        for pg in (v if isinstance(v[0], list) else [v]): m |= poly(a.shape, pg)
        masks[k] = m & (a > 0)
    # hands win over arms
    masks['armR'] &= ~masks['handR']; masks['armL'] &= ~masks['handL']
    body = (a > 0)
    for m in masks.values(): body &= ~m
    # paint the body in where the arms covered it (a few pixels in from what is left of the body)
    keep = body.copy()
    # only gaps inside the body's outline are filled (what was under the arm); bits of arm sticking out are dropped
    inside = ndimage.binary_fill_holes(ndimage.binary_closing(keep, iterations=7))
    hole = (masks['armR'] | masks['armL'] | masks['handR'] | masks['handL']) & inside & ~keep
    rgb = np.ascontiguousarray(im[..., :3].clip(0, 255).astype(np.uint8))
    rgb = cv2.inpaint(rgb, hole.astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
    layers = {'body': (rgb, np.where(keep | hole, a.clip(0, 255), 0))}
    for k, m in masks.items(): layers[k] = (im[..., :3].clip(0, 255).astype(np.uint8), np.where(m, a, 0))
    # where each picture's joints go on the base skeleton (the armour is fitted bone by bone)
    T = {}
    for n, (j0, j1) in SEG.items():
        if fit is None: T[n] = lambda p: np.asarray(p, float)
    if fit is not None:
        src = {'haR': 'foR', 'haL': 'foL', 'ftR': 'shnR', 'ftL': 'shnL', 'wingR': 'chest', 'wingL': 'chest', 'root': 'pelvis'}
        for n, (j0, j1) in SEG.items():
            b = src.get(n, n); s0, s1 = SEG[b]
            T[n] = sim(J[s0], J[s1], BASE[s0], BASE[s1])
    out = []
    yy, xx = np.mgrid[0:H, 0:W]
    for part, (rgbL, alpha) in layers.items():
        if alpha.max() == 0: continue
        bones = ALLOWED[part]
        segs = []
        for n in bones:
            j0, j1 = SEG[n]
            if j0 in J and j1 in J: segs.append((n, J[j0], J[j1]))
        ys, xs = np.nonzero(alpha > 0); x0, y0, x1, y1 = xs.min() - 3, ys.min() - 3, xs.max() + 4, ys.max() + 4
        x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
        sub = (slice(y0, y1), slice(x0, x1))
        d = np.stack([segdist(xx[sub], yy[sub], s0, s1) for _, s0, s1 in segs])
        lab = d.argmin(0)
        maps = [ndimage.gaussian_filter((lab == i).astype(np.float32), SOFT) for i in range(len(segs))]
        asub = alpha[sub] > 0; dil = cv2.dilate(asub.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        hh, ww = asub.shape
        gy, gx = np.mgrid[0:hh + STEP:STEP, 0:ww + STEP:STEP]; ny, nx = gy.shape
        vid = -np.ones((ny, nx), int); V, UV, SI, SW = [], [], [], []
        def vert(j, i):
            if vid[j, i] >= 0: return vid[j, i]
            X, Y = min(gx[j, i], ww - 1), min(gy[j, i], hh - 1)
            w = sorted(((float(maps[k][Y, X]), k) for k in range(len(segs))), reverse=True)[:4]
            tot = sum(v for v, _ in w) or 1; w = [(v / tot, k) for v, k in w]
            p = np.array([x0 + gx[j, i], y0 + gy[j, i]], float)
            q = sum(v * T[segs[k][0]](p) for v, k in w)          # on the base skeleton
            vid[j, i] = len(V); V.append(q); UV.append((gx[j, i] / ww, 1 - gy[j, i] / hh))
            SI.append([BI[segs[k][0]] for _, k in w] + [0] * (4 - len(w))); SW.append([round(v, 3) for v, _ in w] + [0] * (4 - len(w)))
            return vid[j, i]
        idx = []
        for j in range(ny - 1):
            for i in range(nx - 1):
                ya, yb, xa, xb = gy[j, i], min(gy[j + 1, i], hh), gx[j, i], min(gx[j, i + 1], ww)
                if not dil[ya:yb + 1, xa:xb + 1].any(): continue
                A, B, C, Dd = vert(j, i), vert(j, i + 1), vert(j + 1, i + 1), vert(j + 1, i)
                idx += [A, Dd, B, B, Dd, C]
        rgba = np.dstack([rgbL[sub], alpha[sub]]).astype(np.uint8)
        pim = Image.fromarray(rgba, 'RGBA').resize((ww * TEX, hh * TEX), Image.LANCZOS)
        buf = io.BytesIO(); pim.save(buf, 'PNG', optimize=True)
        pim.save(f'L2_{name}_{part}.png')
        out.append({'costume': name, 'part': part, 'png': base64.b64encode(buf.getvalue()).decode(),
                    'v': [round(float(c), 1) for p in V for c in p], 'uv': [round(float(c), 4) for p in UV for c in p], 'i': idx,
                    'si': [int(c) for p in SI for c in p], 'sw': [float(c) for p in SW for c in p]})
        print(name, part, len(V), 'verts', len(idx) // 3, 'tris')
    return out

layers = costume('base', 'base_isnet-general-use.png', BASE, BASE_PARTS, BASE_ERASE) + costume('armor', 'armor_cut.png', ARMOR, ARMOR_PARTS, ARMOR_ERASE, fit=True)
rig = {'bones': [{'n': n, 'p': p, 'x': BASE[a][0], 'y': BASE[a][1], 'tx': BASE[b][0], 'ty': BASE[b][1]} for n, p, a, b in BONES if a in BASE] , 'layers': layers}
# the wings have no joints on the base body: their joints are the armour's, fitted with the chest
chestT = sim(ARMOR['chest'], ARMOR['neck'], BASE['chest'], BASE['neck'])
for n, a, b in [('wingR', 'wingRr', 'wingRt'), ('wingL', 'wingLr', 'wingLt')]:
    p0, p1 = chestT(ARMOR[a]), chestT(ARMOR[b])
    rig['bones'].append({'n': n, 'p': 'chest', 'x': round(float(p0[0]), 1), 'y': round(float(p0[1]), 1), 'tx': round(float(p1[0]), 1), 'ty': round(float(p1[1]), 1)})
# order the bones as BONES (the skin indices refer to that order)
order = {n: i for i, n in enumerate(NAMES)}; rig['bones'].sort(key=lambda b: order[b['n']])
rig['weapon'] = base64.b64encode(open('/home/claude/blacklist-introboys/public/arena/weapon.webp', 'rb').read()).decode()
json.dump(rig, open('rig2.json', 'w'), separators=(',', ':'), default=int)
import os; print('rig2.json', os.path.getsize('rig2.json') // 1024, 'KB')
