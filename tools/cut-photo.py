import sys, numpy as np, onnxruntime as ort
from PIL import Image
src, outdir = sys.argv[1:3]
im = Image.open(src).convert('RGB')                      # 8064 x 6048
x0, x1, y0, y1 = 2340 - 160, 7024 + 160, 626 - 160, 6048  # subject box, full res, padded
crop = im.crop((x0, y0, x1, y1)); W, H = crop.size
sess = ort.InferenceSession('/tmp/isnet.onnx', providers=['CPUExecutionProvider'])
def seg(img):
    x = np.asarray(img.resize((1024, 1024), Image.BILINEAR)).astype(np.float32) / 255. - 0.5
    m = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0, 0]
    return (m - m.min()) / (m.max() - m.min())
# whole subject, plus a second pass on the head and shoulders for finer hair edges
OH = 2600; OW = round(W * OH / H)
work = crop.resize((OW, OH), Image.LANCZOS)
m = np.asarray(Image.fromarray((seg(crop) * 255).astype(np.uint8)).resize((OW, OH), Image.LANCZOS)).astype(np.float32) / 255
hy = int(OH * 0.42); hx0, hx1 = 0, int(OW * 0.75)
head = work.crop((hx0, 0, hx1, hy))
mh = np.asarray(Image.fromarray((seg(head) * 255).astype(np.uint8)).resize((hx1 - hx0, hy), Image.LANCZOS)).astype(np.float32) / 255
blend = np.linspace(0, 1, 120)[:, None]
m2 = m.copy(); m2[:hy, hx0:hx1] = mh
m2[hy - 120:hy, hx0:hx1] = mh[-120:] * (1 - blend) + m[hy - 120:hy, hx0:hx1] * blend
m = m2
# guided filter (He et al.) with the photo as guide, snaps the edge to real contours
def box(a, r):
    c = np.cumsum(np.cumsum(np.pad(a, ((r + 1, r), (r + 1, r)), mode='edge'), 0), 1)
    return (c[2*r+1:, 2*r+1:] - c[:-2*r-1, 2*r+1:] - c[2*r+1:, :-2*r-1] + c[:-2*r-1, :-2*r-1]) / (2*r+1)**2
I = np.asarray(work.convert('L')).astype(np.float32) / 255
def gf(I, p, r, eps):
    mI, mp = box(I, r), box(p, r); a = (box(I*p, r) - mI*mp) / (box(I*I, r) - mI*mI + eps); b = mp - a*mI
    return box(a, r) * I + box(b, r)
q = gf(I, m, 6, 2e-3)
a = np.clip((q - 0.08) / 0.84, 0, 1)
mb = box(m, 14)
a = np.where(mb > 0.97, 1.0, a)          # deep inside the body: solid, no holes from skin or fabric texture
a = np.where(mb < 0.03, 0.0, a)          # far outside: clean wall
a = np.maximum(a, np.clip((m - 0.9) / 0.1, 0, 1))
a[-3:] = a[-4]                                            # bottom edge is the photo crop, keep it solid
rgba = np.dstack([np.asarray(work), (a * 255).astype(np.uint8)])
out = Image.fromarray(rgba, 'RGBA')
bb = out.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
out = out.crop((max(0, bb[0] - 20), max(0, bb[1] - 20), min(OW, bb[2] + 20), OH))
out.save(f'{outdir}/smile-2600.png'); print(out.size)
