"""Turn the 5 green car sprites into CarBox presets.
Green pixels = the paintable body. For each car we emit:
  assets/<id>.png       base: green -> greyscale (black/white WITH shadows),
                        every non-green pixel (glass, wheels, lights, outlines)
                        kept exactly as-is.
  assets/mask_<id>.png  opaque ONLY on the body, with tiny interior holes
                        (specular pixels the green test skips) CLOSED so light
                        cars don't show white dots.
NEW filenames (body_*) so the WebView can't serve stale cached copies.
"""
from PIL import Image
import os

ROOT = r"c:\Users\deeka\OneDrive\Desktop\CarBox"
ASSETS = os.path.join(ROOT, "app", "assets")

# source mockup number -> (asset id, label)
CARS = {
    27: ("body_sedan", "Sedan"),
    28: ("body_suv", "SUV"),
    29: ("body_coupe4", "4-door coupe"),
    30: ("body_suvcoupe", "SUV coupe"),
    31: ("body_coupe2", "2-door coupe"),
}


def is_green(r, g, b, a):
    # Body = green paint, detected by an ABSOLUTE margin on BOTH channels:
    #   green must exceed red AND blue by >= 18.
    # Real green (even dark shadows: g-r,g-b ~ 40-150) passes; neutral grey
    # glass/wheels and dark tire noise (gaps ~ 0-10) are firmly excluded, and
    # blue glass / red+yellow lights fail g>b / g>r. No dilation anywhere, so
    # nothing can bleed across the thin window/wheel borders.
    return a > 30 and (g - r) >= 18 and (g - b) >= 18


for n, (cid, label) in CARS.items():
    src = Image.open(os.path.join(ROOT, "Untitled design (%d).png" % n)).convert("RGBA")
    W, H = src.size
    sp = src.load()

    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bp = base.load()
    mp = mask.load()

    paint_px = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = sp[x, y]
            if a == 0:
                continue
            if is_green(r, g, b, a):
                L = (max(r, g, b) + min(r, g, b)) // 2   # matches painter's lumArr
                bp[x, y] = (L, L, L, a)                   # greyscale body, shading kept
                mp[x, y] = (255, 255, 255, a)             # paintable
                paint_px += 1
            else:
                bp[x, y] = (r, g, b, a)                   # keep glass/wheels/lights/outline

    bbox = base.getbbox()
    base = base.crop(bbox)
    mask = mask.crop(bbox)
    base.save(os.path.join(ASSETS, cid + ".png"))
    mask.save(os.path.join(ASSETS, "mask_" + cid + ".png"))
    print("%-16s %-14s size=%s paint_px=%d" % (cid, label, base.size, paint_px))

print("done ->", ASSETS)
