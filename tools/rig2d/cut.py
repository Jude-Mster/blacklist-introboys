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
boxes = {'body': save('body', np.where(wing, 0, a)), 'wing': save('wing', np.where(wing, a, 0))}
import json; json.dump(boxes, open('boxes.json', 'w'))
