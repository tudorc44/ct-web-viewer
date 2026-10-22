"""Generate manifest.json for the CT viewer's "local server" mode.

Usage (run from the folder that contains the numbered series subfolders):
    python generate_manifest.py [path-to-ct-export-folder]

Not needed for the hosted/browser mode, where you just pick the folder in the page.
"""
import json
import os
import re
import sys

CT_ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()
ORIENTATION_MAP = {"ax": "Axial", "sag": "Sagittal", "cor": "Coronal"}


def parse_folder(name):
    m = re.match(r"^(\d+)_(.*)$", name)
    return (int(m.group(1)), m.group(2)) if m else (999, name)


def guess_orientation(rest):
    low = rest.lower()
    for key, label in ORIENTATION_MAP.items():
        if re.search(rf"(^|[^a-z]){key}([^a-z]|$)", low):
            return label
    return None


series_list = []
for entry in sorted(os.listdir(CT_ROOT)):
    full = os.path.join(CT_ROOT, entry)
    if not os.path.isdir(full):
        continue
    files = sorted(f for f in os.listdir(full) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    if not files:
        continue
    idx, rest = parse_folder(entry)
    low = rest.lower()
    kind = "document" if len(files) == 1 and "protocol" in low else (
        "topogram" if "topogram" in low else "series")
    series_list.append({
        "id": f"s{idx:02d}",
        "index": idx,
        "folder": entry,
        "label": rest.strip(),
        "orientation": guess_orientation(rest),
        "kind": kind,
        "count": len(files),
        "files": files,
    })

series_list.sort(key=lambda s: s["index"])
manifest = {
    "generatedFrom": os.path.basename(CT_ROOT),
    "series": series_list,
    "totalImages": sum(s["count"] for s in series_list),
}
out_path = os.path.join(CT_ROOT, "manifest.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)

print(f"Wrote {out_path}: {len(series_list)} series, {manifest['totalImages']} images")
