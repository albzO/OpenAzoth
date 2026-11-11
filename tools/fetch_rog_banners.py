#!/usr/bin/env python3
"""
Extract the OLED banner pattern strips and the 6 preset animations from ASUS Gear Link's Azoth
page for LOCAL preview use.

The images are ASUS assets: they are downloaded to public/rog-assets/ on your own machine and are
git-ignored, never committed or redistributed. The keyboard itself always draws the original
pattern from its firmware; these files only make the browser preview look the same.

Usage:  python tools/fetch_rog_banners.py
"""
import base64
import json
import pathlib
import re
import sys
import urllib.request

BASE = "https://gearlink.asus.com/view/6787"
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "rog-assets"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "azoth-local-preview"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def asset(main_js: str, filename: str) -> bytes:
    """Resolve "/src/assets/<filename>" to its bytes (inlined data URI or hashed resource URL)."""
    m = re.search(r'"/src/assets/' + re.escape(filename) + r'":([A-Za-z_$][\w$]*)', main_js)
    if not m:
        sys.exit(f"{filename} not found; the page layout may have changed")
    d = re.search(r'[,;\s]' + re.escape(m.group(1)) + r'="([^"]+)"', main_js)
    if not d:
        sys.exit(f"definition for {filename} not found")
    val = d.group(1)
    if val.startswith("data:"):
        return base64.b64decode(val.split(",", 1)[1])
    return get("https://gearlink.asus.com" + val)


def main():
    manifest = json.loads(get(f"{BASE}/manifest.json"))
    main_js = get(f"{BASE}/main-{manifest['version']}-{manifest['bundleId']}.js").decode("utf-8", "replace")
    OUT.mkdir(parents=True, exist_ok=True)

    # banner pattern strips: banner-1..5.png -> pattern index 0..4
    for i in range(5):
        data = asset(main_js, f"banner-{i + 1}.png")
        (OUT / f"banner-{i}.png").write_bytes(data)
        print(f"banner-{i + 1}.png -> public/rog-assets/banner-{i}.png ({len(data)} bytes)")

    # preset animations, in the order the page lists them (Preset_0..5)
    lst = re.search(r'\[\{value:\w+\.Preset_0,path:"[^"]+"\}(?:,\{value:\w+\.Preset_\d,path:"[^"]+"\})*\]', main_js)
    if not lst:
        sys.exit("preset animation list not found")
    for i, jpg in enumerate(re.findall(r'path:"([^"]+)"', lst.group(0))):
        for ext in ("gif", "jpg"):
            name = jpg.rsplit(".", 1)[0] + "." + ext
            data = asset(main_js, name)
            (OUT / f"preset-{i}.{ext}").write_bytes(data)
            print(f"{name} -> public/rog-assets/preset-{i}.{ext} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
