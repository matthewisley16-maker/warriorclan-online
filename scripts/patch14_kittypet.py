#!/usr/bin/env python3
"""Patch 14: restore kittypet houses as standalone enterable buildings."""
import io

p = 'src/game/world.ts'
src = io.open(p, encoding='utf-8').read()

if 'id: "smudge-house"' in src:
    print("kittypet houses already present — nothing to do")
else:
    anchor = '\n  // Farm\n  {\n    id: "barn"'
    assert src.count(anchor) == 1, "farm anchor"
    houses = (
        '\n  // ---- kittypet houses: standalone enterable buildings with their own'
        '\n  //      black doorways (walk up to the gap to step inside) ----'
        '\n  {'
        '\n    id: "smudge-house", x: t(73.6), y: t(142.2), w: t(2.2), h: t(1.7),'
        '\n    label: "Smudge\'s cozy home", interact: "twolegplace", interior: "smudge-house",'
        '\n    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },'
        '\n  },'
        '\n  {'
        '\n    id: "henry-house", x: t(59.8), y: t(142.2), w: t(2.2), h: t(1.7),'
        '\n    label: "Henry\'s house", interact: "twolegplace", interior: "henry-house",'
        '\n    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },'
        '\n  },'
        '\n  {'
        '\n    id: "princess-house", x: t(69.5), y: t(136.5), w: t(2.2), h: t(1.7),'
        '\n    label: "Princess\'s sunny house", interact: "twolegplace", interior: "princess-house",'
        '\n    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },'
        '\n  },'
        '\n  {'
        '\n    id: "marmalade-house", x: t(94.6), y: t(142.2), w: t(2.2), h: t(1.7),'
        '\n    label: "Marmalade\'s house", interact: "twolegplace", interior: "marmalade-house",'
        '\n    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },'
        '\n  },'
        '\n  {'
        '\n    id: "ginger-house", x: t(83.5), y: t(160.9), w: t(2.2), h: t(1.7),'
        '\n    label: "Ginger\'s house", interact: "twolegplace", interior: "ginger-house",'
        '\n    style: "house", solid: true, scale: 0.8, doorAt: { dx: 0, dy: 0 },'
        '\n  },'
        '\n  // Farm'
        '\n  {'
        '\n    id: "barn"'
    )
    src = src.replace(anchor, houses)
    io.open(p, 'w', encoding='utf-8').write(src)
    print("kittypet houses restored")
