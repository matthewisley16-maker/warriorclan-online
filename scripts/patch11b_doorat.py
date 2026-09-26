#!/usr/bin/env python3
"""Patch 11b: add doorAt to enterable houses (multiline + single-line)."""
import io
import re

p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

done = 0
for hid in ["rusty-house", "house-2", "house-3", "house-4", "house-5",
            "house-6", "house-7", "house-8", "house-9", "barn"]:
    # find the object start
    key = f'id: "{hid}",'
    i = src.find(key)
    assert i != -1, hid
    # find the end of this object: the closing "}," at depth
    j = src.find("},", i)
    assert j != -1, hid
    seg = src[i:j]
    if "doorAt" in seg:
        continue
    if "interior:" not in seg:
        # add interior link + doorAt (house-2..9 previously had no interior)
        interiors = {
            "house-2": "house-a", "house-3": "house-c", "house-4": "house-b",
            "house-5": "house-e", "house-6": "house-a", "house-7": "house-d",
            "house-8": "house-b", "house-9": "house-e",
        }
        if hid in interiors:
            seg = seg.replace('style: "house", solid: true,', f'interior: "{interiors[hid]}", style: "house", solid: true,')
        else:
            print(f"WARN: {hid} has no interior and none mapped")
    seg = seg.rstrip()
    if seg.endswith(","):
        seg = seg[:-1]
    seg += ', doorAt: { dx: 0, dy: 0 }'
    src = src[:i] + seg + src[j:]
    done += 1
print(f"doorAt added to {done} houses")
io.open(p, 'w', encoding='utf-8').write(src)
