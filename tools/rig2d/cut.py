# Cut Juts's idle frame into layers for the 2D rig: the body (one bending mesh) and the big wing (its own layer, behind)
import numpy as np, cv2
from PIL import Image, ImageDraw
im = np.array(Image.open('idle7.png').convert('RGBA')).astype(np.float32)
H, W = im.shape[:2]
def poly_mask(pts):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255); return np.array(m) > 0
a = im[..., 3].copy()
# what is not the character: the recording's spear and its aura, the mouse cursor, the halo and condor above
erase = np.zeros((H, W), bool)
erase[:, :262] = True                                    # the spearhead and its cyan aura (left of the body)
erase |= poly_mask([(255, 328), (262, 352), (288, 324), (306, 304), (300, 296), (282, 310)])   # the shaft
erase |= poly_mask([(512, 330), (560, 330), (560, 380), (512, 380)])                          # the cursor
erase |= poly_mask([(0, 0), (W, 0), (W, 196), (420, 196), (400, 205), (262, 205), (0, 205)])   # halo, condor, ribbons
a[erase] = 0
stub = poly_mask([(254, 328), (298, 300), (312, 314), (300, 334), (276, 356), (254, 356)])
outside = stub & (np.arange(W)[None, :] < 292)
a[outside] = 0
inside = stub & ~outside & (a > 0)
rgb = np.ascontiguousarray(im[..., :3].clip(0, 255).astype(np.uint8))
rgb = cv2.inpaint(rgb, inside.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
im[..., :3] = rgb
wing_poly = [(394, 232), (402, 214), (424, 194), (448, 194), (472, 212), (565, 214), (570, 242), (548, 268), (502, 292), (462, 308), (428, 320), (404, 314), (396, 298)]
wing = poly_mask(wing_poly)
def save(name, alpha):
    out = im.copy(); out[..., 3] = alpha
    ys, xs = np.nonzero(alpha > 3)
    x0, y0, x1, y1 = xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5
    crop = out[y0:y1, x0:x1]
    img = Image.fromarray(crop.clip(0, 255).astype(np.uint8), 'RGBA')
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img.save(f'L_{name}.png')
    bg = Image.new('RGBA', img.size, (90, 95, 105, 255)); bg.alpha_composite(img); bg.convert('RGB').save(f'L_{name}_v.jpg', quality=90)
    print(name, (x0, y0, x1, y1), img.size)
    return (int(x0), int(y0), int(x1), int(y1))
# 2) the armour for the arms: the crimson guard with its gold trim, laid flat along its length
vb = poly_mask([(369, 320), (388, 312), (409, 337), (411, 366), (399, 373), (380, 350), (367, 333)])
arm = im.copy(); arm[..., 3] = np.where(vb, im[..., 3], 0)
img = Image.fromarray(arm.clip(0, 255).astype(np.uint8), 'RGBA').crop((360, 305, 420, 380))
img = img.resize((img.width * 4, img.height * 4), Image.LANCZOS).rotate(56, resample=Image.BICUBIC, expand=True)
bb = img.getbbox(); img = img.crop(bb); img.save('L_arm.png'); print('arm', img.size)
boxes = {'body': save('body', np.where(wing, 0, a)), 'wing': save('wing', np.where(wing, a, 0))}
import json; json.dump(boxes, open('boxes.json', 'w'))
