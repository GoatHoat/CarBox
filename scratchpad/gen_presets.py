"""Turn the 5 green car sprites into CarBox presets.
Green pixels = the paintable body. For each car we emit:
  assets/<id>.png       base: green -> greyscale (black/white WITH shadows),
                        every non-green pixel (windows, wheels, lights, outlines)
                        left exactly as-is.
  assets/mask_<id>.png  opaque ONLY where the source was green, so UI.spritePainter
                        recolors nothing but the body.
Both are cropped to the same alpha bounding box so they stay aligned.
"""
from PIL import Image
import os

ROOT = r"c:\Users\deeka\OneDrive\Desktop\CarBox"
ASSETS = os.path.join(ROOT, "app", "assets")

# source mockup number -> (asset id, label)
CARS = {
    27: ("preset_sedan", "Sedan"),
    28: ("preset_suv", "SUV"),
    29: ("preset_coupe4", "4-door coupe"),
    30: ("preset_suvcoupe", "SUV coupe"),
    31: ("preset_coupe2", "2-door coupe"),
}

def is_green(r, g, b, a):
    # Body = green paint = green channel beats blue and isn't clearly warm.
    #   g - b >= 3        : any green dominance over blue (catches pale/light
    #                       highlights that a big margin would miss -> the
    #                       "incomplete pixels" on light cars)
    #   g >= r - 8        : excludes yellow/red lights (r > g) but keeps
    #                       warm-green highlights
    # Neutrals (windows/wheels: g==b) and blues (b>g) are excluded.
    return a > 30 and (g - b) >= 3 and g >= r - 8


for n, (cid, label) in CARS.items():
    src = Image.open(os.path.join(ROOT, "Untitled design (%d).png" % n)).convert("RGBA")
    W, H = src.size
    sp = src.load()

    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bp = base.load()
    mp = mask.load()

    green_count = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = sp[x, y]
            if a == 0:
                continue
            if is_green(r, g, b, a):
                L = (max(r, g, b) + min(r, g, b)) // 2   # matches painter's lumArr
                bp[x, y] = (L, L, L, a)                   # greyscale body, shading kept
                mp[x, y] = (255, 255, 255, a)             # paintable
                green_count += 1
            else:
                bp[x, y] = (r, g, b, a)                   # keep windows/wheels/lights/outline

    # crop both to the car's alpha bbox (trim the big transparent margin)
    bbox = base.getbbox()
    base = base.crop(bbox)
    mask = mask.crop(bbox)

    base.save(os.path.join(ASSETS, cid + ".png"))
    mask.save(os.path.join(ASSETS, "mask_" + cid + ".png"))
    print("%-16s %-14s bbox=%s size=%s green_px=%d" % (cid, label, bbox, base.size, green_count))

print("done ->", ASSETS)
